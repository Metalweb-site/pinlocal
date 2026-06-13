import { query, queryOne } from '../../db/client';
import { config } from '../../config';
import { makeError } from '../../utils';

const OTP_EXPIRY_MINUTES = 2;
const OTP_MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

// ─── Rate limit key ───────────────────────────────────────────────────────────
// ─── Send OTP via MSG91 ───────────────────────────────────────────────────────
async function sendViaMSG91(phone: string, otp: string): Promise<void> {
  if (!config.msg91.authKey || !config.msg91.templateId) {
    // Dev mode — log OTP to console
    console.log(`\n📱 [OTP DEV] Phone: ${phone}  OTP: ${otp}\n`);
    return;
  }

  const digits = phone.replace(/\D/g, '');
  const mobile = digits.length === 10 ? `91${digits}` : digits;

  const res = await fetch('https://api.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      authkey: config.msg91.authKey,
      template_id: config.msg91.templateId,
      mobile,
      otp,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MSG91 error (${res.status}): ${text}`);
  }
}

// ─── Public: send OTP ─────────────────────────────────────────────────────────
export async function sendOtp(phone: string): Promise<void> {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();

  await query(
    `INSERT INTO otp_store (phone, code, expires_at, attempts)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (phone) DO UPDATE
       SET code = $2, expires_at = $3, attempts = 0`,
    [phone, otp, expiresAt]
  );

  await sendViaMSG91(phone, otp);
}

// ─── Public: verify OTP ──────────────────────────────────────────────────────
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const row = await queryOne<{
    code: string;
    expires_at: string;
    attempts: number;
  }>('SELECT code, expires_at, attempts FROM otp_store WHERE phone = $1', [phone]);

  if (!row) {
    throw makeError('otp_invalid', 'No OTP found for this number', 400);
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    throw makeError('otp_max_attempts', 'Maximum OTP attempts exceeded. Please request a new OTP.', 429);
  }

  if (new Date(row.expires_at) < new Date()) {
    await query('DELETE FROM otp_store WHERE phone = $1', [phone]);
    throw makeError('otp_expired', 'OTP has expired. Please request a new one.', 400);
  }

  if (row.code !== code) {
    await query('UPDATE otp_store SET attempts = attempts + 1 WHERE phone = $1', [phone]);
    throw makeError('otp_invalid', 'Invalid OTP code', 400);
  }

  // Valid — clean up
  await query('DELETE FROM otp_store WHERE phone = $1', [phone]);
}
