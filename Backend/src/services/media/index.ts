import { randomUUID } from 'crypto';
import { query, queryOne } from '../../db/client';
import { makeError } from '../../utils';
import { mediaProcessingQueue } from '../../jobs/media';
import { MAX_VIDEO_DURATION_SECONDS, extensionForMime, uploadFile, validateUpload } from '../storage';
import { probeVideoBuffer } from './ffmpeg';

export type MediaStatus = 'uploaded' | 'processing' | 'ready' | 'failed' | 'rejected';
export type MediaAsset = {
  id: string;
  user_id: string;
  media_type: 'image' | 'video';
  mime_type: string;
  original_url: string;
  original_key: string;
  processed_url: string | null;
  processed_key: string | null;
  thumbnail_url: string | null;
  thumbnail_key: string | null;
  status: MediaStatus;
  moderation_status: 'pending' | 'approved' | 'rejected' | 'review';
  size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function createMediaAsset(userId: string, mimetype: string, buffer: Buffer): Promise<MediaAsset> {
  await validateUpload(mimetype, buffer.length);
  let videoProbe: { duration_seconds: number; width: number | null; height: number | null } | null = null;
  if (mimetype.startsWith('video/')) {
    videoProbe = await probeVideoBuffer(buffer, extensionForMime(mimetype));
    if (videoProbe.duration_seconds > MAX_VIDEO_DURATION_SECONDS) {
      throw makeError('video_too_long', `Videos must be ${MAX_VIDEO_DURATION_SECONDS} seconds or shorter`, 413);
    }
  }
  const uploaded = await uploadFile(userId, mimetype, buffer);

  const media = await queryOne<MediaAsset>(
    `
    INSERT INTO media_assets (
      id, user_id, media_type, mime_type, original_url, original_key,
      status, moderation_status, size_bytes, duration_seconds, width, height
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', 'pending', $7, $8, $9, $10)
    RETURNING *
    `,
    [
      randomUUID(),
      userId,
      uploaded.media_type,
      mimetype,
      uploaded.url,
      uploaded.key,
      buffer.length,
      videoProbe?.duration_seconds ?? null,
      videoProbe?.width ?? null,
      videoProbe?.height ?? null,
    ]
  );

  if (!media) throw makeError('media_create_failed', 'Could not create media record', 500);

  await mediaProcessingQueue.add(
    'process',
    { mediaId: media.id },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 }
  );

  await query(`UPDATE media_assets SET status = 'processing', updated_at = NOW() WHERE id = $1`, [media.id]);
  return { ...media, status: 'processing' };
}

export async function getMediaAssetForUser(mediaId: string, userId: string): Promise<MediaAsset | null> {
  return queryOne<MediaAsset>(
    `SELECT * FROM media_assets WHERE id = $1 AND user_id = $2`,
    [mediaId, userId]
  );
}

export async function resolveOwnedMediaAssets(mediaIds: string[] | undefined, userId: string): Promise<MediaAsset[]> {
  const ids = Array.from(new Set((mediaIds ?? []).filter(Boolean)));
  if (ids.length === 0) return [];

  const assets = await query<MediaAsset>(
    `
    SELECT *
    FROM media_assets
    WHERE id = ANY($1::uuid[])
      AND user_id = $2
      AND status IN ('processing','ready')
      AND moderation_status != 'rejected'
    ORDER BY array_position($1::uuid[], id)
    `,
    [ids, userId]
  );

  if (assets.length !== ids.length) {
    throw makeError('invalid_media_asset', 'One or more media assets are unavailable', 400);
  }

  return assets;
}

export function publicMediaUrl(asset: Pick<MediaAsset, 'processed_url' | 'original_url'>): string {
  return asset.processed_url ?? asset.original_url;
}

export function serializeMediaAsset(media: MediaAsset) {
  return {
    asset_id: media.id,
    url: media.processed_url ?? media.original_url,
    original_url: media.original_url,
    processed_url: media.processed_url,
    thumbnail_url: media.thumbnail_url,
    media_type: media.media_type,
    mime_type: media.mime_type,
    size_bytes: media.size_bytes,
    duration_seconds: media.duration_seconds,
    width: media.width,
    height: media.height,
    status: media.status,
    moderation_status: media.moderation_status,
    error_message: media.error_message,
  };
}
