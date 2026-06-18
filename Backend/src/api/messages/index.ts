import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../../db/client';
import { authMiddleware, ensureNotPlatformBanned } from '../../middleware';
import { badRequest, forbidden, notFound, parsePage } from '../../utils';
import type { Message } from '../../types';
import { emitBadgeCounts } from '../../services/badges';
import { publicMediaUrl, resolveOwnedMediaAssets } from '../../services/media';

const MessageBody = z.object({
  content: z.string().max(3000).optional(),
  media_url: z.string().url().optional(),
  media_asset_id: z.string().uuid().optional(),
  reply_to_id: z.string().uuid().nullable().optional(),
});
const ReactionBody = z.object({
  emoji: z.string().min(1).max(16),
});

async function canAccessThread(threadId: string, userId: string, activePincode?: string | null): Promise<boolean> {
  if (!activePincode || activePincode === '000000') return false;
  const row = await queryOne(
    `
    SELECT 1
    FROM threads t
    JOIN groups g ON g.id = t.group_id
    JOIN group_memberships gm ON gm.group_id = t.group_id
    WHERE t.id = $1
      AND gm.user_id = $2
      AND gm.status = 'active'
      AND COALESCE(g.status, 'active') = 'active'
      AND g.pincode = $3
    `,
    [threadId, userId, activePincode]
  );
  return Boolean(row);
}

async function loadMessage(messageId: string): Promise<Message | null> {
  return queryOne<Message>(
    `
    SELECT
      m.*,
      json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS sender,
      CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'content', r.content, 'sender_id', r.sender_id) END AS reply_to,
      COALESCE(reactions.reactions, '[]'::json) AS reactions
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('emoji', grouped.emoji, 'count', grouped.count)) AS reactions
      FROM (
        SELECT emoji, COUNT(*)::int AS count
        FROM message_reactions
        WHERE message_id = m.id
        GROUP BY emoji
        ORDER BY COUNT(*) DESC, emoji
      ) grouped
    ) reactions ON true
    WHERE m.id = $1
    `,
    [messageId]
  );
}

async function loadMessageReactions(messageId: string, userId: string) {
  return query<{ emoji: string; count: number; user_reacted: boolean }>(
    `
    SELECT
      mr.emoji,
      COUNT(*)::int AS count,
      BOOL_OR(mr.user_id = $2) AS user_reacted
    FROM message_reactions mr
    WHERE mr.message_id = $1
    GROUP BY mr.emoji
    ORDER BY COUNT(*) DESC, mr.emoji
    `,
    [messageId, userId]
  );
}

async function createMessage(threadId: string, senderId: string, body: z.infer<typeof MessageBody>): Promise<Message> {
  const content = body.content?.trim() || null;
  const mediaAssets = await resolveOwnedMediaAssets(body.media_asset_id ? [body.media_asset_id] : undefined, senderId);
  const mediaAsset = mediaAssets[0] ?? null;
  const mediaUrl = mediaAsset ? publicMediaUrl(mediaAsset) : (body.media_url || null);

  const messageId = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `
      INSERT INTO messages (thread_id, sender_id, content, media_url, media_asset_id, reply_to_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
      `,
      [threadId, senderId, content, mediaUrl, mediaAsset?.id ?? null, body.reply_to_id ?? null]
    );
    return inserted.rows[0].id;
  });

  const message = await loadMessage(messageId);
  if (!message) throw new Error('Message was not created');
  return message;
}

