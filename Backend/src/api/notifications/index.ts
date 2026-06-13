import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware } from '../../middleware';
import { query } from '../../db/client';
import { badRequest, parsePage } from '../../utils';
import type { Notification } from '../../types';
import { emitBadgeCounts } from '../../services/badges';

function notificationMessage(type: string): string {
  switch (type) {
    case 'join_approved':
      return 'Your group join request was approved.';
    case 'join_request':
      return 'Someone requested to join your group.';
    case 'reply':
      return 'Someone commented on your post.';
    case 'mention':
      return 'Someone mentioned you.';
    case 'post_milestone':
      return 'Your post is getting attention.';
    case 'like':
      return 'Someone liked your post.';
    case 'account_sanction':
      return 'Your account has a moderation restriction.';
    case 'report_update':
      return 'Your report has been reviewed.';
    default:
      return 'New update available in your group.';
  }
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/settings', async (request, reply) => {
    const settings = await query(
      `
      INSERT INTO user_notification_settings (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING *
      `,
      [request.user.id]
    );

    const mutedGroups = await query(
      `
      SELECT gp.group_id, gp.preference, g.name, g.cover_image_url, g.pincode
      FROM user_group_notif_prefs gp
      JOIN groups g ON g.id = gp.group_id
      WHERE gp.user_id = $1
      ORDER BY gp.updated_at DESC
      `,
      [request.user.id]
    );

    const mutedChats = await query(
      `
      SELECT
        cp.conversation_id,
        cp.preference,
        json_build_object(
          'id', ou.id,
          'username', ou.username,
          'phone', ou.phone,
          'avatar_url', ou.avatar_url,
          'primary_pincode', ou.primary_pincode
        ) AS other_user
      FROM personal_conversation_notif_prefs cp
      JOIN personal_conversations c ON c.id = cp.conversation_id
      JOIN users ou ON ou.id = CASE WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END
      WHERE cp.user_id = $1
      ORDER BY cp.updated_at DESC
      `,
      [request.user.id]
    );

    return reply.send({
      settings: settings[0],
      group_prefs: mutedGroups,
      chat_prefs: mutedChats,
    });
  });

  app.patch('/settings', async (request, reply) => {
    const parsed = z.object({
      push_enabled: z.boolean().optional(),
      email_enabled: z.boolean().optional(),
      group_updates_enabled: z.boolean().optional(),
      chat_messages_enabled: z.boolean().optional(),
      activity_enabled: z.boolean().optional(),
      quiet_hours_enabled: z.boolean().optional(),
      quiet_hours_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
      quiet_hours_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    }).safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const data = parsed.data;
    await query(
      `INSERT INTO user_notification_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [request.user.id]
    );

    const fields = [
      'push_enabled',
      'email_enabled',
      'group_updates_enabled',
      'chat_messages_enabled',
      'activity_enabled',
      'quiet_hours_enabled',
      'quiet_hours_start',
      'quiet_hours_end',
    ] as const;
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const field of fields) {
      if (field in data) {
        sets.push(`${field} = $${idx++}`);
        values.push(data[field]);
      }
    }
    values.push(request.user.id);
    const settings = await query(
      sets.length
        ? `UPDATE user_notification_settings SET ${sets.join(', ')}, updated_at = NOW() WHERE user_id = $${idx} RETURNING *`
        : `SELECT * FROM user_notification_settings WHERE user_id = $${idx}`,
      values
    );

    await emitBadgeCounts(request.server.io, request.user.id);
    return reply.send({ settings: settings[0] });
  });

  app.patch('/settings/groups/:groupId', async (request, reply) => {
    const params = request.params as { groupId: string };
    const parsed = z.object({ preference: z.enum(['all', 'muted']) }).safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'validation_error', 'Invalid group notification preference');

    const pref = await query(
      `
      INSERT INTO user_group_notif_prefs (user_id, group_id, preference, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, group_id)
      DO UPDATE SET preference = EXCLUDED.preference, updated_at = NOW()
      RETURNING *
      `,
      [request.user.id, params.groupId, parsed.data.preference]
    );
    await emitBadgeCounts(request.server.io, request.user.id);
    return reply.send({ preference: pref[0] });
  });

  app.patch('/settings/chats/:conversationId', async (request, reply) => {
    const params = request.params as { conversationId: string };
    const parsed = z.object({ preference: z.enum(['all', 'muted']) }).safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'validation_error', 'Invalid chat notification preference');

    const pref = await query(
      `
      INSERT INTO personal_conversation_notif_prefs (user_id, conversation_id, preference, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET preference = EXCLUDED.preference, updated_at = NOW()
      RETURNING *
      `,
      [request.user.id, params.conversationId, parsed.data.preference]
    );
    await emitBadgeCounts(request.server.io, request.user.id);
    return reply.send({ preference: pref[0] });
  });

  app.get('/', async (request, reply) => {
    const q = request.query as { page?: string; limit?: string };
    const page = parsePage(q.page);
    const limit = Math.min(Math.max(Number(q.limit ?? 10) || 10, 1), 50);
    const offset = (page - 1) * limit;

    const notifications = await query<Notification>(
      `
      SELECT *
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [request.user.id, limit + 1, offset]
    );

    const [totalRow] = await query<{ total: number; unread: number }>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_read = false)::int AS unread
      FROM notifications
      WHERE user_id = $1
      `,
      [request.user.id]
    );

    const counts = await query<{ type: string; count: number }>(
      `
      SELECT type, COUNT(*)::int AS count
      FROM notifications
      WHERE user_id = $1
      GROUP BY type
      `,
      [request.user.id]
    );

    const pageItems = notifications.slice(0, limit);
    return reply.send({
      notifications: pageItems.map((n) => ({ ...n, message: n.custom_message ?? notificationMessage(n.type) })),
      page,
      limit,
      hasMore: notifications.length > limit,
      counts: {
        total: totalRow?.total ?? 0,
        unread: totalRow?.unread ?? 0,
        byType: Object.fromEntries(counts.map(row => [row.type, row.count])),
      },
    });
  });

  app.patch('/read', async (request, reply) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    await query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1 AND id = ANY($2::uuid[])
      `,
      [request.user.id, parsed.data.ids]
    );
    await emitBadgeCounts(request.server.io, request.user.id);

    return reply.send({ message: 'marked_read', ids: parsed.data.ids });
  });

  app.patch('/read-all', async (request, reply) => {
    await query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [request.user.id]);
    await emitBadgeCounts(request.server.io, request.user.id);
    return reply.send({ message: 'marked_read' });
  });
}
