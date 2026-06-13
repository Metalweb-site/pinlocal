import { Queue, Worker } from 'bullmq';
import { redis } from '../../services/redis';
import { query } from '../../db/client';

export const cleanupQueue = new Queue('nightly-cleanup', { connection: redis });

export async function scheduleCleanupJob(): Promise<void> {
  await cleanupQueue.upsertJobScheduler(
    'nightly-maintenance',
    { pattern: '0 3 * * *' },
    { name: 'cleanup', data: {} }
  );
  console.log('[Jobs] Nightly cleanup job scheduled');
}

export const cleanupWorker = new Worker('nightly-cleanup', async () => {
  await query(`DELETE FROM otp_store WHERE expires_at < NOW()`);
  await query(`
    UPDATE pincode_meta pm
    SET active_users_30d = counts.count
    FROM (
      SELECT primary_pincode AS pincode, COUNT(*)::int AS count
      FROM users
      WHERE last_seen > NOW() - INTERVAL '30 days'
      GROUP BY primary_pincode
    ) counts
    WHERE pm.pincode = counts.pincode
  `);
}, { connection: redis });
