import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../../db/client';
import { authMiddleware, ensureNotPlatformBanned } from '../../middleware';
import { badRequest, forbidden, notFound, parsePage } from '../../utils';
import type { PersonalConversation, PersonalMessage, User } from '../../types';
import { emitBadgeCounts } from '../../services/badges';
import { publicMediaUrl, resolveOwnedMediaAssets } from '../../services/media';

const StartBody = z.object({
  user_id: z.string().uuid().optional(),
  phone: z.string().min(10).max(15).optional(),
  username: z.string().min(3).max(30).optional(),
}).refine(data => data.user_id || data.phone || data.username, 'Enter a user id, phone, or username');

const MessageBody = z.object({
  content: z.string().max(3000).optional(),
  media_url: z.string().url().optional(),
  media_asset_id: z.string().uuid().optional(),
});

function pair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

async function canAccessConversation(conversationId: string, userId: string, activePincode: string) {
  if (!activePincode || activePincode === '000000') return false;
  const row = await queryOne(
    `
    SELECT 1
    FROM personal_conversations c
    JOIN users ou ON ou.id = CASE WHEN c.user_one_id = $2 THEN c.user_two_id ELSE c.user_one_id END
    WHERE c.id = $1
      AND (c.user_one_id = $2 OR c.user_two_id = $2)
      AND $3 IN (ou.primary_pincode, COALESCE(ou.secondary_pincode, ''))
    `,
    [conversationId, userId, activePincode]
  );
  return Boolean(row);
}

async function loadConversation(conversationId: string, viewerId: string, activePincode: string) {
  return queryOne<PersonalConversation>(
    `
    SELECT
      c.*,
      json_build_object(
        'id', ou.id,
        'username', ou.username,
        'phone', ou.phone,
        'avatar_url', ou.avatar_url,
        'primary_pincode', ou.primary_pincode
      ) AS other_user,
      CASE WHEN lm.id IS NULL THEN NULL ELSE json_build_object(
        'id', lm.id,
        'conversation_id', lm.conversation_id,
        'sender_id', lm.sender_id,
        'content', lm.content,
        'media_url', lm.media_url,
        'is_deleted', lm.is_deleted,
        'created_at', lm.created_at
      ) END AS last_message
    FROM personal_conversations c
    JOIN users ou ON ou.id = CASE WHEN c.user_one_id = $2 THEN c.user_two_id ELSE c.user_one_id END
    LEFT JOIN LATERAL (
      SELECT *
      FROM personal_messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) lm ON true
    WHERE c.id = $1
      AND (c.user_one_id = $2 OR c.user_two_id = $2)
      AND $3 IN (ou.primary_pincode, COALESCE(ou.secondary_pincode, ''))
    `,
    [conversationId, viewerId, activePincode]
  );
}