export async function messageRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/threads/:threadId/messages', async (request, reply) => {
    const params = request.params as { threadId: string };
    const q = request.query as { before?: string; page?: string };
    if (!(await canAccessThread(params.threadId, request.user.id, request.user.active_pincode))) return forbidden(reply);

    const page = parsePage(q.page);
    const limit = 30;
    const cursorSql = q.before
      ? `AND m.created_at < COALESCE((SELECT created_at FROM messages WHERE id = $2), NOW())`
      : '';
    const viewerParam = q.before ? 4 : 3;

    const messages = await query<Message>(
      `
      SELECT
        m.*,
        json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS sender,
        CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'content', r.content, 'sender_id', r.sender_id) END AS reply_to,
        COALESCE(reactions.reactions, '[]'::json) AS reactions
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN messages r ON r.id = m.reply_to_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('emoji', grouped.emoji, 'count', grouped.count, 'user_reacted', grouped.user_reacted)) AS reactions
        FROM (
          SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = $${viewerParam}) AS user_reacted
          FROM message_reactions
          WHERE message_id = m.id
          GROUP BY emoji
          ORDER BY COUNT(*) DESC, emoji
        ) grouped
      ) reactions ON true
      WHERE m.thread_id = $1 ${cursorSql}
      ORDER BY m.created_at DESC
      LIMIT $${q.before ? 3 : 2}
      `,
      q.before ? [params.threadId, q.before, limit + 1, request.user.id] : [params.threadId, limit + 1, request.user.id]
    );

    return reply.send({
      messages: messages.slice(0, limit).reverse(),
      page,
      hasMore: messages.length > limit,
    });
  });

  app.post('/threads/:threadId/messages', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { threadId: string };
    const parsed = MessageBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    if (!parsed.data.content?.trim() && !parsed.data.media_url && !parsed.data.media_asset_id) {
      return badRequest(reply, 'empty_message', 'Message must include text or media');
    }

    if (!(await canAccessThread(params.threadId, request.user.id, request.user.active_pincode))) return forbidden(reply);

    const message = await createMessage(params.threadId, request.user.id, parsed.data);
    request.server.io?.to(`thread:${params.threadId}`).emit('new_message', { message });
    const recipients = await query<{ user_id: string }>(
      `
      SELECT gm.user_id
      FROM threads t
      JOIN group_memberships gm ON gm.group_id = t.group_id
      WHERE t.id = $1 AND gm.status = 'active' AND gm.user_id != $2
      `,
      [params.threadId, request.user.id]
    );
    for (const recipient of recipients) {
      request.server.io?.to(`user:${recipient.user_id}`).emit('group_message_created', {
        thread_id: params.threadId,
        message_id: message.id,
      });
      await emitBadgeCounts(request.server.io, recipient.user_id);
    }
    return reply.status(201).send({ message });
  });

  app.post('/messages/:id/reactions', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { id: string };
    const parsed = ReactionBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid reaction');
    }

    const message = await queryOne<Message>('SELECT * FROM messages WHERE id = $1 AND is_deleted = false', [params.id]);
    if (!message) return notFound(reply, 'Message not found');
    if (!(await canAccessThread(message.thread_id, request.user.id, request.user.active_pincode))) return forbidden(reply);

    await withTransaction(async (client) => {
      const existing = await client.query<{ emoji: string }>(
        `SELECT emoji FROM message_reactions WHERE message_id = $1 AND user_id = $2`,
        [params.id, request.user.id]
      );
      if (existing.rows[0]?.emoji === parsed.data.emoji) {
        await client.query(`DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`, [params.id, request.user.id]);
        return;
      }
      await client.query(
        `
        INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (message_id, user_id)
        DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW()
        `,
        [params.id, request.user.id, parsed.data.emoji]
      );
    });

    const reactions = await loadMessageReactions(params.id, request.user.id);
    request.server.io?.to(`thread:${message.thread_id}`).emit('message_reactions_updated', {
      thread_id: message.thread_id,
      message_id: params.id,
      reactions,
    });

    return reply.send({ reactions });
  });

  app.delete('/messages/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const message = await queryOne<Message>('SELECT * FROM messages WHERE id = $1', [params.id]);
    if (!message) return notFound(reply, 'Message not found');
    if (message.sender_id !== request.user.id) return forbidden(reply);

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE messages SET is_deleted = true, content = NULL, media_url = NULL, media_asset_id = NULL WHERE id = $1`,
        [params.id]
      );
    });

    request.server.io?.to(`thread:${message.thread_id}`).emit('message_deleted', {
      thread_id: message.thread_id,
      message_id: message.id,
    });

    return reply.send({ message: 'deleted' });
  });
}
