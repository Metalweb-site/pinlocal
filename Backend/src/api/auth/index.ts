import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { sendOtp, verifyOtp } from '../../services/otp';
import { getOrCreateUser, signAccessToken, signPasscodeToken, signRefreshToken, verifyToken } from '../../services/auth';
import { queryOne } from '../../db/client';
import { config } from '../../config';
import { handleServiceError } from '../../utils';
import type { User } from '../../types';

const cookieOpts = (maxAge: number) => ({
  httpOnly: true,
  secure: config.server.isProd,
  sameSite: (config.server.isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
  maxAge,
});

const ACCESS_MAX_AGE  = 30 * 86400;  // 30 days
const REFRESH_MAX_AGE = 90 * 86400;  // 90 days

function publicUser(user: User) {
  const { passcode_hash: _passcodeHash, ...safeUser } = user;
  return { ...safeUser, has_passcode: Boolean(user.passcode_hash) };
}

function verifyPasscodeValue(passcode: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(passcode, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/send-otp
  app.post('/send-otp', async (request, reply) => {
    const body = z.object({ phone: z.string().min(10).max(15) }).safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'validation_error', message: body.error.issues[0]?.message, statusCode: 400 });
    }
    try {
      await sendOtp(body.data.phone);
      return reply.send({ message: 'OTP sent' });
    } catch (err: any) {
      return handleServiceError(reply, err);
    }
  });

  // POST /api/v1/auth/verify-otp
  app.post('/verify-otp', async (request, reply) => {
    const body = z.object({
      phone: z.string().min(10).max(15),
      code:  z.string().length(6),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'validation_error', message: body.error.issues[0]?.message, statusCode: 400 });
    }

    try {
      await verifyOtp(body.data.phone, body.data.code);
      const { user, isNew } = await getOrCreateUser(body.data.phone);

      if (!isNew && user.passcode_hash) {
        return reply.send({
          passcode_required: true,
          passcode_token: signPasscodeToken(user),
          message: 'Passcode required',
        });
      }

      const accessToken  = signAccessToken(user);
      const refreshToken = signRefreshToken(user);

      reply
        .setCookie(config.cookies.accessTokenName,  accessToken,  cookieOpts(ACCESS_MAX_AGE))
        .setCookie(config.cookies.refreshTokenName, refreshToken, cookieOpts(REFRESH_MAX_AGE));

      return reply.send({ user: publicUser(user), isNew });
    } catch (err: any) {
      return handleServiceError(reply, err);
    }
  });

  app.post('/verify-passcode', async (request, reply) => {
    const body = z.object({
      passcode_token: z.string().min(10),
      passcode: z.string().regex(/^[0-9]{4,8}$/, 'Passcode must be 4 to 8 digits'),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: 'validation_error', message: body.error.issues[0]?.message, statusCode: 400 });
    }

    try {
      const payload = verifyToken(body.data.passcode_token);
      if (payload.type !== 'passcode') {
        return reply.status(401).send({ error: 'unauthorized', message: 'Invalid passcode session', statusCode: 401 });
      }

      const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [payload.id]);
      if (!user) return reply.status(401).send({ error: 'unauthorized', message: 'User not found', statusCode: 401 });

      if (!verifyPasscodeValue(body.data.passcode, user.passcode_hash)) {
        return reply.status(401).send({ error: 'invalid_passcode', message: 'Incorrect passcode', statusCode: 401 });
      }

      const accessToken  = signAccessToken(user);
      const refreshToken = signRefreshToken(user);

      reply
        .setCookie(config.cookies.accessTokenName,  accessToken,  cookieOpts(ACCESS_MAX_AGE))
        .setCookie(config.cookies.refreshTokenName, refreshToken, cookieOpts(REFRESH_MAX_AGE));

      return reply.send({ user: publicUser(user), isNew: false });
    } catch (err: any) {
      return handleServiceError(reply, err);
    }
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies?.[config.cookies.refreshTokenName];
    if (!token) {
      return reply.status(401).send({ error: 'unauthorized', message: 'No refresh token', statusCode: 401 });
    }

    try {
      const payload = verifyToken(token);
      if (payload.type !== 'refresh') throw new Error('Wrong token type');

      const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [payload.id]);
      if (!user) return reply.status(401).send({ error: 'unauthorized', message: 'User not found', statusCode: 401 });

      const newToken = signAccessToken(user);
      reply.setCookie(config.cookies.accessTokenName, newToken, cookieOpts(ACCESS_MAX_AGE));
      return reply.send({ message: 'refreshed' });
    } catch {
      return reply.status(401).send({ error: 'token_expired', message: 'Refresh token invalid or expired', statusCode: 401 });
    }
  });

  // POST /api/v1/auth/logout
  app.post('/logout', async (_request, reply) => {
    reply
      .clearCookie(config.cookies.accessTokenName,  { path: '/' })
      .clearCookie(config.cookies.refreshTokenName, { path: '/' });
    return reply.send({ message: 'logged out' });
  });
}