async function loadMessage(messageId: string) {
  return queryOne<PersonalMessage>(
    `
    SELECT
      m.*,
      json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS sender
    FROM personal_messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = $1
    `,
    [messageId]
  );
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/', async (request, reply) => {
    const conversations = await query<PersonalConversation>(
      `
      SELECT
        c.*,
        json_build_object(
          'id', ou.id,
          'username', ou.username,
          'phone', ou.phone,
          'avatar_url', ou.avatar_url,
          'primary_pincode', ou.primary_pincode
        ) AS other_user,
        CASE WHEN lm.id IS NULL THEN NULL ELSE json_build_object(
          'id', lm.id,
          'conversation_id', lm.conversation_id,
          'sender_id', lm.sender_id,
          'content', lm.content,
          'media_url', lm.media_url,
          'is_deleted', lm.is_deleted,
          'created_at', lm.created_at
        ) END AS last_message
      FROM personal_conversations c
      JOIN users ou ON ou.id = CASE WHEN c.user_one_id = $1 THEN c.user_two_id ELSE c.user_one_id END
      LEFT JOIN LATERAL (
        SELECT *
        FROM personal_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) lm ON true
      WHERE (c.user_one_id = $1 OR c.user_two_id = $1)
        AND $2 IN (ou.primary_pincode, COALESCE(ou.secondary_pincode, ''))
      ORDER BY c.updated_at DESC
      `,
      [request.user.id, request.user.active_pincode]
    );

    return reply.send({ conversations });
  });

  app.get('/users/search', async (request, reply) => {
    const q = request.query as { q?: string };
    const search = q.q?.trim();
    if (!search || search.length < 2) return reply.send({ users: [] });

    const users = await query<Pick<User, 'id' | 'phone' | 'username' | 'avatar_url' | 'primary_pincode'>>(
      `
      SELECT id, phone, username, avatar_url, primary_pincode
      FROM users
      WHERE id != $1
        AND $3 IN (primary_pincode, COALESCE(secondary_pincode, ''))
        AND (
          username ILIKE $2
          OR phone ILIKE $2
        )
      ORDER BY
        username NULLS LAST,
        phone
      LIMIT 12
      `,
      [request.user.id, `%${search}%`, request.user.active_pincode]
    );

    return reply.send({ users });
  });

  app.post('/start', async (request, reply) => {
    const parsed = StartBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');

    const target = await queryOne<User>(
      `
      SELECT *
      FROM users
      WHERE id != $1
        AND $5 IN (primary_pincode, COALESCE(secondary_pincode, ''))
        AND (
          ($2::uuid IS NOT NULL AND id = $2)
          OR ($3::text IS NOT NULL AND phone = $3)
          OR ($4::text IS NOT NULL AND username = $4)
        )
      LIMIT 1
      `,
      [request.user.id, parsed.data.user_id ?? null, parsed.data.phone ?? null, parsed.data.username ?? null, request.user.active_pincode]
    );
    if (!target) return notFound(reply, 'User not found');

    const [one, two] = pair(request.user.id, target.id);
    const conversation = await queryOne<PersonalConversation>(
      `
      INSERT INTO personal_conversations (user_one_id, user_two_id)
      VALUES ($1, $2)
      ON CONFLICT (user_one_id, user_two_id) DO UPDATE SET updated_at = personal_conversations.updated_at
      RETURNING *
      `,
      [one, two]
    );
    if (!conversation) return notFound(reply, 'Conversation not found');

    const loaded = await loadConversation(conversation.id, request.user.id, request.user.active_pincode);
    return reply.status(201).send({ conversation: loaded });
  });

  app.get('/:id/messages', async (request, reply) => {
    const params = request.params as { id: string };
    const q = request.query as { before?: string; page?: string };
    if (!(await canAccessConversation(params.id, request.user.id, request.user.active_pincode))) return forbidden(reply);

    const page = parsePage(q.page);
    const limit = 30;
    const cursorSql = q.before
      ? `AND m.created_at < COALESCE((SELECT created_at FROM personal_messages WHERE id = $2), NOW())`
      : '';
    const values = q.before ? [params.id, q.before, limit + 1] : [params.id, limit + 1];

    const messages = await query<PersonalMessage>(
      `
      SELECT
        m.*,
        json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS sender
      FROM personal_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 ${cursorSql}
      ORDER BY m.created_at DESC
      LIMIT $${q.before ? 3 : 2}
      `,
      values
    );

    return reply.send({ messages: messages.slice(0, limit).reverse(), page, hasMore: messages.length > limit });
  });

  app.post('/:id/messages', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { id: string };
    const parsed = MessageBody.safeParse(request.body);
    if (!parsed.success) return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    if (!parsed.data.content?.trim() && !parsed.data.media_url && !parsed.data.media_asset_id) return badRequest(reply, 'empty_message', 'Message must include text or media');
    if (!(await canAccessConversation(params.id, request.user.id, request.user.active_pincode))) return forbidden(reply);
    const mediaAssets = await resolveOwnedMediaAssets(parsed.data.media_asset_id ? [parsed.data.media_asset_id] : undefined, request.user.id);
    const mediaAsset = mediaAssets[0] ?? null;
    const mediaUrl = mediaAsset ? publicMediaUrl(mediaAsset) : (parsed.data.media_url ?? null);

    const messageId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO personal_messages (conversation_id, sender_id, content, media_url, media_asset_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [params.id, request.user.id, parsed.data.content?.trim() || null, mediaUrl, mediaAsset?.id ?? null]
      );
      await client.query(`UPDATE personal_conversations SET updated_at = NOW() WHERE id = $1`, [params.id]);
      return inserted.rows[0].id;
    });

    const message = await loadMessage(messageId);
    const conversation = await queryOne<PersonalConversation>('SELECT * FROM personal_conversations WHERE id = $1', [params.id]);
    if (!message || !conversation) return notFound(reply, 'Message not found');

    request.server.io?.to(`user:${conversation.user_one_id}`).emit('personal_message_created', { conversation_id: params.id, message });
    request.server.io?.to(`user:${conversation.user_two_id}`).emit('personal_message_created', { conversation_id: params.id, message });
    await emitBadgeCounts(request.server.io, conversation.user_one_id);
    await emitBadgeCounts(request.server.io, conversation.user_two_id);
    return reply.status(201).send({ message });
  });

  app.patch('/:id/read', async (request, reply) => {
    const params = request.params as { id: string };
    if (!(await canAccessConversation(params.id, request.user.id, request.user.active_pincode))) return forbidden(reply);

    const latest = await queryOne<{ id: string }>(
      `
      SELECT id
      FROM personal_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [params.id]
    );

    if (!latest) return reply.send({ message: 'marked_read' });

    await query(
      `
      INSERT INTO personal_conversation_cursors (user_id, conversation_id, last_read_msg_id, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET last_read_msg_id = EXCLUDED.last_read_msg_id, updated_at = NOW()
      `,
      [request.user.id, params.id, latest.id]
    );
    await emitBadgeCounts(request.server.io, request.user.id);

    return reply.send({ message: 'marked_read', message_id: latest.id });
  });
}
