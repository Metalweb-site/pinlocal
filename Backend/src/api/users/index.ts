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
  locality_name:     z.string().max(120).nullable().optional(),
  locality_user_edited: z.boolean().optional(),
  locality_confirmed: z.boolean().optional(),
  city:              z.string().max(120).nullable().optional(),
  district:          z.string().max(120).nullable().optional(),
  state:             z.string().max(120).nullable().optional(),
  latitude:          z.number().min(6).max(38).nullable().optional(),
  longitude:         z.number().min(68).max(98).nullable().optional(),
  location_source:   z.enum(['gps', 'manual', 'pincode']).nullable().optional(),
  location_accuracy_meters: z.number().int().min(0).max(50000).nullable().optional(),
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

type ReverseGeocodeLocation = {
  pincode: string | null;
  locality_name: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  lat: number;
  lng: number;
  display_name: string | null;
  source: 'nominatim' | 'pincode_meta' | 'pincode_consensus';
  cached?: boolean;
};

type LocalityCandidate = {
  normalized: string;
  display: string;
  weight: number;
  userCount: number;
};

type PincodeLocalityDefault = {
  pincode: string;
  canonical_locality: string;
  normalized_locality: string;
  confidence_score: string | number;
  support_count: number;
  weighted_score: number;
  total_contributors: number;
  runner_up_locality: string | null;
  runner_up_weight: number;
  status: 'pending' | 'confirmed';
};

const LOCALITY_MIN_CONTRIBUTORS = Number(process.env.LOCALITY_MIN_CONTRIBUTORS ?? '10');
const LOCALITY_MIN_WIN_SHARE = Number(process.env.LOCALITY_MIN_WIN_SHARE ?? '0.6');
const LOCALITY_MIN_LEAD_SHARE = Number(process.env.LOCALITY_MIN_LEAD_SHARE ?? '0.2');
const LOCALITY_MIN_LEAD_WEIGHT = Number(process.env.LOCALITY_MIN_LEAD_WEIGHT ?? '3');
const LOCALITY_CONSENSUS_MAX_DISTANCE_KM = Number(process.env.LOCALITY_CONSENSUS_MAX_DISTANCE_KM ?? '6');

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

function cleanLocationPart(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s{2,}/g, ' ');
  return clean || null;
}

function normalizeLocalityName(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  return clean || null;
}

function uniqueParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    if (!part) continue;
    const key = part.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(part.trim());
  }

  return result;
}

function buildLocationText(location: {
  locality_name?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
}): string | null {
  const parts = uniqueParts([location.locality_name, location.city, location.district, location.state]).slice(0, 3);
  return parts.length > 0 ? parts.join(', ') : null;
}

function locationCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

async function getPincodeMeta(pincode: string) {
  return queryOne<{ pincode: string; city: string | null; district: string | null; state: string | null; lat: number | null; lng: number | null }>(
    `SELECT pincode, city, district, state, lat, lng FROM pincode_meta WHERE pincode = $1`,
    [pincode]
  );
}

async function nearestPincodeByCoordinates(lat: number, lng: number) {
  return queryOne<{ pincode: string; city: string | null; district: string | null; state: string | null; lat: number | null; lng: number | null }>(
    `
    SELECT pincode, city, district, state, lat, lng
    FROM pincode_meta
    WHERE lat IS NOT NULL
      AND lng IS NOT NULL
    ORDER BY POWER(lat - $1, 2) + POWER(lng - $2, 2)
    LIMIT 1
    `,
    [lat, lng]
  );
}

function localityWeight(row: Pick<User, 'locality_user_edited' | 'locality_confirmed'>): number {
  if (row.locality_user_edited) return 4;
  if (row.locality_confirmed) return 2;
  return 1;
}

async function getPincodeLocalityDefault(
  pincode: string,
  status: 'pending' | 'confirmed' | null = 'confirmed'
) {
  return queryOne<PincodeLocalityDefault>(
    `
    SELECT *
    FROM pincode_locality_defaults
    WHERE pincode = $1
      AND ($2::text IS NULL OR status = $2)
    `,
    [pincode, status]
  );
}

