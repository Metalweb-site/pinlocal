import { Queue, Worker } from 'bullmq';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { redis } from '../../services/redis';
import { query, queryOne } from '../../db/client';
import { extensionForMime, getObjectBuffer, putObject } from '../../services/storage';
import { ffmpegPath, probeVideo } from '../../services/media/ffmpeg';
import type { MediaAsset } from '../../services/media';

const execFileAsync = promisify(execFile);

export const mediaProcessingQueue = new Queue('media-processing', { connection: redis });

type SharpInstance = {
  rotate: () => SharpInstance;
  resize: (opts: { width?: number; height?: number; fit?: string; withoutEnlargement?: boolean }) => SharpInstance;
  webp: (opts: { quality: number }) => SharpInstance;
  metadata: () => Promise<{ width?: number; height?: number }>;
  toBuffer: () => Promise<Buffer>;
};

type SharpFactory = (input: Buffer) => SharpInstance;

function loadSharp(): SharpFactory | null {
  try {
    // Optional dependency. Install sharp in production to enable image optimization.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('sharp') as SharpFactory;
  } catch {
    return null;
  }
}

function assetBase(asset: MediaAsset) {
  return `${asset.media_type}s/${asset.user_id}/${asset.id}`;
}

async function markFailed(assetId: string, message: string) {
  await query(
    `
    UPDATE media_assets
    SET status = 'failed', error_message = $2, updated_at = NOW()
    WHERE id = $1
    `,
    [assetId, message.slice(0, 500)]
  );
}

async function refreshLinkedMediaUrls(assetId: string, finalUrl: string) {
  await query(
    `
    UPDATE messages
    SET media_url = $2
    WHERE media_asset_id = $1
    `,
    [assetId, finalUrl]
  );
  await query(
    `
    UPDATE personal_messages
    SET media_url = $2
    WHERE media_asset_id = $1
    `,
    [assetId, finalUrl]
  );
  await query(
    `
    UPDATE posts
    SET media_urls = (
      SELECT array_agg(CASE WHEN asset_id = $1::uuid THEN $2 ELSE url END ORDER BY ord)
      FROM unnest(media_asset_ids, media_urls) WITH ORDINALITY AS pairs(asset_id, url, ord)
    )
    WHERE $1::uuid = ANY(media_asset_ids)
    `,
    [assetId, finalUrl]
  );
}

async function processImage(asset: MediaAsset, original: Buffer) {
  const sharp = loadSharp();
  if (!sharp) {
    await query(
      `
      UPDATE media_assets
      SET status = 'ready',
          moderation_status = 'approved',
          processed_url = original_url,
          processed_key = original_key,
          metadata = metadata || $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      `,
      [asset.id, JSON.stringify({ image_optimization: 'skipped_sharp_not_installed' })]
    );
    return;
  }

  const base = assetBase(asset);
  const image = sharp(original).rotate();
  const metadata = await image.metadata();
  const processed = await sharp(original)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const thumbnail = await sharp(original)
    .rotate()
    .resize({ width: 520, height: 520, fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 76 })
    .toBuffer();

  const processedKey = `processed/${base}.webp`;
  const thumbnailKey = `thumbnails/${base}.webp`;
  const processedUrl = await putObject(processedKey, processed, 'image/webp');
  const thumbnailUrl = await putObject(thumbnailKey, thumbnail, 'image/webp');

  await query(
    `
    UPDATE media_assets
    SET status = 'ready',
        moderation_status = 'approved',
        processed_url = $2,
        processed_key = $3,
        thumbnail_url = $4,
        thumbnail_key = $5,
        width = COALESCE($6, width),
        height = COALESCE($7, height),
        metadata = metadata || $8::jsonb,
        updated_at = NOW()
    WHERE id = $1
    `,
    [
      asset.id,
      processedUrl,
      processedKey,
      thumbnailUrl,
      thumbnailKey,
      metadata.width ?? null,
      metadata.height ?? null,
      JSON.stringify({
        image_optimization: 'webp_1600',
        thumbnail: 'webp_520_square',
        original_size_bytes: asset.size_bytes,
        processed_size_bytes: processed.length,
        thumbnail_size_bytes: thumbnail.length,
      }),
    ]
  );
  await refreshLinkedMediaUrls(asset.id, processedUrl);
}

async function processVideo(asset: MediaAsset, original: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pinlocal-video-'));
  const ext = extensionForMime(asset.mime_type);
  const input = path.join(dir, `input-${randomUUID()}.${ext}`);
  const output = path.join(dir, 'output.mp4');
  const thumbnail = path.join(dir, 'thumb.jpg');

  try {
    await fs.writeFile(input, original);
    const probe = await probeVideo(input);

    await execFileAsync(ffmpegPath(), [
      '-y',
      '-i', input,
      '-vf', 'scale=w=min(1280\\,iw):h=-2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-b:v', '1600k',
      '-maxrate', '2200k',
      '-bufsize', '3200k',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', '120',
      output,
    ], { maxBuffer: 1024 * 1024 * 8 });

    await execFileAsync(ffmpegPath(), [
      '-y',
      '-ss', '00:00:01',
      '-i', input,
      '-frames:v', '1',
      '-vf', 'scale=720:-2',
      '-q:v', '3',
      thumbnail,
    ], { maxBuffer: 1024 * 1024 * 8 });

    const [processedBuffer, thumbnailBuffer] = await Promise.all([
      fs.readFile(output),
      fs.readFile(thumbnail),
    ]);

    const base = assetBase(asset);
    const processedKey = `processed/${base}.mp4`;
    const thumbnailKey = `thumbnails/${base}.jpg`;
    const processedUrl = await putObject(processedKey, processedBuffer, 'video/mp4');
    const thumbnailUrl = await putObject(thumbnailKey, thumbnailBuffer, 'image/jpeg');

    await query(
      `
      UPDATE media_assets
      SET status = 'ready',
          moderation_status = 'approved',
          processed_url = $2,
          processed_key = $3,
          thumbnail_url = $4,
          thumbnail_key = $5,
          duration_seconds = $6,
          width = $7,
          height = $8,
          metadata = metadata || $9::jsonb,
          updated_at = NOW()
      WHERE id = $1
      `,
      [
        asset.id,
        processedUrl,
        processedKey,
        thumbnailUrl,
        thumbnailKey,
        probe.duration_seconds,
        probe.width,
        probe.height,
        JSON.stringify({
          video_transcode: 'mp4_h264_aac_720p',
          thumbnail: 'jpg_1s',
          original_size_bytes: asset.size_bytes,
          processed_size_bytes: processedBuffer.length,
          thumbnail_size_bytes: thumbnailBuffer.length,
        }),
      ]
    );
    await refreshLinkedMediaUrls(asset.id, processedUrl);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export const mediaProcessingWorker = new Worker('media-processing', async (job) => {
  const mediaId = String(job.data.mediaId ?? '');
  const asset = await queryOne<MediaAsset>(`SELECT * FROM media_assets WHERE id = $1`, [mediaId]);
  if (!asset) return;

  await query(`UPDATE media_assets SET status = 'processing', updated_at = NOW() WHERE id = $1`, [asset.id]);

  try {
    const original = await getObjectBuffer(asset.original_key);
    if (asset.media_type === 'image') await processImage(asset, original);
    else await processVideo(asset, original);
  } catch (error: any) {
    await markFailed(asset.id, error?.message ?? 'Media processing failed');
    throw error;
  }
}, { connection: redis, concurrency: 2 });
