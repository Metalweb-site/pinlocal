import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../../db/client';
import { authMiddleware } from '../../middleware';
import { badRequest, forbidden, notFound } from '../../utils';
import type { Thread } from '../../types';

const ThreadBody = z.object({
  name: z.string().min(2).max(50),
  is_announcement: z.boolean().optional(),
});

export async function threadRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/:groupId/threads', async (request, reply) => {
    const params = request.params as { groupId: string };
    const membership = await queryOne(
      `
      SELECT 1
      FROM group_memberships gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.group_id = $1
        AND gm.user_id = $2
        AND gm.status = 'active'
        AND COALESCE(g.status, 'active') = 'active'
        AND g.pincode = $3
      `,
      [params.groupId, request.user.id, request.user.active_pincode]
    );
    if (!membership) return forbidden(reply);

    const threads = await query<Thread>(
      `
      SELECT
        t.*,
        COUNT(m.id) FILTER (
          WHERE c.last_read_msg_id IS NULL
             OR m.created_at > COALESCE((SELECT created_at FROM messages WHERE id = c.last_read_msg_id), 'epoch')
        )::int AS unread_count
      FROM threads t
      LEFT JOIN user_thread_cursors c ON c.thread_id = t.id AND c.user_id = $2
      LEFT JOIN messages m ON m.thread_id = t.id AND m.sender_id != $2 AND m.is_deleted = false
      WHERE t.group_id = $1
      GROUP BY t.id
      ORDER BY t.created_at ASC
      `,
      [params.groupId, request.user.id]
    );

    return reply.send({ threads });
  });

  app.post('/:groupId/threads', async (request, reply) => {
    const params = request.params as { groupId: string };
    const parsed = ThreadBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const membership = await queryOne<{ role: string }>(
      `
      SELECT gm.role
      FROM group_memberships gm
      JOIN groups g ON g.id = gm.group_id
      WHERE gm.group_id = $1
        AND gm.user_id = $2
        AND gm.status = 'active'
        AND COALESCE(g.status, 'active') = 'active'
        AND g.pincode = $3
      `,
      [params.groupId, request.user.id, request.user.active_pincode]
    );
    if (!membership) return forbidden(reply);
    if (!['admin', 'moderator'].includes(membership.role)) {
      return forbidden(reply, 'Only moderators can create threads');
    }
    if (parsed.data.is_announcement && !['admin', 'moderator'].includes(membership.role)) {
      return forbidden(reply, 'Only moderators can create announcement threads');
    }

    const group = await queryOne('SELECT id FROM groups WHERE id = $1', [params.groupId]);
    if (!group) return notFound(reply, 'Group not found');

    const thread = await queryOne<Thread>(
      `
      INSERT INTO threads (group_id, name, is_announcement, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [params.groupId, parsed.data.name, parsed.data.is_announcement ?? false, request.user.id]
    );

    return reply.status(201).send({ thread });
  });
}
