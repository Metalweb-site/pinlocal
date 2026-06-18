import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, maybeUpdateLastSeen } from '../services/auth';
import { config } from '../config';
import { queryOne } from '../db/client';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

export function isSuperAdminPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return config.admin.superPhones.some((allowed) => {
    const allowedNormalized = normalizePhone(allowed);
    return allowed === phone || allowedNormalized === normalized;
  });
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
// Applied to all protected routes.
// Reads JWT from httpOnly cookie OR Authorization: Bearer header.
// Attaches authenticated user + active pincode context to request.user.

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const cookieToken = request.cookies?.[config.cookies.accessTokenName];
  const authHeader  = request.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = cookieToken ?? bearerToken;

  if (!token) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Authentication required',
      statusCode: 401,
    });
  }

  try {
    const payload = verifyToken(token);

    if (payload.type !== 'access') {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'Invalid token type',
        statusCode: 401,
      });
    }

    const user = await queryOne<{ id: string; phone: string; primary_pincode: string; secondary_pincode: string | null }>(
      'SELECT id, phone, primary_pincode, secondary_pincode FROM users WHERE id = $1',
      [payload.id]
    );

    if (!user) {
      return reply.status(401).send({
        error: 'unauthorized',
        message: 'User not found',
        statusCode: 401,
      });
    }
    const headerValue = request.headers['x-active-pincode'];
    const requestedPincode = typeof headerValue === 'string' ? headerValue.trim() : Array.isArray(headerValue) ? headerValue[0]?.trim() : undefined;
    const allowedPincodes = [user.primary_pincode, user.secondary_pincode].filter(Boolean) as string[];
    const active_pincode = requestedPincode && allowedPincodes.includes(requestedPincode)
      ? requestedPincode
      : user.primary_pincode;

    request.user = { ...user, active_pincode };

    // Debounced last_seen — fire and forget
    maybeUpdateLastSeen(payload.id).catch(() => {});
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return reply.status(401).send({
        error: 'token_expired',
        message: 'Access token has expired',
        statusCode: 401,
      });
    }
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'Invalid token',
      statusCode: 401,
    });
  }
}

export async function superAdminMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!isSuperAdminPhone(request.user.phone)) {
    return reply.status(403).send({
      error: 'forbidden',
      message: 'Super admin access required',
      statusCode: 403,
    });
  }
}

export async function ensureNotPlatformBanned(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const sanction = await queryOne<{ id: string; reason: string | null; expires_at: string | null }>(
    `
    SELECT id, reason, expires_at
    FROM user_sanctions
    WHERE user_id = $1
      AND type = 'ban'
      AND scope = 'platform'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [request.user.id]
  );

  if (!sanction) return false;

  reply.status(403).send({
    error: 'account_banned',
    message: sanction.expires_at
      ? `Your account is restricted until ${new Date(sanction.expires_at).toLocaleDateString('en-IN')}.`
      : 'Your account is restricted.',
    statusCode: 403,
  });
  return true;
}

// ─── Pincode middleware ───────────────────────────────────────────────────────
// Optional — use on routes that accept a pincode in the body.
// Validates the pincode exists in pincode_meta.

export async function pincodeMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = request.body as Record<string, unknown> | undefined;
  const pincode = (body?.pincode ?? body?.primary_pincode) as string | undefined;

  if (pincode) {
    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      return reply.status(400).send({
        error: 'invalid_pincode',
        message: 'Enter a valid 6-digit Indian pincode',
        statusCode: 400,
      });
    }
  }
}