async function recomputePincodeLocalityConsensus(pincode: string): Promise<void> {
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return;

  const rows = await query<Pick<User, 'locality_name' | 'locality_user_edited' | 'locality_confirmed'>>(
    `
    SELECT locality_name, locality_user_edited, locality_confirmed
    FROM users
    WHERE primary_pincode = $1
      AND COALESCE(TRIM(locality_name), '') <> ''
    `,
    [pincode]
  );

  if (rows.length === 0) {
    await query(`DELETE FROM pincode_locality_defaults WHERE pincode = $1`, [pincode]);
    return;
  }

  const aggregate = new Map<string, { weight: number; userCount: number; displays: Map<string, number> }>();

  for (const row of rows) {
    const display = cleanLocationPart(row.locality_name);
    const normalized = normalizeLocalityName(display);
    if (!display || !normalized) continue;

    const bucket = aggregate.get(normalized) ?? { weight: 0, userCount: 0, displays: new Map<string, number>() };
    bucket.weight += localityWeight(row);
    bucket.userCount += 1;
    bucket.displays.set(display, (bucket.displays.get(display) ?? 0) + 1);
    aggregate.set(normalized, bucket);
  }

  const candidates: LocalityCandidate[] = Array.from(aggregate.entries()).map(([normalized, value]) => {
    const display = Array.from(value.displays.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))[0]?.[0] ?? normalized;

    return {
      normalized,
      display,
      weight: value.weight,
      userCount: value.userCount,
    };
  }).sort((a, b) => b.weight - a.weight || b.userCount - a.userCount || a.display.localeCompare(b.display));

  if (candidates.length === 0) {
    await query(`DELETE FROM pincode_locality_defaults WHERE pincode = $1`, [pincode]);
    return;
  }

  const winner = candidates[0];
  const runnerUp = candidates[1] ?? null;
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const totalContributors = rows.length;
  const winnerShare = totalWeight > 0 ? winner.weight / totalWeight : 0;
  const leadWeight = winner.weight - (runnerUp?.weight ?? 0);
  const leadShare = totalWeight > 0 ? leadWeight / totalWeight : 1;
  const status: 'pending' | 'confirmed' =
    totalContributors >= LOCALITY_MIN_CONTRIBUTORS &&
    winnerShare >= LOCALITY_MIN_WIN_SHARE &&
    leadWeight >= LOCALITY_MIN_LEAD_WEIGHT &&
    leadShare >= LOCALITY_MIN_LEAD_SHARE
      ? 'confirmed'
      : 'pending';

  await query(
    `
    INSERT INTO pincode_locality_defaults (
      pincode,
      canonical_locality,
      normalized_locality,
      confidence_score,
      support_count,
      weighted_score,
      total_contributors,
      runner_up_locality,
      runner_up_weight,
      status,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (pincode) DO UPDATE
    SET canonical_locality = EXCLUDED.canonical_locality,
        normalized_locality = EXCLUDED.normalized_locality,
        confidence_score = EXCLUDED.confidence_score,
        support_count = EXCLUDED.support_count,
        weighted_score = EXCLUDED.weighted_score,
        total_contributors = EXCLUDED.total_contributors,
        runner_up_locality = EXCLUDED.runner_up_locality,
        runner_up_weight = EXCLUDED.runner_up_weight,
        status = EXCLUDED.status,
        updated_at = NOW()
    `,
    [
      pincode,
      winner.display,
      winner.normalized,
      Number((winnerShare * 100).toFixed(2)),
      winner.userCount,
      winner.weight,
      totalContributors,
      runnerUp?.display ?? null,
      runnerUp?.weight ?? 0,
      status,
    ]
  );
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

