import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  server: {
    port: parseInt(optional('PORT', '3001'), 10),
    nodeEnv: optional('NODE_ENV', 'development'),
    corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),
    isProd: optional('NODE_ENV', 'development') === 'production',
  },
  jwt: {
    secret: required('JWT_SECRET'),
    accessExpires: optional('JWT_ACCESS_EXPIRES', '30d'),
    refreshExpires: optional('JWT_REFRESH_EXPIRES', '90d'),
  },
  db: {
    url: required('DATABASE_URL'),
    poolMax: parseInt(optional('DB_POOL_MAX', '10'), 10),
  },
  redis: {
    url: required('REDIS_URL'),
  },
  msg91: {
    authKey: optional('MSG91_AUTH_KEY', ''),
    templateId: optional('MSG91_TEMPLATE_ID', ''),
    senderId: optional('MSG91_SENDER_ID', 'PINLOC'),
  },
  admin: {
    superPhones: optional('SUPER_ADMIN_PHONES', '')
      .split(',')
      .map((phone) => phone.trim())
      .filter(Boolean),
  },
  r2: {
    accountId: optional('R2_ACCOUNT_ID', ''),
    accessKeyId: optional('R2_ACCESS_KEY_ID', ''),
    secretAccessKey: optional('R2_SECRET_ACCESS_KEY', ''),
    bucketName: optional('R2_BUCKET_NAME', 'pinlocal-media'),
    cdnBaseUrl: optional('CDN_BASE_URL', 'https://media.yourdomain.com'),
  },
  cookies: {
    accessTokenName: 'pinlocal_token',
    refreshTokenName: 'pinlocal_refresh',
  },
} as const;
