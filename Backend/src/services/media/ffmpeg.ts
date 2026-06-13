import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { makeError } from '../../utils';

const execFileAsync = promisify(execFile);

export type VideoProbe = {
  duration_seconds: number;
  width: number | null;
  height: number | null;
};

export function ffmpegPath() {
  return process.env.MEDIA_FFMPEG_PATH || 'ffmpeg';
}

export function ffprobePath() {
  return process.env.MEDIA_FFPROBE_PATH || 'ffprobe';
}

export async function withTempFile<T>(buffer: Buffer, ext: string, fn: (filePath: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pinlocal-media-'));
  const filePath = path.join(dir, `${randomUUID()}.${ext.replace(/^\./, '')}`);
  try {
    await fs.writeFile(filePath, buffer);
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function probeVideo(filePath: string): Promise<VideoProbe> {
  try {
    const { stdout } = await execFileAsync(ffprobePath(), [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height:format=duration',
      '-of', 'json',
      filePath,
    ], { maxBuffer: 1024 * 1024 });

    const parsed = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number }[];
      format?: { duration?: string };
    };
    const duration = Number(parsed.format?.duration ?? 0);
    return {
      duration_seconds: Number.isFinite(duration) ? duration : 0,
      width: parsed.streams?.[0]?.width ?? null,
      height: parsed.streams?.[0]?.height ?? null,
    };
  } catch {
    throw makeError('video_probe_failed', 'Video processor is not configured. Install FFmpeg/FFprobe or set MEDIA_FFMPEG_PATH and MEDIA_FFPROBE_PATH.', 503);
  }
}

export async function probeVideoBuffer(buffer: Buffer, ext: string): Promise<VideoProbe> {
  return withTempFile(buffer, ext, probeVideo);
}