async function reverseGeocodeLocation(lat: number, lng: number): Promise<ReverseGeocodeLocation | null> {
  const roundedLat = Number(lat.toFixed(6));
  const roundedLng = Number(lng.toFixed(6));
  const cacheKey = locationCacheKey(roundedLat, roundedLng);

  const cached = await queryOne<{
    pincode: string | null;
    locality_name: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    display_name: string | null;
    source: 'nominatim' | 'pincode_meta' | 'pincode_consensus';
  }>(
    `
    SELECT pincode, locality_name, city, district, state, display_name, source
    FROM reverse_geocode_cache
    WHERE cache_key = $1
      AND expires_at > NOW()
    `,
    [cacheKey]
  );

  if (cached) {
    return {
      ...cached,
      lat: roundedLat,
      lng: roundedLng,
      cached: true,
    };
  }

  const nearest = await nearestPincodeByCoordinates(roundedLat, roundedLng);
  const nearestDistance =
    nearest?.lat !== null && nearest?.lat !== undefined && nearest?.lng !== null && nearest?.lng !== undefined
      ? distanceKm(roundedLat, roundedLng, Number(nearest.lat), Number(nearest.lng))
      : Number.POSITIVE_INFINITY;

  if (nearest?.pincode && nearestDistance <= LOCALITY_CONSENSUS_MAX_DISTANCE_KM) {
    const confirmedDefault = await getPincodeLocalityDefault(nearest.pincode, 'confirmed');
    if (confirmedDefault) {
      const location: ReverseGeocodeLocation = {
        pincode: nearest.pincode,
        locality_name: confirmedDefault.canonical_locality,
        city: nearest.city,
        district: nearest.district,
        state: nearest.state,
        lat: roundedLat,
        lng: roundedLng,
        display_name: buildLocationText({
          locality_name: confirmedDefault.canonical_locality,
          city: nearest.city,
          district: nearest.district,
          state: nearest.state,
        }),
        source: 'pincode_consensus',
        cached: false,
      };

      await query(
        `
        INSERT INTO reverse_geocode_cache (
          cache_key, lat, lng, pincode, locality_name, city, district, state, display_name, source, expires_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '90 days', NOW())
        ON CONFLICT (cache_key) DO UPDATE
        SET lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            pincode = EXCLUDED.pincode,
            locality_name = EXCLUDED.locality_name,
            city = EXCLUDED.city,
            district = EXCLUDED.district,
            state = EXCLUDED.state,
            display_name = EXCLUDED.display_name,
            source = EXCLUDED.source,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW()
        `,
        [cacheKey, roundedLat, roundedLng, location.pincode, location.locality_name, location.city, location.district, location.state, location.display_name, 'pincode_consensus']
      );

      return location;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(roundedLat));
    url.searchParams.set('lon', String(roundedLng));
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
      address?: Record<string, string | undefined> & { postcode?: string; country_code?: string };
      display_name?: string;
    };

    if (data.address?.country_code && data.address.country_code.toLowerCase() !== 'in') return null;

    const address = data.address ?? {};
    let pincode = extractIndianPincode(address.postcode) ?? extractIndianPincode(data.display_name);
    const validPincode = pincode ? await getPincodeMeta(pincode) : null;
    if (!validPincode) {
      pincode = nearest?.pincode ?? pincode ?? null;
    }

    const meta = pincode ? await getPincodeMeta(pincode) : null;
    const confirmedDefault = pincode ? await getPincodeLocalityDefault(pincode, 'confirmed') : null;
    const location: ReverseGeocodeLocation = {
      pincode,
      locality_name: cleanLocationPart(
        confirmedDefault?.canonical_locality ??
        address.neighbourhood ??
        address.suburb ??
        address.quarter ??
        address.city_district ??
        address.residential ??
        address.hamlet ??
        address.village
      ) ?? meta?.city ?? null,
      city: cleanLocationPart(
        address.city ??
        address.town ??
        address.municipality ??
        address.county
      ) ?? meta?.city ?? null,
      district: cleanLocationPart(
        address.state_district ??
        address.county
      ) ?? meta?.district ?? null,
      state: cleanLocationPart(address.state) ?? meta?.state ?? null,
      lat: roundedLat,
      lng: roundedLng,
      display_name: cleanLocationPart(data.display_name),
      source: validPincode ? 'nominatim' : 'pincode_meta',
      cached: false,
    };

    await query(
      `
      INSERT INTO reverse_geocode_cache (
        cache_key, lat, lng, pincode, locality_name, city, district, state, display_name, source, expires_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '90 days', NOW())
      ON CONFLICT (cache_key) DO UPDATE
      SET lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          pincode = EXCLUDED.pincode,
          locality_name = EXCLUDED.locality_name,
          city = EXCLUDED.city,
          district = EXCLUDED.district,
          state = EXCLUDED.state,
          display_name = EXCLUDED.display_name,
          source = EXCLUDED.source,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `,
      [cacheKey, roundedLat, roundedLng, location.pincode, location.locality_name, location.city, location.district, location.state, location.display_name, location.source]
    );

    return location;
  } catch {
    const nearest = await nearestPincodeByCoordinates(roundedLat, roundedLng);
    if (!nearest) return null;

    const confirmedDefault = await getPincodeLocalityDefault(nearest.pincode, 'confirmed');

    return {
      pincode: nearest.pincode,
      locality_name: confirmedDefault?.canonical_locality ?? nearest.city,
      city: nearest.city,
      district: nearest.district,
      state: nearest.state,
      lat: roundedLat,
      lng: roundedLng,
      display_name: null,
      source: 'pincode_meta',
      cached: false,
    };
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

    const location = await reverseGeocodeLocation(parsed.data.lat, parsed.data.lng);
    if (!location?.pincode) {
      return reply.status(404).send({
        error: 'pincode_not_found',
        message: 'Could not detect pincode for this location',
        statusCode: 404,
      });
    }

    return reply.send({
      pincode: location.pincode,
      location: {
        pincode: location.pincode,
        locality_name: location.locality_name,
        city: location.city,
        district: location.district,
        state: location.state,
        location_text: buildLocationText(location),
        lat: location.lat,
        lng: location.lng,
        source: location.source,
        cached: Boolean(location.cached),
        display_name: location.display_name,
      },
    });
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
        (SELECT COUNT(*) FROM posts WHERE author_user_id = $1 AND pincode = $2)::text AS posts,
        (
          SELECT COUNT(*)
          FROM group_memberships gm
          JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = $1
            AND gm.status = 'active'
            AND g.pincode = $2
            AND COALESCE(g.status, 'active') = 'active'
        )::text AS groups,
        (SELECT COUNT(*) FROM user_connections WHERE follower_id = $1)::text AS following,
        (SELECT COUNT(*) FROM user_connections WHERE following_id = $1)::text AS followers,
        0::text AS events_attended
      `,
      [request.user.id, request.user.active_pincode]
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
        AND $2 IN (u.primary_pincode, COALESCE(u.secondary_pincode, ''))
        AND NOT EXISTS (
          SELECT 1 FROM user_connections uc
          WHERE uc.follower_id = $1 AND uc.following_id = u.id
        )
      ORDER BY u.created_at DESC
      LIMIT 12
      `,
      [request.user.id, request.user.active_pincode]
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
        AND p.pincode = $2
        AND g.pincode = $2
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [request.user.id, request.user.active_pincode, limit + 1, offset]
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
        AND $3 IN (u.primary_pincode, COALESCE(u.secondary_pincode, ''))
        AND (
          u.username ILIKE $2
          OR u.phone ILIKE $2
        )
      ORDER BY
        u.username ASC NULLS LAST,
        u.created_at DESC
      LIMIT 20
      `,
      [request.user.id, `%${search}%`, request.user.active_pincode]
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
        (SELECT COUNT(*) FROM posts p WHERE p.author_user_id = u.id AND p.pincode = $3)::int AS post_count,
        (
          SELECT COUNT(*)
          FROM group_memberships gm
          JOIN groups g ON g.id = gm.group_id
          WHERE gm.user_id = u.id
            AND gm.status = 'active'
            AND g.type != 'secret'
            AND g.pincode = $3
            AND COALESCE(g.status, 'active') = 'active'
        )::int AS group_count
      FROM users u
      WHERE u.id = $2
        AND $3 IN (u.primary_pincode, COALESCE(u.secondary_pincode, ''))
      `,
      [request.user.id, params.id, request.user.active_pincode]
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
        AND g.pincode = $2
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY gm.joined_at DESC
      LIMIT 12
      `,
      [params.id, request.user.active_pincode]
    );

    const posts = await query<Post>(
      `
      SELECT ${POST_SELECT}
      FROM posts p
      ${POST_JOINS}
      WHERE p.author_user_id = $2
        AND p.pincode = $3
        AND g.pincode = $3
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY p.created_at DESC
      LIMIT 12
      `,
      [request.user.id, params.id, request.user.active_pincode]
    );

    return reply.send({ user: profile, groups, posts, mutual_connections: mutualConnections, followers, following });
  });

  app.post('/:id/follow', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    if (params.id === request.user.id) {
      return badRequest(reply, 'cannot_follow_self', 'You cannot follow yourself');
    }

    const target = await queryOne<User>(
      `SELECT * FROM users WHERE id = $1 AND $2 IN (primary_pincode, COALESCE(secondary_pincode, ''))`,
      [params.id, request.user.active_pincode]
    );
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
        AND p.pincode = $2
        AND g.pincode = $2
        AND g.type != 'secret'
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY ps.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [request.user.id, request.user.active_pincode, limit + 1, offset]
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
        AND p.pincode = $2
        AND g.pincode = $2
        AND COALESCE(g.status, 'active') = 'active'
      ORDER BY a.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [request.user.id, request.user.active_pincode, limit + 1, offset]
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
    const localityProvidedByClient = Object.prototype.hasOwnProperty.call(data, 'locality_name');
    const currentUser = await queryOne<User>('SELECT * FROM users WHERE id = $1', [request.user.id]);
    if (!currentUser) return notFound(reply, 'User not found');

    if (data.primary_pincode || data.secondary_pincode !== undefined) {
      const nextPrimary = data.primary_pincode ?? request.user.primary_pincode;
      const nextSecondary = data.secondary_pincode === undefined ? request.user.secondary_pincode : data.secondary_pincode;

      if (nextSecondary && nextSecondary === nextPrimary) {
        return badRequest(reply, 'duplicate_pincode', 'Secondary pincode must be different from your primary pincode');
      }

      const toValidate = [data.primary_pincode, data.secondary_pincode].filter((value): value is string => Boolean(value));
      if (toValidate.length > 0) {
        const validRows = await query<{ pincode: string }>(
          `SELECT pincode FROM pincode_meta WHERE pincode = ANY($1::text[])`,
          [toValidate]
        );
        const validSet = new Set(validRows.map(row => row.pincode));
        const invalid = toValidate.find(code => !validSet.has(code));
        if (invalid) {
          return badRequest(reply, 'invalid_pincode', 'Enter a valid 6-digit Indian pincode');
        }
      }
    }

    // Username uniqueness
    if (data.username) {
      const taken = await queryOne(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [data.username, request.user.id]
      );
      if (taken) return reply.status(409).send({ error: 'username_taken', message: 'Username already taken', statusCode: 409 });
    }

    if (data.primary_pincode && !data.city && !data.district && !data.state) {
      const canonical = await getPincodeLocalityDefault(data.primary_pincode, 'confirmed');
      const meta = await getPincodeMeta(data.primary_pincode);
      if (canonical) {
        data.locality_name = data.locality_name ?? canonical.canonical_locality;
        data.locality_confirmed = data.locality_confirmed ?? false;
        data.locality_user_edited = data.locality_user_edited ?? false;
        data.location_text = data.location_text ?? buildLocationText({
          locality_name: canonical.canonical_locality,
          city: meta?.city ?? null,
          district: meta?.district ?? null,
          state: meta?.state ?? null,
        });
      }
      if (meta) {
        data.city = meta.city;
        data.district = meta.district;
        data.state = meta.state;
        data.location_source = data.location_source ?? 'pincode';
      }
    }

    if ((data.locality_name || data.city || data.district || data.state) && !data.location_text) {
      data.location_text = buildLocationText(data);
    }

    if (data.locality_name !== undefined) {
      const nextLocality = cleanLocationPart(data.locality_name);
      const previousLocality = cleanLocationPart(currentUser.locality_name ?? currentUser.location_text ?? null);
      const wasEdited = normalizeLocalityName(nextLocality) !== normalizeLocalityName(previousLocality);

      data.locality_name = nextLocality;
      data.locality_confirmed = data.locality_confirmed ?? (localityProvidedByClient ? Boolean(nextLocality) : false);
      data.locality_user_edited = data.locality_user_edited ?? (localityProvidedByClient ? wasEdited : false);
      if (!data.location_text && nextLocality) {
        data.location_text = nextLocality;
      }
      if (!data.location_source && localityProvidedByClient && wasEdited) {
        data.location_source = 'manual';
      }
    }

    const fields = [
      'username',
      'avatar_url',
      'cover_image_url',
      'bio',
      'location_text',
      'locality_name',
      'locality_user_edited',
      'locality_confirmed',
      'city',
      'district',
      'state',
      'latitude',
      'longitude',
      'location_source',
      'location_accuracy_meters',
      'website_url',
      'primary_pincode',
      'secondary_pincode',
      'interests',
    ] as const;
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
      return reply.send({ user: publicUser(currentUser) });
    }

    values.push(request.user.id);
    const user = await queryOne<User>(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const shouldRecomputeConsensus =
      'primary_pincode' in data ||
      'locality_name' in data ||
      'locality_user_edited' in data ||
      'locality_confirmed' in data;

    if (user && shouldRecomputeConsensus) {
      const pincodesToRefresh = new Set<string>();
      if (currentUser.primary_pincode && currentUser.primary_pincode !== '000000') pincodesToRefresh.add(currentUser.primary_pincode);
      if (user.primary_pincode && user.primary_pincode !== '000000') pincodesToRefresh.add(user.primary_pincode);
      for (const pincode of pincodesToRefresh) {
        await recomputePincodeLocalityConsensus(pincode);
      }
    }

    return reply.send({ user: user ? publicUser(user) : user });
  });
}
