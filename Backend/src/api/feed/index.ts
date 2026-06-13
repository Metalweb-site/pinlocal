import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware';
import { query } from '../../db/client';
import { parsePage } from '../../utils';
import type { Post } from '../../types';

export async function feedRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/', async (request, reply) => {
    const q = request.query as { page?: string; category?: string; mode?: string };
    const page = parsePage(q.page);
    const limit = 20;
    const offset = (page - 1) * limit;
    const rawMode = q.mode ?? q.category ?? 'for_you';
    const mode = ['all', 'for_you', 'trending', 'viral'].includes(rawMode) ? (rawMode === 'all' ? 'for_you' : rawMode) : 'category';
    const category = mode === 'category' ? rawMode : null;

    const accessSql = mode === 'viral'
      ? `
        (
          g.type = 'open'
          OR gm.status = 'active'
          OR p.author_user_id = $1
        )
      `
      : `
        (
          EXISTS (
            SELECT 1
            FROM user_pins up
            WHERE up.pincode IN (p.pincode, g.pincode, gu.primary_pincode, au.primary_pincode)
          )
          OR gm.status = 'active'
          OR p.author_user_id = $1
          OR (g.type = 'open' AND p.engagement_score >= 25)
        )
      `;

    const posts = await query<Post>(
      `
      WITH viewer AS (
        SELECT u.*
        FROM users u
        WHERE u.id = $1
      ),
      user_pins AS (
        SELECT DISTINCT unnest(
          array_remove(ARRAY[u.primary_pincode, u.secondary_pincode]::text[], NULL)
          || COALESCE(pm.neighbor_codes, '{}')
        ) AS pincode
        FROM users u
        LEFT JOIN pincode_meta pm ON pm.pincode = u.primary_pincode
        WHERE u.id = $1
      ),
      viewer_interests AS (
        SELECT unnest(COALESCE((SELECT interests FROM viewer), '{}')) AS interest
      ),
      ranked_posts AS (
      SELECT
        p.*,
        CASE
          WHEN viral_score >= 95 THEN 'viral'
          WHEN trending_score >= 45 THEN 'trending'
          ELSE 'for_you'
        END AS ranking_label,
        CASE
          WHEN $5::text = 'viral' THEN viral_score
          WHEN $5::text = 'trending' THEN trending_score
          WHEN $5::text = 'category' THEN category_score
          ELSE for_you_score
        END AS ranking_score,
        json_build_object(
          'id', g.id,
          'name', g.name,
          'cover_image_url', g.cover_image_url,
          'category', g.category,
          'pincode', g.pincode,
          'member_count', g.member_count,
          'type', g.type,
          'default_thread_id', gt.id
        ) AS group,
        json_build_object(
          'id', au.id,
          'username', au.username,
          'avatar_url', au.avatar_url
        ) AS author,
        COALESCE(swipers.latest_swipers, '[]'::json) AS latest_swipers,
        (g.name = ('Public ' || p.pincode) AND g.type = 'open') AS is_personal_post,
        (pl.user_id IS NOT NULL) AS is_liked,
        (psv.user_id IS NOT NULL) AS is_saved,
        (gm.user_id IS NOT NULL AND gm.status = 'active') AS is_member,
        gm.role AS viewer_role
      FROM posts p
      JOIN groups g ON g.id = p.group_id
      JOIN users gu ON gu.id = g.admin_user_id
      JOIN users au ON au.id = p.author_user_id
      CROSS JOIN viewer v
      LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = $1
      LEFT JOIN post_saves psv ON psv.post_id = p.id AND psv.user_id = $1
      LEFT JOIN group_memberships gm ON gm.group_id = p.group_id AND gm.user_id = $1
      CROSS JOIN LATERAL (
        SELECT
          GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.25) AS age_hours,
          (
            p.like_count * 2.0
            + p.comment_count * 5.0
            + p.swipe_count * 6.0
            + COALESCE(p.share_count, 0) * 9.0
          ) AS base_engagement
      ) metrics
      CROSS JOIN LATERAL (
        SELECT
          (
            (SELECT COUNT(*) FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.created_at > NOW() - INTERVAL '48 hours') * 2.5
            + (SELECT COUNT(*) FROM post_comments pc2 WHERE pc2.post_id = p.id AND pc2.created_at > NOW() - INTERVAL '48 hours') * 6.0
            + (SELECT COUNT(*) FROM post_swipes ps2 WHERE ps2.post_id = p.id AND ps2.created_at > NOW() - INTERVAL '48 hours') * 7.0
          ) AS recent_engagement
      ) recent
      CROSS JOIN LATERAL (
        SELECT
          CASE WHEN EXISTS (SELECT 1 FROM user_pins up WHERE up.pincode IN (p.pincode, g.pincode, au.primary_pincode)) THEN 35.0 ELSE 0.0 END AS local_boost,
          CASE WHEN p.category IN (SELECT interest FROM viewer_interests) OR g.category IN (SELECT interest FROM viewer_interests) THEN 22.0 ELSE 0.0 END AS interest_boost,
          CASE WHEN gm.status = 'active' THEN 26.0 ELSE 0.0 END AS membership_boost,
          CASE WHEN p.author_user_id = $1 THEN 8.0 ELSE 0.0 END AS own_boost,
          CASE WHEN EXISTS (SELECT 1 FROM user_connections uc WHERE uc.follower_id = $1 AND uc.following_id = p.author_user_id) THEN 18.0 ELSE 0.0 END AS connection_boost,
          GREATEST(0.0, 36.0 - metrics.age_hours * 1.5) AS freshness_boost,
          (
            metrics.base_engagement
            + recent.recent_engagement
          ) / POWER(metrics.age_hours + 2.0, 0.72) AS velocity_score,
          (
            metrics.base_engagement
            + recent.recent_engagement * 1.6
            + COALESCE(p.share_count, 0) * 10.0
          ) / POWER(metrics.age_hours + 2.0, 0.54) AS viral_velocity
      ) signals
      CROSS JOIN LATERAL (
        SELECT
          (
            signals.local_boost
            + signals.interest_boost
            + signals.membership_boost
            + signals.connection_boost
            + signals.own_boost
            + signals.freshness_boost
            + signals.velocity_score * 9.0
            + CASE WHEN p.media_urls IS NOT NULL AND array_length(p.media_urls, 1) > 0 THEN 5.0 ELSE 0.0 END
          ) AS for_you_score,
          (
            signals.local_boost * 0.75
            + signals.velocity_score * 18.0
            + recent.recent_engagement * 1.8
            + COALESCE(p.share_count, 0) * 4.0
            + GREATEST(0.0, 24.0 - metrics.age_hours * 0.8)
          ) AS trending_score,
          (
            signals.viral_velocity * 22.0
            + COALESCE(p.share_count, 0) * 8.0
            + p.swipe_count * 2.5
            + p.comment_count * 1.8
            + CASE WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 20.0 ELSE 0.0 END
          ) AS viral_score,
          (
            signals.local_boost
            + signals.interest_boost * 0.5
            + signals.freshness_boost
            + signals.velocity_score * 8.0
            + metrics.base_engagement * 0.45
          ) AS category_score
      ) scores
      LEFT JOIN LATERAL (
        SELECT id
        FROM threads
        WHERE group_id = g.id
        ORDER BY (LOWER(name) = 'general') DESC, created_at ASC
        LIMIT 1
      ) gt ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'id', s.id,
            'username', s.username,
            'avatar_url', s.avatar_url
          )
          ORDER BY s.created_at DESC
        ) AS latest_swipers
        FROM (
          SELECT u.id, u.username, u.avatar_url, ps.created_at
          FROM post_swipes ps
          JOIN users u ON u.id = ps.user_id
          WHERE ps.post_id = p.id
          ORDER BY ps.created_at DESC
          LIMIT 3
        ) s
      ) swipers ON true
      WHERE ($2::text IS NULL OR p.category = $2)
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
        AND ${accessSql}
      )
      SELECT *
      FROM ranked_posts
      WHERE $5::text != 'viral' OR ranking_score >= 55
      ORDER BY ranking_score DESC, created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [request.user.id, category, limit + 1, offset, mode]
    );

    return reply.send({
      posts: posts.slice(0, limit),
      page,
      hasMore: posts.length > limit,
      mode,
    });
  });
}
