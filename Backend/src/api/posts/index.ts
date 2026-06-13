import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../../db/client';
import { authMiddleware, ensureNotPlatformBanned } from '../../middleware';
import { badRequest, forbidden, notFound } from '../../utils';
import type { Post, PostComment } from '../../types';
import { emitBadgeCounts } from '../../services/badges';
import { publicMediaUrl, resolveOwnedMediaAssets } from '../../services/media';

const PostBody = z.object({
  group_id: z.string().uuid(),
  content_text: z.string().max(3000).optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
  media_asset_ids: z.array(z.string().uuid()).max(10).optional(),
  category: z.string().max(30).optional(),
  hashtags: z.array(z.string().max(40)).max(12).optional(),
});

const CommentBody = z.object({
  content: z.string().min(1).max(1000),
});

const RECALCULATE_POST_SCORE_SQL = `
  engagement_score =
    (like_count * 2)
    + (comment_count * 5)
    + (swipe_count * 6)
    + (COALESCE(share_count, 0) * 9)
    + GREATEST(0, 48 - EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600)
`;

async function recalculatePostScore(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }, postId: string) {
  await client.query(`UPDATE posts SET ${RECALCULATE_POST_SCORE_SQL} WHERE id = $1`, [postId]);
}

async function canAccessPost(post: Post, userId: string, primaryPincode?: string | null, secondaryPincode?: string | null) {
  if (post.author_user_id === userId) return true;
  if ([primaryPincode, secondaryPincode].includes(post.pincode)) return true;

  const membership = await queryOne(
    `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [post.group_id, userId]
  );
  return Boolean(membership);
}

export async function postRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.post('/', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const parsed = PostBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    if (!parsed.data.content_text && !(parsed.data.media_urls?.length) && !(parsed.data.media_asset_ids?.length)) {
      return badRequest(reply, 'empty_post', 'Post must include text or media');
    }

    if (!request.user.primary_pincode || request.user.primary_pincode === '000000') {
      return badRequest(reply, 'pincode_required', 'Set your pincode before posting');
    }

    let post: Post;
    try {
      post = await withTransaction(async (client) => {
        const found = await client.query<{ id: string; pincode: string; category: string }>(
          `
          SELECT g.id, g.pincode, g.category
          FROM groups g
          JOIN group_memberships gm ON gm.group_id = g.id
          WHERE g.id = $1
            AND gm.user_id = $2
            AND gm.status = 'active'
            AND gm.role IN ('admin', 'moderator')
            AND COALESCE(g.status, 'active') = 'active'
          `,
          [parsed.data.group_id, request.user.id]
        );
        const group = found.rows[0] ?? null;
        if (!group) throw new Error('group_post_forbidden');

        const effectivePincode = group.pincode === '000000' ? request.user.primary_pincode : group.pincode;
        if (group.pincode === '000000') {
          await client.query(`UPDATE groups SET pincode = $1 WHERE id = $2`, [effectivePincode, group.id]);
        }

        const cleanHashtags = (parsed.data.hashtags ?? [])
          .map(tag => tag.trim().replace(/^#/, '').toLowerCase())
          .filter(Boolean)
          .slice(0, 12);
        const content = [
          parsed.data.content_text?.trim() || null,
          cleanHashtags.length ? cleanHashtags.map(tag => `#${tag}`).join(' ') : null,
        ].filter(Boolean).join('\n\n') || null;
        const mediaAssets = await resolveOwnedMediaAssets(parsed.data.media_asset_ids, request.user.id);
        const mediaUrls = mediaAssets.length > 0
          ? mediaAssets.map(publicMediaUrl)
          : (parsed.data.media_urls ?? []);
        const mediaAssetIds = mediaAssets.map(asset => asset.id);

        const inserted = await client.query<Post>(
          `
          INSERT INTO posts (group_id, author_user_id, pincode, category, content_text, media_urls, media_asset_ids)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
          `,
          [
            group.id,
            request.user.id,
            effectivePincode,
            parsed.data.category ?? group.category,
            content,
            mediaUrls,
            mediaAssetIds,
          ]
        );
        await client.query(`UPDATE groups SET post_count = post_count + 1 WHERE id = $1`, [group.id]);
        return inserted.rows[0];
      });
    } catch (error: any) {
      if (error?.message === 'group_post_forbidden') return forbidden(reply, 'Only group admins and moderators can publish posts or events in that group');
      throw error;
    }

    return reply.status(201).send({ post });
  });

  app.post('/:id/like', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { id: string };
    const post = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [params.id]);
    if (!post) return notFound(reply, 'Post not found');

    const liked = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`,
        [params.id, request.user.id]
      );

      if (existing.rowCount) {
        await client.query(`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, [params.id, request.user.id]);
        await client.query(`UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1`, [params.id]);
        await recalculatePostScore(client, params.id);
        return false;
      }

      await client.query(`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)`, [params.id, request.user.id]);
      await client.query(`UPDATE posts SET like_count = like_count + 1 WHERE id = $1`, [params.id]);
      await recalculatePostScore(client, params.id);
      if (post.author_user_id !== request.user.id) {
        await client.query(
          `INSERT INTO notifications (user_id, type, reference_id, reference_type) VALUES ($1, 'like', $2, 'post')`,
          [post.author_user_id, params.id]
        );
      }
      return true;
    });

    const updated = await queryOne<{ like_count: number }>('SELECT like_count FROM posts WHERE id = $1', [params.id]);
    const likeCount = updated?.like_count ?? 0;
    request.server.io?.emit('post_counts_updated', {
      post_id: params.id,
      like_count: likeCount,
    });
    if (liked && post.author_user_id !== request.user.id) {
      request.server.io?.to(`user:${post.author_user_id}`).emit('notification_created', { type: 'like', reference_id: params.id });
      await emitBadgeCounts(request.server.io, post.author_user_id);
    }

    return reply.send({ liked, like_count: likeCount });
  });

  app.get('/:id/comments', async (request, reply) => {
    const params = request.params as { id: string };
    const post = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [params.id]);
    if (!post) return notFound(reply, 'Post not found');
    const canAccess = await canAccessPost(post, request.user.id, request.user.primary_pincode);
    if (!canAccess) return forbidden(reply, 'This post is not available in your pincode');

    const comments = await query<PostComment>(
      `
      SELECT pc.*, json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS user
      FROM post_comments pc
      JOIN users u ON u.id = pc.user_id
      WHERE pc.post_id = $1
      ORDER BY pc.created_at ASC
      `,
      [params.id]
    );
    return reply.send({ comments });
  });

  app.post('/:id/share', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { id: string };
    const post = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [params.id]);
    if (!post) return notFound(reply, 'Post not found');
    const canAccess = await canAccessPost(post, request.user.id, request.user.primary_pincode);
    if (!canAccess) return forbidden(reply, 'This post is not available in your pincode');

    const updated = await queryOne<{ share_count: number }>(
      `UPDATE posts SET share_count = share_count + 1 WHERE id = $1 RETURNING share_count`,
      [params.id]
    );
    await query(`UPDATE posts SET ${RECALCULATE_POST_SCORE_SQL} WHERE id = $1`, [params.id]);
    const shareCount = updated?.share_count ?? 0;

    request.server.io?.emit('post_counts_updated', {
      post_id: params.id,
      share_count: shareCount,
    });

    return reply.send({ share_count: shareCount });
  });

  app.post('/:id/save', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { id: string };
    const post = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [params.id]);
    if (!post) return notFound(reply, 'Post not found');
    const canAccess = await canAccessPost(post, request.user.id, request.user.primary_pincode);
    if (!canAccess) return forbidden(reply, 'This post is not available in your pincode');

    const saved = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT 1 FROM post_saves WHERE post_id = $1 AND user_id = $2`,
        [params.id, request.user.id]
      );

      if (existing.rowCount) {
        await client.query(`DELETE FROM post_saves WHERE post_id = $1 AND user_id = $2`, [params.id, request.user.id]);
        return false;
      }

      await client.query(`INSERT INTO post_saves (post_id, user_id) VALUES ($1, $2)`, [params.id, request.user.id]);
      return true;
    });

    return reply.send({ saved });
  });

  app.post('/:id/comments', async (request, reply) => {
    if (await ensureNotPlatformBanned(request, reply)) return;
    const params = request.params as { id: string };
    const parsed = CommentBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const post = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [params.id]);
    if (!post) return notFound(reply, 'Post not found');
    const canAccess = await canAccessPost(post, request.user.id, request.user.primary_pincode);
    if (!canAccess) return forbidden(reply, 'This post is not available in your pincode');

    const comment = await withTransaction(async (client) => {
      const inserted = await client.query<PostComment>(
        `
        INSERT INTO post_comments (post_id, user_id, content)
        VALUES ($1, $2, $3)
        RETURNING *, (
          SELECT json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url)
          FROM users u
          WHERE u.id = $2
        ) AS user
        `,
        [params.id, request.user.id, parsed.data.content]
      );
      await client.query(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, [params.id]);
      await recalculatePostScore(client, params.id);
      if (post.author_user_id !== request.user.id) {
        await client.query(
          `INSERT INTO notifications (user_id, type, reference_id, reference_type) VALUES ($1, 'reply', $2, 'post')`,
          [post.author_user_id, params.id]
        );
      }
      return inserted.rows[0];
    });

    const updated = await queryOne<{ comment_count: number }>('SELECT comment_count FROM posts WHERE id = $1', [params.id]);
    request.server.io?.emit('post_counts_updated', {
      post_id: params.id,
      comment_count: updated?.comment_count ?? 0,
    });
    if (post.author_user_id !== request.user.id) {
      request.server.io?.to(`user:${post.author_user_id}`).emit('notification_created', { type: 'reply', reference_id: params.id });
      await emitBadgeCounts(request.server.io, post.author_user_id);
    }

    return reply.status(201).send({ comment });
  });

  app.delete('/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const post = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [params.id]);
    if (!post) return notFound(reply, 'Post not found');

    const membership = await queryOne<{ role: string }>(
      `SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [post.group_id, request.user.id]
    );
    if (post.author_user_id !== request.user.id && !['admin', 'moderator'].includes(membership?.role ?? '')) {
      return forbidden(reply);
    }

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM posts WHERE id = $1`, [params.id]);
      await client.query(`UPDATE groups SET post_count = GREATEST(post_count - 1, 0) WHERE id = $1`, [post.group_id]);
    });

    return reply.send({ message: 'deleted' });
  });
}
