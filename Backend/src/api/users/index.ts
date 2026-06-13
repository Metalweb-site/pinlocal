import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { authMiddleware } from '../../middleware';
import { query, queryOne } from '../../db/client';
import { notFound, badRequest, parsePage } from '../../utils';
import type { Post, User } from '../../types';
import { getBadgeCounts } from '../../services/badges';

const PatchBody = z.object({
  username:          z.string().min(3).max(30).optional(),
  avatar_url:        z.string().url().optional(),
  cover_image_url:   z.string().url().nullable().optional(),
  bio:               z.string().max(240).nullable().optional(),
  location_text:     z.string().max(120).nullable().optional(),
  website_url:       z.string().url().nullable().optional(),
  primary_pincode:   z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit Indian pincode').optional(),
  secondary_pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit Indian pincode').nullable().optional(),
  interests:         z.array(z.string()).optional(),
});

const DetectPincodeQuery = z.object({
  lat: z.coerce.number().min(6).max(38),
  lng: z.coerce.number().min(68).max(98),
});

const SearchUsersQuery = z.object({
  q: z.string().trim().min(1).max(40).optional(),
});

const PasscodeBody = z.object({
  passcode: z.string().regex(/^[0-9]{4,8}$/, 'Passcode must be 4 to 8 digits'),
});

const POST_SELECT = `
  p.*,
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
`;

const POST_JOINS = `
  JOIN groups g ON g.id = p.group_id
  JOIN users au ON au.id = p.author_user_id
  LEFT JOIN LATERAL (
    SELECT id
    FROM threads
    WHERE group_id = g.id
    ORDER BY (LOWER(name) = 'general') DESC, created_at ASC
    LIMIT 1
  ) gt ON true
  LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = $1
  LEFT JOIN post_saves psv ON psv.post_id = p.id AND psv.user_id = $1
  LEFT JOIN group_memberships gm ON gm.group_id = p.group_id AND gm.user_id = $1
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
`;

function extractIndianPincode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b[1-9][0-9]{5}\b/);
  return match?.[0] ?? null;
}

function publicUser(user: User) {
  const { passcode_hash: _passcodeHash, ...safeUser } = user;
  return { ...safeUser, has_passcode: Boolean(user.passcode_hash) };
}

