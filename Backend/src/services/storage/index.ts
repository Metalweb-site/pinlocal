import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { config } from '../../config';
import { makeError } from '../../utils';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 120;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function extensionForMime(mimetype: string): string {
  return MIME_TO_EXT[mimetype] ?? 'bin';
}

export type UploadedMedia = {
  url: string;
  media_type: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  key: string;
};

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!config.r2.accountId || !config.r2.accessKeyId || !config.r2.secretAccessKey) {
    throw makeError('storage_not_configured', 'Media storage is not configured', 503);
  }

  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
  }

  return client;
}

export async function validateUpload(mimetype: string, sizeBytes: number): Promise<void> {
  if (!MIME_TO_EXT[mimetype]) {
    throw makeError('invalid_media_type', 'Supported uploads: JPG, PNG, WEBP, GIF, AVIF, MP4, WEBM, MOV', 400);
  }

  const max = mimetype.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (sizeBytes > max) {
    const label = mimetype.startsWith('image/') ? 'Images must be 10MB or smaller' : 'Videos must be 50MB or smaller';
    throw makeError('file_too_large', label, 413);
  }
}

function hasSignature(mimetype: string, buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === 'image/gif') return buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  if (mimetype === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mimetype === 'video/webm') return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));

  if (mimetype === 'video/mp4' || mimetype === 'video/quicktime' || mimetype === 'image/avif') {
    const brand = buffer.subarray(4, 8).toString('ascii');
    if (brand !== 'ftyp') return false;
    const brands = buffer.subarray(8, Math.min(buffer.length, 32)).toString('ascii');
    if (mimetype === 'image/avif') return brands.includes('avif') || brands.includes('avis');
    if (mimetype === 'video/quicktime') return brands.includes('qt  ');
    return ['mp4', 'isom', 'iso2', 'avc1', 'M4V', 'MSNV'].some(item => brands.includes(item));
  }

  return false;
}

export async function uploadFile(userId: string, mimetype: string, buffer: Buffer): Promise<UploadedMedia> {
  await validateUpload(mimetype, buffer.length);
  if (!hasSignature(mimetype, buffer)) {
    throw makeError('invalid_media_file', 'The uploaded file does not match its media type', 400);
  }

  const mediaType = mimetype.startsWith('image/') ? 'image' : 'video';
  const ext = MIME_TO_EXT[mimetype];
  const key = `${mediaType}s/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

  await putObject(key, buffer, mimetype);

  return {
    url: `${config.r2.cdnBaseUrl.replace(/\/$/, '')}/${key}`,
    media_type: mediaType,
    mime_type: mimetype,
    size_bytes: buffer.length,
    key,
  };
}

export async function putObject(key: string, buffer: Buffer, contentType: string): Promise<string> {
  await getClient().send(new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return `${config.r2.cdnBaseUrl.replace(/\/$/, '')}/${key}`;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const result = await getClient().send(new GetObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
  }));
  const chunks: Buffer[] = [];
  const body = result.Body as NodeJS.ReadableStream | undefined;
  if (!body) return Buffer.alloc(0);
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteFile(cdnUrl: string): Promise<void> {
  const base = config.r2.cdnBaseUrl.replace(/\/$/, '');
  if (!cdnUrl.startsWith(`${base}/`)) return;

  const key = cdnUrl.slice(base.length + 1);
  await getClient().send(new DeleteObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
  }));
}
