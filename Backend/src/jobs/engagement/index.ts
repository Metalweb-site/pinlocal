import { Queue, Worker } from 'bullmq';
import { redis } from '../../services/redis';
import { query } from '../../db/client';

export const engagementQueue = new Queue('engagement-score', { connection: redis });

export async function scheduleEngagementJob(): Promise<void> {
  await engagementQueue.upsertJobScheduler(
    'hourly-engagement-score',
    { every: 60 * 60 * 1000 },
    { name: 'recalculate', data: {} }
  );
  console.log('[Jobs] Engagement score job scheduled');
}

export const engagementWorker = new Worker('engagement-score', async () => {
  await query(`
    UPDATE posts
    SET engagement_score =
      (like_count * 2)
      + (comment_count * 5)
      + (swipe_count * 6)
      + (COALESCE(share_count, 0) * 9)
      + GREATEST(0, 48 - EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)
  `);

  await query(`
    UPDATE groups g
    SET engagement_score = COALESCE((
      SELECT AVG(p.engagement_score)
      FROM posts p
      WHERE p.group_id = g.id
        AND p.created_at > NOW() - INTERVAL '30 days'
    ), 0)
  `);
}, { connection: redis });