function hashPasscode(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(passcode, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

async function reverseGeocodePincode(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('zoom', '18');

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PinLocal/1.0 (pincode detection)',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = await res.json() as {
      address?: { postcode?: string; country_code?: string };
      display_name?: string;
    };
    if (data.address?.country_code && data.address.country_code.toLowerCase() !== 'in') return null;

    return extractIndianPincode(data.address?.postcode) ?? extractIndianPincode(data.display_name);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  // GET /api/v1/users/me
  app.get('/me', async (request, reply) => {
    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [request.user.id]);
    if (!user) return notFound(reply, 'User not found');
    return reply.send({ user: publicUser(user) });
  });

  app.patch('/me/passcode', async (request, reply) => {
    const parsed = PasscodeBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid passcode');
    }

    const user = await queryOne<User>(
      'UPDATE users SET passcode_hash = $1 WHERE id = $2 RETURNING *',
      [hashPasscode(parsed.data.passcode), request.user.id]
    );
    if (!user) return notFound(reply, 'User not found');
    return reply.send({ user: publicUser(user), has_passcode: true });
  });

  app.get('/detect-pincode', async (request, reply) => {
    const parsed = DetectPincodeQuery.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, 'invalid_location', 'Location must be inside India');
    }

    const pincode = await reverseGeocodePincode(parsed.data.lat, parsed.data.lng);
    if (!pincode) {
      return reply.status(404).send({
        error: 'pincode_not_found',
        message: 'Could not detect pincode for this location',
        statusCode: 404,
      });
    }

    return reply.send({ pincode });
  });

  app.get('/badges', async (request, reply) => {
    return reply.send({ badges: await getBadgeCounts(request.user.id) });
  });

  app.get('/me/stats', async (request, reply) => {
    const stats = await queryOne<{
      posts: string;
      groups: string;
      following: string;
      followers: string;
      events_attended: string;
    }>(
      `
      SELECT
        (SELECT COUNT(*) FROM posts WHERE author_user_id = $1)::text AS posts,
        (SELECT COUNT(*) FROM group_memberships WHERE user_id = $1 AND status = 'active')::text AS groups,
        (SELECT COUNT(*) FROM user_connections WHERE follower_id = $1)::text AS following,
        (SELECT COUNT(*) FROM user_connections WHERE following_id = $1)::text AS followers,
        0::text AS events_attended
      `,
      [request.user.id]
    );

    return reply.send({
      stats: {
        posts: Number(stats?.posts ?? 0),
        groups: Number(stats?.groups ?? 0),
        following: Number(stats?.following ?? 0),
        followers: Number(stats?.followers ?? 0),
        events_attended: Number(stats?.events_attended ?? 0),
      },
    });
  });

  app.get('/me/connections', async (request, reply) => {
    const following = await query(
      `
      SELECT
        u.id,
        u.phone,
        u.username,
        u.avatar_url,
        u.cover_image_url,
        u.bio,
        u.location_text,
        u.website_url,
        u.primary_pincode,
        uc.created_at AS followed_at,
        TRUE AS is_following,
        EXISTS (
          SELECT 1 FROM user_connections back
          WHERE back.follower_id = u.id AND back.following_id = $1
        ) AS follows_you,
        (SELECT COUNT(*) FROM user_connections x WHERE x.following_id = u.id)::int AS follower_count
      FROM user_connections uc
      JOIN users u ON u.id = uc.following_id
      WHERE uc.follower_id = $1
      ORDER BY uc.created_at DESC
      LIMIT 50
      `,
      [request.user.id]
    );

    const followers = await query(
      `
      SELECT
        u.id,
        u.phone,
        u.username,
        u.avatar_url,
        u.primary_pincode,
        uc.created_at AS followed_at,
        EXISTS (
          SELECT 1 FROM user_connections back
          WHERE back.follower_id = $1 AND back.following_id = u.id
        ) AS is_following,
        TRUE AS follows_you,
        (SELECT COUNT(*) FROM user_connections x WHERE x.following_id = u.id)::int AS follower_count
      FROM user_connections uc
      JOIN users u ON u.id = uc.follower_id
      WHERE uc.following_id = $1
      ORDER BY uc.created_at DESC
      LIMIT 50
      `,
      [request.user.id]
    );

    const suggestions = await query(
      `
      SELECT
        u.id,
        u.phone,
        u.username,
        u.avatar_url,
        u.primary_pincode,
        FALSE AS is_following,
        FALSE AS follows_you,
        (SELECT COUNT(*) FROM user_connections x WHERE x.following_id = u.id)::int AS follower_count
      FROM users me
      JOIN users u ON u.id != me.id
      WHERE me.id = $1
        AND u.primary_pincode = me.primary_pincode
        AND NOT EXISTS (
          SELECT 1 FROM user_connections uc
          WHERE uc.follower_id = $1 AND uc.following_id = u.id
        )
      ORDER BY u.created_at DESC
      LIMIT 12
      `,
      [request.user.id]
    );

    return reply.send({ following, followers, suggestions });
  });

  app.get('/me/posts', async (request, reply) => {
    const q = request.query as { page?: string };
    const page = parsePage(q.page);
    const limit = 20;
    const offset = (page - 1) * limit;

    const posts = await query<Post>(
      `
      SELECT ${POST_SELECT}
      FROM posts p
      ${POST_JOINS}
      WHERE p.author_user_id = $1
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [request.user.id, limit + 1, offset]
    );

    return reply.send({
      posts: posts.slice(0, limit),
      page,
      hasMore: posts.length > limit,
    });
  });

  app.get('/search', async (request, reply) => {
    const parsed = SearchUsersQuery.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid search');
    }

    const search = parsed.data.q?.trim() ?? '';
    if (!search) return reply.send({ users: [] });

    const users = await query(
      `
      SELECT
        u.id,
        u.phone,
        u.username,
        u.avatar_url,
        u.primary_pincode,
        EXISTS (
          SELECT 1 FROM user_connections uc
          WHERE uc.follower_id = $1 AND uc.following_id = u.id
        ) AS is_following,
        EXISTS (
          SELECT 1 FROM user_connections uc
          WHERE uc.follower_id = u.id AND uc.following_id = $1
        ) AS follows_you,
        (SELECT COUNT(*) FROM user_connections x WHERE x.following_id = u.id)::int AS follower_count
      FROM users u
      WHERE u.id != $1
        AND (
          u.username ILIKE $2
          OR u.phone ILIKE $2
          OR u.primary_pincode ILIKE $2
        )
      ORDER BY
        (u.primary_pincode = (SELECT primary_pincode FROM users WHERE id = $1)) DESC,
        u.username ASC NULLS LAST,
        u.created_at DESC
      LIMIT 20
      `,
      [request.user.id, `%${search}%`]
    );

    return reply.send({ users });
  });

  app.get('/:id/public', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const profile = await queryOne(
      `
      SELECT
        u.id,
        u.username,
        u.avatar_url,
        u.primary_pincode,
        u.interests,
        u.created_at,
        EXISTS (
          SELECT 1 FROM user_connections uc
          WHERE uc.follower_id = $1 AND uc.following_id = u.id
        ) AS is_following,
        EXISTS (
          SELECT 1 FROM user_connections uc
          WHERE uc.follower_id = u.id AND uc.following_id = $1
        ) AS follows_you,
        (
          SELECT COUNT(*)
          FROM user_connections mine
          JOIN user_connections theirs ON theirs.following_id = mine.following_id
          WHERE mine.follower_id = $1
            AND theirs.follower_id = u.id
        )::int AS mutual_count,
        (SELECT COUNT(*) FROM user_connections uc WHERE uc.following_id = u.id)::int AS follower_count,
        (SELECT COUNT(*) FROM user_connections uc WHERE uc.follower_id = u.id)::int AS following_count,
        (SELECT COUNT(*) FROM posts p WHERE p.author_user_id = u.id)::int AS post_count,
        (
          SELECT COUNT(*)
          FROM group_memberships gm
          JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id
            AND gm.status = 'active'
            AND g.type != 'secret'
            AND COALESCE(g.status, 'active') = 'active'
        )::int AS group_count
      FROM users u
      WHERE u.id = $2
      `,
      [request.user.id, params.id]
    );
    if (!profile) return notFound(reply, 'User not found');

    const mutualConnections = await query(
      `
      SELECT
        u.id,
        u.username,
        u.avatar_url,
        u.primary_pincode
      FROM user_connections mine
      JOIN user_connections theirs ON theirs.following_id = mine.following_id
      JOIN users u ON u.id = mine.following_id
      WHERE mine.follower_id = $1
        AND theirs.follower_id = $2
      ORDER BY u.username ASC NULLS LAST, u.created_at DESC
      LIMIT 6
      `,
      [request.user.id, params.id]
    );

    const followers = await query(
      `
      SELECT
        u.id,
        u.username,
        u.avatar_url,
        u.primary_pincode,
        EXISTS (
          SELECT 1 FROM user_connections back
          WHERE back.follower_id = $1 AND back.following_id = u.id
        ) AS is_following,
        TRUE AS follows_you,
        (SELECT COUNT(*) FROM user_connections x WHERE x.following_id = u.id)::int AS follower_count
      FROM user_connections uc
      JOIN users u ON u.id = uc.follower_id
      WHERE uc.following_id = $2
      ORDER BY uc.created_at DESC
      LIMIT 30
      `,
      [request.user.id, params.id]
    );

    const following = await query(
      `
      SELECT
        u.id,
        u.username,
        u.avatar_url,
        u.primary_pincode,
        TRUE AS is_following,
        EXISTS (
          SELECT 1 FROM user_connections back
          WHERE back.follower_id = u.id AND back.following_id = $1
        ) AS follows_you,
        (SELECT COUNT(*) FROM user_connections x WHERE x.following_id = u.id)::int AS follower_count
      FROM user_connections uc
      JOIN users u ON u.id = uc.following_id
      WHERE uc.follower_id = $2
      ORDER BY uc.created_at DESC
      LIMIT 30
      `,
      [request.user.id, params.id]
    );

    const groups = await query(
      `
      SELECT
        g.*,
        gt.id AS default_thread_id,
        gm.role
      FROM group_memberships gm
      JOIN groups g ON g.id = gm.group_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM threads
        WHERE group_id = g.id
        ORDER BY (LOWER(name) = 'general') DESC, created_at ASC
        LIMIT 1
      ) gt ON true
      WHERE gm.user_id = $1
        AND gm.status = 'active'
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY gm.joined_at DESC
      LIMIT 12
      `,
      [params.id]
    );

    const posts = await query<Post>(
      `
      SELECT ${POST_SELECT}
      FROM posts p
      ${POST_JOINS}
      WHERE p.author_user_id = $2
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY p.created_at DESC
      LIMIT 12
      `,
      [request.user.id, params.id]
    );

    return reply.send({ user: profile, groups, posts, mutual_connections: mutualConnections, followers, following });
  });

  app.post('/:id/follow', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    if (params.id === request.user.id) {
      return badRequest(reply, 'cannot_follow_self', 'You cannot follow yourself');
    }

    const target = await queryOne<User>('SELECT * FROM users WHERE id = $1', [params.id]);
    if (!target) return notFound(reply, 'User not found');

    const inserted = await query(
      `
      INSERT INTO user_connections (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING follower_id
      `,
      [request.user.id, params.id]
    );

    if (inserted.length > 0) {
      await query(
        `
        INSERT INTO notifications (user_id, type, reference_id, reference_type, custom_message)
        VALUES ($1, 'connection', $2, 'user', 'Someone connected with you')
        `,
        [params.id, request.user.id]
      );
    }

    return reply.send({ ok: true });
  });

  app.delete('/:id/follow', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await query(
      'DELETE FROM user_connections WHERE follower_id = $1 AND following_id = $2',
      [request.user.id, params.id]
    );
    return reply.send({ ok: true });
  });

  app.get('/me/saved-posts', async (request, reply) => {
    const q = request.query as { page?: string };
    const page = parsePage(q.page);
    const limit = 20;
    const offset = (page - 1) * limit;

    const posts = await query<Post>(
      `
      SELECT ${POST_SELECT}, ps.created_at AS saved_at
      FROM post_saves ps
      JOIN posts p ON p.id = ps.post_id
      ${POST_JOINS}
      WHERE ps.user_id = $1
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY ps.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [request.user.id, limit + 1, offset]
    );

    return reply.send({
      posts: posts.slice(0, limit),
      page,
      hasMore: posts.length > limit,
    });
  });

  app.get('/me/activity', async (request, reply) => {
    const q = request.query as { page?: string };
    const page = parsePage(q.page);
    const limit = 30;
    const offset = (page - 1) * limit;

    const activities = await query(
      `
      WITH activity AS (
        SELECT
          ('like:' || pl.post_id::text || ':' || pl.user_id::text) AS id,
          'like'::text AS type,
          pl.created_at,
          NULL::text AS content,
          pl.post_id
        FROM post_likes pl
        WHERE pl.user_id = $1
        UNION ALL
        SELECT
          ('comment:' || pc.id::text) AS id,
          'comment'::text AS type,
          pc.created_at,
          pc.content,
          pc.post_id
        FROM post_comments pc
        WHERE pc.user_id = $1
      )
      SELECT
        a.id,
        a.type,
        a.created_at,
        a.content,
        json_build_object(
          'id', p.id,
          'group_id', p.group_id,
          'author_user_id', p.author_user_id,
          'pincode', p.pincode,
          'category', p.category,
          'content_text', p.content_text,
          'media_urls', p.media_urls,
          'like_count', p.like_count,
          'comment_count', p.comment_count,
          'swipe_count', p.swipe_count,
          'share_count', p.share_count,
          'engagement_score', p.engagement_score,
          'created_at', p.created_at,
          'is_liked', (pl.user_id IS NOT NULL),
          'is_saved', (psv.user_id IS NOT NULL),
          'group', json_build_object(
            'id', g.id,
            'name', g.name,
            'cover_image_url', g.cover_image_url,
            'category', g.category,
            'pincode', g.pincode,
            'member_count', g.member_count,
            'type', g.type,
            'default_thread_id', gt.id
          ),
          'author', json_build_object(
            'id', au.id,
            'username', au.username,
            'avatar_url', au.avatar_url
          )
        ) AS post
      FROM activity a
      JOIN posts p ON p.id = a.post_id
      JOIN groups g ON g.id = p.group_id
      JOIN users au ON au.id = p.author_user_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM threads
        WHERE group_id = g.id
        ORDER BY (LOWER(name) = 'general') DESC, created_at ASC
        LIMIT 1
      ) gt ON true
      LEFT JOIN post_likes pl ON pl.post_id = p.id AND pl.user_id = $1
      LEFT JOIN post_saves psv ON psv.post_id = p.id AND psv.user_id = $1
      WHERE g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [request.user.id, limit + 1, offset]
    );

    return reply.send({
      activities: activities.slice(0, limit),
      page,
      hasMore: activities.length > limit,
    });
  });

  // PATCH /api/v1/users/me
  app.patch('/me', async (request, reply) => {
    const result = PatchBody.safeParse(request.body);
    if (!result.success) {
      return badRequest(reply, 'validation_error', result.error.issues[0]?.message ?? 'Invalid input');
    }

    const data = result.data;

    // Username uniqueness
    if (data.username) {
      const taken = await queryOne(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [data.username, request.user.id]
      );
      if (taken) return reply.status(409).send({ error: 'username_taken', message: 'Username already taken', statusCode: 409 });
    }

    const fields = ['username', 'avatar_url', 'cover_image_url', 'bio', 'location_text', 'website_url', 'primary_pincode', 'secondary_pincode', 'interests'] as const;
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of fields) {
      if (field in data) {
        setClauses.push(`${field} = $${idx++}`);
        values.push((data as any)[field]);
      }
    }

    if (setClauses.length === 0) {
      const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [request.user.id]);
      return reply.send({ user: user ? publicUser(user) : user });
    }

    values.push(request.user.id);
    const user = await queryOne<User>(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return reply.send({ user: user ? publicUser(user) : user });
  });
}
