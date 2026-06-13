import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne } from '../../db/client';
import { authMiddleware, superAdminMiddleware } from '../../middleware';
import { badRequest, notFound } from '../../utils';
import type { Group, Message, User } from '../../types';

const ListQuery = z.object({
  pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(),
  type: z.enum(['open', 'private', 'secret']).optional(),
  search: z.string().max(80).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const BanBody = z.object({
  days: z.coerce.number().int().min(1).max(3650),
  reason: z.string().min(10).max(1000),
});
const ReportActionBody = z.object({
  status: z.enum(['reviewed', 'actioned', 'dismissed']),
  response: z.string().min(5).max(1000),
});
const GroupModerationBody = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
  reason: z.string().min(10).max(1000),
});

async function audit(app: FastifyInstance, adminUserId: string, action: string, targetType?: string, targetId?: string, metadata: object = {}) {
  await query(
    `
    INSERT INTO admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [adminUserId, action, targetType ?? null, targetId ?? null, metadata]
  );
  app.io?.to('admin:super').emit('admin_audit_created', { action, target_type: targetType, target_id: targetId });
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', superAdminMiddleware);

  app.get('/me', async (request, reply) => {
    return reply.send({ admin: true, user: request.user });
  });

  app.get('/overview', async (_request, reply) => {
    const [totals, pincodeStats, recentUsers, recentGroups, recentAudit] = await Promise.all([
      queryOne<{
        users: number;
        active_24h: number;
        groups: number;
        open_groups: number;
        private_groups: number;
        secret_groups: number;
        posts: number;
        messages: number;
        comments: number;
        likes: number;
        pending_reports: number;
      }>(
        `
        SELECT
          (SELECT COUNT(*)::int FROM users) AS users,
          (SELECT COUNT(*)::int FROM users WHERE last_seen > NOW() - INTERVAL '24 hours') AS active_24h,
          (SELECT COUNT(*)::int FROM groups) AS groups,
          (SELECT COUNT(*)::int FROM groups WHERE type = 'open') AS open_groups,
          (SELECT COUNT(*)::int FROM groups WHERE type = 'private') AS private_groups,
          (SELECT COUNT(*)::int FROM groups WHERE type = 'secret') AS secret_groups,
          (SELECT COUNT(*)::int FROM posts) AS posts,
          (SELECT COUNT(*)::int FROM messages WHERE is_deleted = false) AS messages,
          (SELECT COUNT(*)::int FROM post_comments) AS comments,
          (SELECT COUNT(*)::int FROM post_likes) AS likes,
          (SELECT COUNT(*)::int FROM reports WHERE status = 'pending') AS pending_reports
        `
      ),
      query<{
        pincode: string;
        users: number;
        groups: number;
        open_groups: number;
        private_groups: number;
        secret_groups: number;
        posts: number;
      }>(
        `
        WITH pins AS (
          SELECT primary_pincode AS pincode FROM users WHERE primary_pincode != '000000'
          UNION
          SELECT pincode FROM groups
          UNION
          SELECT pincode FROM posts
        )
        SELECT
          pins.pincode,
          (SELECT COUNT(*)::int FROM users u WHERE u.primary_pincode = pins.pincode) AS users,
          (SELECT COUNT(*)::int FROM groups g WHERE g.pincode = pins.pincode) AS groups,
          (SELECT COUNT(*)::int FROM groups g WHERE g.pincode = pins.pincode AND g.type = 'open') AS open_groups,
          (SELECT COUNT(*)::int FROM groups g WHERE g.pincode = pins.pincode AND g.type = 'private') AS private_groups,
          (SELECT COUNT(*)::int FROM groups g WHERE g.pincode = pins.pincode AND g.type = 'secret') AS secret_groups,
          (SELECT COUNT(*)::int FROM posts p WHERE p.pincode = pins.pincode) AS posts
        FROM pins
        ORDER BY users DESC, groups DESC, posts DESC
        LIMIT 100
        `
      ),
      query<User>(
        `SELECT * FROM users ORDER BY created_at DESC LIMIT 12`
      ),
      query<Group>(
        `SELECT * FROM groups ORDER BY created_at DESC LIMIT 12`
      ),
      query(
        `
        SELECT aal.*, json_build_object('id', u.id, 'phone', u.phone, 'username', u.username) AS admin
        FROM admin_audit_logs aal
        JOIN users u ON u.id = aal.admin_user_id
        ORDER BY aal.created_at DESC
        LIMIT 20
        `
      ),
    ]);

    return reply.send({
      totals,
      pincodeStats,
      recentUsers,
      recentGroups,
      recentAudit,
    });
  });

  app.get('/reports', async (_request, reply) => {
    const reports = await query(
      `
      SELECT
        r.*,
        json_build_object('id', ru.id, 'phone', ru.phone, 'username', ru.username) AS reporter,
        CASE
          WHEN r.content_type = 'post' THEN (
            SELECT json_build_object(
              'id', p.id,
              'text', p.content_text,
              'media_urls', p.media_urls,
              'pincode', p.pincode,
              'created_at', p.created_at,
              'author', json_build_object('id', au.id, 'phone', au.phone, 'username', au.username, 'avatar_url', au.avatar_url),
              'group', json_build_object('id', g.id, 'name', g.name, 'pincode', g.pincode, 'type', g.type, 'status', g.status)
            )
            FROM posts p
            JOIN users au ON au.id = p.author_user_id
            JOIN groups g ON g.id = p.group_id
            WHERE p.id = r.content_id
          )
          WHEN r.content_type = 'message' THEN (
            SELECT json_build_object(
              'id', m.id,
              'text', m.content,
              'media_url', m.media_url,
              'is_deleted', m.is_deleted,
              'created_at', m.created_at,
              'sender', json_build_object('id', su.id, 'phone', su.phone, 'username', su.username, 'avatar_url', su.avatar_url),
              'thread', json_build_object('id', t.id, 'name', t.name),
              'group', json_build_object('id', g.id, 'name', g.name, 'pincode', g.pincode, 'type', g.type, 'status', g.status)
            )
            FROM messages m
            JOIN users su ON su.id = m.sender_id
            JOIN threads t ON t.id = m.thread_id
            JOIN groups g ON g.id = t.group_id
            WHERE m.id = r.content_id
          )
          WHEN r.content_type = 'comment' THEN (
            SELECT json_build_object(
              'id', c.id,
              'text', c.content,
              'created_at', c.created_at,
              'author', json_build_object('id', cu.id, 'phone', cu.phone, 'username', cu.username, 'avatar_url', cu.avatar_url),
              'post', json_build_object('id', p.id, 'text', p.content_text, 'pincode', p.pincode),
              'group', json_build_object('id', g.id, 'name', g.name, 'pincode', g.pincode, 'type', g.type, 'status', g.status)
            )
            FROM post_comments c
            JOIN users cu ON cu.id = c.user_id
            JOIN posts p ON p.id = c.post_id
            JOIN groups g ON g.id = p.group_id
            WHERE c.id = r.content_id
          )
          WHEN r.content_type = 'group' THEN (
            SELECT json_build_object(
              'id', g.id,
              'name', g.name,
              'description', g.description,
              'pincode', g.pincode,
              'type', g.type,
              'status', g.status,
              'admin', json_build_object('id', au.id, 'phone', au.phone, 'username', au.username)
            )
            FROM groups g
            JOIN users au ON au.id = g.admin_user_id
            WHERE g.id = r.content_id
          )
          WHEN r.content_type = 'user' THEN (SELECT json_build_object('id', u.id, 'phone', u.phone, 'username', u.username, 'pincode', u.primary_pincode) FROM users u WHERE u.id = r.content_id)
          ELSE NULL
        END AS content
      FROM reports r
      JOIN users ru ON ru.id = r.reporter_id
      ORDER BY r.created_at DESC
      LIMIT 100
      `
    );
    return reply.send({ reports });
  });

  app.patch('/reports/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = ReportActionBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const report = await queryOne<{ id: string; reporter_id: string; content_type: string }>(
      `
      UPDATE reports
      SET status = $2, admin_response = $3, actioned_by = $4, actioned_at = NOW()
      WHERE id = $1
      RETURNING id, reporter_id, content_type
      `,
      [params.id, parsed.data.status, parsed.data.response, request.user.id]
    );
    if (!report) return notFound(reply, 'Report not found');

    const message = `Your ${report.content_type} report was ${parsed.data.status}. Admin response: ${parsed.data.response}`;
    await query(
      `
      INSERT INTO notifications (user_id, type, reference_id, reference_type, custom_message)
      VALUES ($1, 'report_update', $2, 'report', $3)
      `,
      [report.reporter_id, report.id, message]
    );
    await audit(app, request.user.id, 'respond_report', 'report', params.id, parsed.data);
    app.io?.to(`user:${report.reporter_id}`).emit('notification_created', { type: 'report_update', message });
    return reply.send({ message: 'report_updated' });
  });

  app.get('/groups', async (request, reply) => {
    const parsed = ListQuery.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const groups = await query(
      `
      SELECT
        g.*,
        json_build_object('id', u.id, 'phone', u.phone, 'username', u.username, 'avatar_url', u.avatar_url) AS admin,
        (SELECT COUNT(*)::int FROM threads t WHERE t.group_id = g.id) AS thread_count,
        (SELECT COUNT(*)::int FROM group_memberships gm WHERE gm.group_id = g.id AND gm.status = 'active') AS active_members
      FROM groups g
      JOIN users u ON u.id = g.admin_user_id
      WHERE ($1::text IS NULL OR g.pincode = $1)
        AND ($2::text IS NULL OR g.type = $2)
        AND ($3::text IS NULL OR g.name ILIKE '%' || $3 || '%')
      ORDER BY g.created_at DESC
      LIMIT $4
      `,
      [parsed.data.pincode ?? null, parsed.data.type ?? null, parsed.data.search ?? null, parsed.data.limit]
    );

    return reply.send({ groups });
  });

  app.get('/users', async (request, reply) => {
    const parsed = ListQuery.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const users = await query(
      `
      SELECT
        u.*,
        (SELECT COUNT(*)::int FROM group_memberships gm WHERE gm.user_id = u.id AND gm.status = 'active') AS group_count,
        (SELECT COUNT(*)::int FROM posts p WHERE p.author_user_id = u.id) AS post_count,
        (SELECT COUNT(*)::int FROM messages m WHERE m.sender_id = u.id AND m.is_deleted = false) AS message_count
      FROM users u
      WHERE ($1::text IS NULL OR u.primary_pincode = $1)
        AND ($2::text IS NULL OR u.phone ILIKE '%' || $2 || '%' OR COALESCE(u.username, '') ILIKE '%' || $2 || '%')
      ORDER BY u.created_at DESC
      LIMIT $3
      `,
      [parsed.data.pincode ?? null, parsed.data.search ?? null, parsed.data.limit]
    );

    return reply.send({ users });
  });

  app.get('/users/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [params.id]);
    if (!user) return notFound(reply, 'User not found');

    const [groups, posts, messages, sanctions] = await Promise.all([
      query(
        `
        SELECT g.id, g.name, g.pincode, g.type, g.category, gm.role, gm.status, gm.joined_at
        FROM group_memberships gm
        JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = $1
        ORDER BY gm.joined_at DESC
        LIMIT 50
        `,
        [params.id]
      ),
      query(
        `
        SELECT id, group_id, pincode, category, content_text, like_count, comment_count, created_at
        FROM posts
        WHERE author_user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        `,
        [params.id]
      ),
      query(
        `
        SELECT m.id, m.thread_id, m.content, m.is_deleted, m.created_at, t.name AS thread_name, g.name AS group_name
        FROM messages m
        JOIN threads t ON t.id = m.thread_id
        JOIN groups g ON g.id = t.group_id
        WHERE m.sender_id = $1
        ORDER BY m.created_at DESC
        LIMIT 50
        `,
        [params.id]
      ),
      query(
        `
        SELECT *
        FROM user_sanctions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
        `,
        [params.id]
      ),
    ]);

    await audit(app, request.user.id, 'view_user_details', 'user', params.id);
    return reply.send({ user, groups, posts, messages, sanctions });
  });

  app.post('/users/:id/ban', async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = BanBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [params.id]);
    if (!user) return notFound(reply, 'User not found');

    const sanction = await queryOne<{ id: string; expires_at: string }>(
      `
      INSERT INTO user_sanctions (user_id, type, scope, expires_at, reason)
      VALUES ($1, 'ban', 'platform', NOW() + ($2::int * INTERVAL '1 day'), $3)
      RETURNING id, expires_at
      `,
      [params.id, parsed.data.days, parsed.data.reason]
    );

    const until = sanction?.expires_at ? new Date(sanction.expires_at).toLocaleDateString('en-IN') : `${parsed.data.days} days`;
    const message = `Your account has been restricted until ${until}. Reason: ${parsed.data.reason}`;
    await query(
      `
      INSERT INTO notifications (user_id, type, reference_id, reference_type, custom_message)
      VALUES ($1, 'account_sanction', $2, 'sanction', $3)
      `,
      [params.id, sanction?.id ?? null, message]
    );

    await audit(app, request.user.id, 'ban_user', 'user', params.id, {
      days: parsed.data.days,
      reason: parsed.data.reason,
      sanction_id: sanction?.id,
    });

    app.io?.to(`user:${params.id}`).emit('notification_created', {
      type: 'account_sanction',
      message,
    });

    return reply.status(201).send({ sanction, message });
  });

  app.post('/groups/:id/moderate', async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = GroupModerationBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const group = await queryOne<Group>(
      `UPDATE groups SET status = $2 WHERE id = $1 RETURNING *`,
      [params.id, parsed.data.status]
    );
    if (!group) return notFound(reply, 'Group not found');

    await audit(app, request.user.id, 'moderate_group', 'group', params.id, parsed.data);
    return reply.send({ group });
  });

  app.get('/groups/:id/threads', async (request, reply) => {
    const params = request.params as { id: string };
    const group = await queryOne<Group>('SELECT * FROM groups WHERE id = $1', [params.id]);
    if (!group) return notFound(reply, 'Group not found');

    const [threads, members] = await Promise.all([
      query(
      `
      SELECT
        t.*,
        (SELECT COUNT(*)::int FROM messages m WHERE m.thread_id = t.id AND m.is_deleted = false) AS message_count
      FROM threads t
      WHERE t.group_id = $1
      ORDER BY t.created_at ASC
      `,
      [params.id]
      ),
      query(
        `
        SELECT gm.*, json_build_object('id', u.id, 'phone', u.phone, 'username', u.username, 'avatar_url', u.avatar_url) AS user
        FROM group_memberships gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = $1
        ORDER BY gm.joined_at DESC
        `,
        [params.id]
      ),
    ]);
    await audit(app, request.user.id, 'view_group_threads', 'group', params.id);
    return reply.send({ group, threads, members });
  });

  app.get('/threads/:id/messages', async (request, reply) => {
    const params = request.params as { id: string };
    const thread = await queryOne('SELECT * FROM threads WHERE id = $1', [params.id]);
    if (!thread) return notFound(reply, 'Thread not found');

    const messages = await query<Message>(
      `
      SELECT
        m.*,
        json_build_object('id', u.id, 'phone', u.phone, 'username', u.username, 'avatar_url', u.avatar_url) AS sender
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.thread_id = $1
      ORDER BY m.created_at DESC
      LIMIT 100
      `,
      [params.id]
    );

    await audit(app, request.user.id, 'view_thread_messages', 'thread', params.id);
    return reply.send({ thread, messages: messages.reverse() });
  });
}
