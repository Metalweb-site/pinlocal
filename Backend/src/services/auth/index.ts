import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { query, queryOne } from '../../db/client';
import { redis } from '../redis';
import type { User } from '../../types';

export interface JwtPayload {
  id: string;
  phone: string;
  primary_pincode: string;
  type: 'access' | 'refresh' | 'passcode';
}

const LAST_SEEN_TTL = 300; // 5 minutes debounce

// ─── JWT ─────────────────────────────────────────────────────────────────────

export function signAccessToken(user: User): string {
  return jwt.sign(
    { id: user.id, phone: user.phone, primary_pincode: user.primary_pincode, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpires as any }
  );
}

export function signRefreshToken(user: User): string {
  return jwt.sign(
    { id: user.id, phone: user.phone, primary_pincode: user.primary_pincode, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpires as any }
  );
}

export function signPasscodeToken(user: User): string {
  return jwt.sign(
    { id: user.id, phone: user.phone, primary_pincode: user.primary_pincode, type: 'passcode' },
    config.jwt.secret,
    { expiresIn: '10m' }
  );
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

// ─── User upsert ─────────────────────────────────────────────────────────────

export async function getOrCreateUser(phone: string): Promise<{ user: User; isNew: boolean }> {
  const existing = await queryOne<User>('SELECT * FROM users WHERE phone = $1', [phone]);
  if (existing) {
    return { user: existing, isNew: false };
  }

  // New user — placeholder pincode until onboarding
  const newUser = await queryOne<User>(
    `INSERT INTO users (phone, primary_pincode) VALUES ($1, '000000') RETURNING *`,
    [phone]
  );
  return { user: newUser!, isNew: true };
}

// ─── last_seen debounce ───────────────────────────────────────────────────────

export async function maybeUpdateLastSeen(userId: string): Promise<void> {
  const key = `last_seen:${userId}`;
  const exists = await redis.exists(key);
  if (!exists) {
    await redis.set(key, '1', 'EX', LAST_SEEN_TTL);
    query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]).catch(() => {});
  }
}
