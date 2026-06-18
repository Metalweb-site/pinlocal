import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../../db/client';
import { authMiddleware } from '../../middleware';
import { badRequest, forbidden, handleServiceError, notFound } from '../../utils';
import type { Group, MemberObject } from '../../types';

const GroupBody = z.object({
  name: z.string().min(3).max(80),
  description: z.string().max(1000).optional(),
  cover_image_url: z.string().url().optional(),
  category: z.string().min(2).max(30),
  type: z.enum(['open', 'private', 'secret']).default('open'),
});

const PatchBody = GroupBody.partial();
const MemberPatchBody = z.object({
  role: z.enum(['admin', 'moderator', 'member']),
});
const AdminVoteBallotBody = z.object({
  choice: z.enum(['yes', 'no']),
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

type AdminVote = {
  id: string;
  group_id: string;
  initiator_user_id: string;
  current_admin_user_id: string;
  status: 'active' | 'passed' | 'failed';
  yes_count: number;
  no_count: number;
  total_eligible: number;
  ends_at: string;
  created_at: string;
  resolved_at: string | null;
  initiator?: { id: string; username: string | null; phone: string };
  current_admin?: { id: string; username: string | null; phone: string };
  user_vote?: 'yes' | 'no' | null;
};

async function getGroupForUser(groupId: string, userId: string) {
  return queryOne<Group>(
    `
    SELECT
      g.*,
      gm.status AS membership_status,
      gm.role,
      (gm.user_id IS NOT NULL AND gm.status = 'active') AS is_member
    FROM groups g
    LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $2
    WHERE g.id = $1
      AND COALESCE(g.status, 'active') = 'active'
    `,
    [groupId, userId]
  );
}

async function getAdminVote(voteId: string, userId: string) {
  return queryOne<AdminVote>(
    `
    SELECT
      v.*,
      json_build_object('id', iu.id, 'username', iu.username, 'phone', iu.phone) AS initiator,
      json_build_object('id', au.id, 'username', au.username, 'phone', au.phone) AS current_admin,
      b.choice AS user_vote
    FROM group_admin_votes v
    JOIN users iu ON iu.id = v.initiator_user_id
    JOIN users au ON au.id = v.current_admin_user_id
    LEFT JOIN group_admin_vote_ballots b ON b.vote_id = v.id AND b.user_id = $2
    WHERE v.id = $1
    `,
    [voteId, userId]
  );
}

async function finalizeAdminVoteIfReady(voteId: string, userId: string) {
  await withTransaction(async (client) => {
    const voteRes = await client.query<AdminVote>(
      `SELECT * FROM group_admin_votes WHERE id = $1 FOR UPDATE`,
      [voteId]
    );
    const vote = voteRes.rows[0];
    if (!vote || vote.status !== 'active') return;

    const countsRes = await client.query<{ yes_count: number; no_count: number; total: number }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE choice = 'yes')::int AS yes_count,
        COUNT(*) FILTER (WHERE choice = 'no')::int AS no_count,
        COUNT(*)::int AS total
      FROM group_admin_vote_ballots
      WHERE vote_id = $1
      `,
      [voteId]
    );
    const counts = countsRes.rows[0] ?? { yes_count: 0, no_count: 0, total: 0 };
    const shouldResolve = counts.total >= vote.total_eligible || new Date(vote.ends_at) <= new Date();
    if (!shouldResolve) {
      await client.query(
        `UPDATE group_admin_votes SET yes_count = $2, no_count = $3 WHERE id = $1`,
        [voteId, counts.yes_count, counts.no_count]
      );
      return;
    }

    const passed = counts.yes_count > counts.no_count;
    await client.query(
      `
      UPDATE group_admin_votes
      SET status = $2, yes_count = $3, no_count = $4, resolved_at = NOW()
      WHERE id = $1
      `,
      [voteId, passed ? 'passed' : 'failed', counts.yes_count, counts.no_count]
    );

    if (passed) {
      await client.query(`UPDATE groups SET admin_user_id = $2 WHERE id = $1`, [vote.group_id, vote.initiator_user_id]);
      await client.query(
        `UPDATE group_memberships SET role = 'member' WHERE group_id = $1 AND user_id = $2`,
        [vote.group_id, vote.current_admin_user_id]
      );
      await client.query(
        `UPDATE group_memberships SET role = 'admin', status = 'active' WHERE group_id = $1 AND user_id = $2`,
        [vote.group_id, vote.initiator_user_id]
      );
    }
  });

  return getAdminVote(voteId, userId);
}

async function getGeneralThreadId(groupId: string) {
  const thread = await queryOne<{ id: string }>(
    `
    SELECT id
    FROM threads
    WHERE group_id = $1 AND LOWER(name) = 'general'
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [groupId]
  );
  return thread?.id ?? null;
}

function publicVotePayload(vote: AdminVote | null | undefined) {
  if (!vote) return vote;
  const { user_vote: _userVote, ...publicVote } = vote;
  return publicVote;
}

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.get('/mine', async (request, reply) => {
    const groups = await query<Group>(
      `
      SELECT
        g.*,
        gm.status AS membership_status,
        gm.role,
        true AS is_member,
        gt.id AS default_thread_id,
        COALESCE(unread.unread_count, 0)::int AS unread_count
      FROM group_memberships gm
      JOIN groups g ON g.id = gm.group_id
      LEFT JOIN LATERAL (
        SELECT id
        FROM threads
        WHERE group_id = g.id
        ORDER BY (LOWER(name) = 'general') DESC, created_at ASC
        LIMIT 1
      ) gt ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS unread_count
        FROM threads t
        JOIN messages m ON m.thread_id = t.id
        LEFT JOIN user_thread_cursors c ON c.thread_id = t.id AND c.user_id = $1
        LEFT JOIN messages last_read ON last_read.id = c.last_read_msg_id
        WHERE t.group_id = g.id
          AND m.sender_id != $1
          AND m.is_deleted = false
          AND (c.last_read_msg_id IS NULL OR m.created_at > COALESCE(last_read.created_at, 'epoch'))
      ) unread ON true
      WHERE gm.user_id = $1 AND gm.status = 'active'
      ORDER BY gm.joined_at DESC
      `,
      [request.user.id]
    );
    return reply.send({ groups });
  });

  app.post('/', async (request, reply) => {
    const parsed = GroupBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    if (!request.user.active_pincode || request.user.active_pincode === '000000') {
      return badRequest(reply, 'pincode_required', 'Set your pincode before creating a group');
    }

    try {
      const group = await withTransaction(async (client) => {
        const inserted = await client.query<Group>(
          `
          INSERT INTO groups (name, description, cover_image_url, pincode, category, type, admin_user_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
          `,
          [
            parsed.data.name,
            parsed.data.description ?? null,
            parsed.data.cover_image_url ?? null,
            request.user.active_pincode,
            parsed.data.category,
            parsed.data.type,
            request.user.id,
          ]
        );
        const group = inserted.rows[0];

        await client.query(
          `INSERT INTO group_memberships (user_id, group_id, role, status) VALUES ($1, $2, 'admin', 'active')`,
          [request.user.id, group.id]
        );
        const thread = await client.query<{ id: string }>(
          `INSERT INTO threads (group_id, name, is_announcement, created_by) VALUES ($1, 'general', false, $2) RETURNING id`,
          [group.id, request.user.id]
        );

        return { ...group, default_thread_id: thread.rows[0].id };
      });

      return reply.status(201).send({ group });
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  app.get('/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const group = await getGroupForUser(params.id, request.user.id);
    if (!group) return notFound(reply, 'Group not found');
    if (group.type === 'secret' && !group.is_member) return notFound(reply, 'Group not found');
    return reply.send({ group });
  });

  app.patch('/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = PatchBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const membership = await queryOne<{ role: string }>(
      `SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!membership || !['admin', 'moderator'].includes(membership.role)) return forbidden(reply);

    const fields = ['name', 'description', 'cover_image_url', 'category', 'type'] as const;
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of fields) {
      if (field in parsed.data) {
        sets.push(`${field} = $${idx++}`);
        values.push(parsed.data[field] ?? null);
      }
    }

    if (sets.length === 0) {
      const group = await getGroupForUser(params.id, request.user.id);
      return reply.send({ group });
    }

    values.push(params.id);
    const group = await queryOne<Group>(
      `UPDATE groups SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return reply.send({ group });
  });

  app.post('/:id/join', async (request, reply) => {
    const params = request.params as { id: string };
    const group = await queryOne<Group>("SELECT * FROM groups WHERE id = $1 AND COALESCE(status, 'active') = 'active'", [params.id]);
    if (!group || group.type === 'secret') return notFound(reply, 'Group not found');

    const status = group.type === 'private' ? 'pending' : 'active';
    await withTransaction(async (client) => {
      const existing = await client.query<{ status: string }>(
        `SELECT status FROM group_memberships WHERE user_id = $1 AND group_id = $2`,
        [request.user.id, params.id]
      );
      const wasActive = existing.rows[0]?.status === 'active';

      await client.query(
        `
        INSERT INTO group_memberships (user_id, group_id, role, status)
        VALUES ($1, $2, 'member', $3)
        ON CONFLICT (user_id, group_id) DO UPDATE SET status = EXCLUDED.status
        `,
        [request.user.id, params.id, status]
      );

      if (status === 'active' && !wasActive) {
        await client.query(`UPDATE groups SET member_count = member_count + 1 WHERE id = $1`, [params.id]);
      }

      const body = request.body as { post_id?: string } | undefined;
      const isPersonalFeedGroup = group.name === `Public ${group.pincode}` && group.type === 'open';
      if (body?.post_id && !isPersonalFeedGroup) {
        const swipe = await client.query(
          `
          INSERT INTO post_swipes (user_id, post_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, post_id) DO NOTHING
          RETURNING post_id
          `,
          [request.user.id, body.post_id]
        );
        if ((swipe.rowCount ?? 0) > 0) {
          await client.query(`UPDATE posts SET swipe_count = swipe_count + 1 WHERE id = $1`, [body.post_id]);
          await recalculatePostScore(client, body.post_id);
        }
      }
    });

    return reply.send({ status: status === 'active' ? 'joined' : 'pending' });
  });

  app.post('/:id/leave', async (request, reply) => {
    const params = request.params as { id: string };
    const membership = await queryOne<{ role: string; status: string }>(
      `SELECT role, status FROM group_memberships WHERE group_id = $1 AND user_id = $2`,
      [params.id, request.user.id]
    );
    if (!membership) return notFound(reply, 'Membership not found');
    if (membership.role === 'admin') return forbidden(reply, 'Transfer admin role before leaving');

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2`, [params.id, request.user.id]);
      if (membership.status === 'active') {
        await client.query(`UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1`, [params.id]);
      }
    });

    return reply.send({ message: 'left' });
  });

  app.get('/:id/admin-vote', async (request, reply) => {
    const params = request.params as { id: string };
    const viewer = await queryOne(
      `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!viewer) return forbidden(reply);

    const activeVote = await queryOne<{ id: string }>(
      `
      SELECT id
      FROM group_admin_votes
      WHERE group_id = $1 AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [params.id]
    );

    if (activeVote) {
      const vote = await finalizeAdminVoteIfReady(activeVote.id, request.user.id);
      const generalThreadId = vote ? await getGeneralThreadId(params.id) : null;
      if (generalThreadId) {
        request.server.io?.to(`thread:${generalThreadId}`).emit('group_admin_vote_updated', { vote: publicVotePayload(vote) });
      }
      return reply.send({ vote });
    }

    const latestVote = await queryOne<{ id: string }>(
      `
      SELECT id
      FROM group_admin_votes
      WHERE group_id = $1
      ORDER BY COALESCE(resolved_at, created_at) DESC
      LIMIT 1
      `,
      [params.id]
    );

    const vote = latestVote ? await getAdminVote(latestVote.id, request.user.id) : null;
    return reply.send({ vote });
  });

  app.get('/:id/admin-votes', async (request, reply) => {
    const params = request.params as { id: string };
    const viewer = await queryOne(
      `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!viewer) return forbidden(reply);

    const activeVote = await queryOne<{ id: string }>(
      `SELECT id FROM group_admin_votes WHERE group_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [params.id]
    );
    if (activeVote) {
      const vote = await finalizeAdminVoteIfReady(activeVote.id, request.user.id);
      const generalThreadId = vote ? await getGeneralThreadId(params.id) : null;
      if (generalThreadId) {
        request.server.io?.to(`thread:${generalThreadId}`).emit('group_admin_vote_updated', { vote: publicVotePayload(vote) });
      }
    }

    const votes = await query<AdminVote>(
      `
      SELECT
        v.*,
        json_build_object('id', iu.id, 'username', iu.username, 'phone', iu.phone) AS initiator,
        json_build_object('id', au.id, 'username', au.username, 'phone', au.phone) AS current_admin,
        b.choice AS user_vote
      FROM group_admin_votes v
      JOIN users iu ON iu.id = v.initiator_user_id
      JOIN users au ON au.id = v.current_admin_user_id
      LEFT JOIN group_admin_vote_ballots b ON b.vote_id = v.id AND b.user_id = $2
      WHERE v.group_id = $1
      ORDER BY v.created_at ASC
      `,
      [params.id, request.user.id]
    );

    return reply.send({ votes });
  });

  app.post('/:id/admin-vote', async (request, reply) => {
    const params = request.params as { id: string };
    const group = await queryOne<{ id: string; admin_user_id: string }>(
      `SELECT id, admin_user_id FROM groups WHERE id = $1 AND COALESCE(status, 'active') = 'active'`,
      [params.id]
    );
    if (!group) return notFound(reply, 'Group not found');

    const membership = await queryOne<{ role: string }>(
      `SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!membership) return forbidden(reply);
    if (request.user.id === group.admin_user_id) {
      return badRequest(reply, 'already_main_admin', 'Main admin cannot start a replacement vote for themselves');
    }

    const existingVote = await queryOne<{ id: string }>(
      `SELECT id FROM group_admin_votes WHERE group_id = $1 AND status = 'active' LIMIT 1`,
      [params.id]
    );
    if (existingVote) {
      const vote = await finalizeAdminVoteIfReady(existingVote.id, request.user.id);
      return reply.status(409).send({ error: 'vote_active', message: 'A main admin vote is already active', vote });
    }

    const memberCount = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM group_memberships WHERE group_id = $1 AND status = 'active'`,
      [params.id]
    );
    const totalEligible = Number(memberCount?.count ?? 0);
    if (totalEligible < 2) {
      return badRequest(reply, 'not_enough_members', 'A vote needs at least two active members');
    }

    const voteId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO group_admin_votes (group_id, initiator_user_id, current_admin_user_id, total_eligible, ends_at)
        VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')
        RETURNING id
        `,
        [params.id, request.user.id, group.admin_user_id, totalEligible]
      );
      const id = inserted.rows[0].id;
      await client.query(
        `INSERT INTO group_admin_vote_ballots (vote_id, user_id, choice) VALUES ($1, $2, 'yes')`,
        [id, request.user.id]
      );
      await client.query(`UPDATE group_admin_votes SET yes_count = 1 WHERE id = $1`, [id]);
      return id;
    });

    const vote = await getAdminVote(voteId, request.user.id);
    const generalThreadId = await getGeneralThreadId(params.id);
    if (generalThreadId) {
      request.server.io?.to(`thread:${generalThreadId}`).emit('group_admin_vote_updated', { vote: publicVotePayload(vote) });
    }
    return reply.status(201).send({ vote });
  });

  app.post('/:id/admin-vote/:voteId/ballot', async (request, reply) => {
    const params = request.params as { id: string; voteId: string };
    const parsed = AdminVoteBallotBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const membership = await queryOne(
      `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!membership) return forbidden(reply);

    const vote = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM group_admin_votes WHERE id = $1 AND group_id = $2`,
      [params.voteId, params.id]
    );
    if (!vote) return notFound(reply, 'Vote not found');
    if (vote.status !== 'active') return badRequest(reply, 'vote_closed', 'This vote is already closed');

    await query(
      `
      INSERT INTO group_admin_vote_ballots (vote_id, user_id, choice)
      VALUES ($1, $2, $3)
      ON CONFLICT (vote_id, user_id)
      DO UPDATE SET choice = EXCLUDED.choice, created_at = NOW()
      `,
      [params.voteId, request.user.id, parsed.data.choice]
    );

    const updatedVote = await finalizeAdminVoteIfReady(params.voteId, request.user.id);
    const generalThreadId = await getGeneralThreadId(params.id);
    if (generalThreadId) {
      request.server.io?.to(`thread:${generalThreadId}`).emit('group_admin_vote_updated', { vote: publicVotePayload(updatedVote) });
    }
    return reply.send({ vote: updatedVote });
  });

  app.get('/:id/members', async (request, reply) => {
    const params = request.params as { id: string };
    const viewer = await queryOne(
      `SELECT 1 FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!viewer) return forbidden(reply);

    const members = await query<MemberObject>(
      `
      SELECT gm.*, json_build_object(
        'id', u.id,
        'username', u.username,
        'avatar_url', u.avatar_url,
        'phone', u.phone
      ) AS user
      FROM group_memberships gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 AND gm.status = 'active'
      ORDER BY gm.joined_at ASC
      `,
      [params.id]
    );

    return reply.send({ members });
  });

  app.patch('/:id/members/:userId', async (request, reply) => {
    const params = request.params as { id: string; userId: string };
    const parsed = MemberPatchBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const viewer = await queryOne<{ role: string }>(
      `SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!viewer || viewer.role !== 'admin') {
      return forbidden(reply, 'Only admins can manage member positions');
    }

    const group = await queryOne<{ admin_user_id: string }>(
      `SELECT admin_user_id FROM groups WHERE id = $1 AND COALESCE(status, 'active') = 'active'`,
      [params.id]
    );
    if (!group) return notFound(reply, 'Group not found');
    if (params.userId === group.admin_user_id && parsed.data.role !== 'admin') {
      return forbidden(reply, 'Main admin can only be changed by a group vote');
    }

    const target = await queryOne<{ role: string }>(
      `SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, params.userId]
    );
    if (!target) return notFound(reply, 'Member not found');

    if (target.role === 'admin' && parsed.data.role !== 'admin') {
      const adminCount = await queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM group_memberships WHERE group_id = $1 AND role = 'admin' AND status = 'active'`,
        [params.id]
      );
      if (Number(adminCount?.count ?? 0) <= 1) {
        return forbidden(reply, 'A group must have at least one admin');
      }
    }

    const member = await queryOne<MemberObject>(
      `
      UPDATE group_memberships gm
      SET role = $3
      FROM users u
      WHERE gm.group_id = $1
        AND gm.user_id = $2
        AND gm.status = 'active'
        AND u.id = gm.user_id
      RETURNING gm.*, json_build_object(
        'id', u.id,
        'username', u.username,
        'avatar_url', u.avatar_url,
        'phone', u.phone
      ) AS user
      `,
      [params.id, params.userId, parsed.data.role]
    );

    return reply.send({ member });
  });

  app.delete('/:id/members/:userId', async (request, reply) => {
    const params = request.params as { id: string; userId: string };
    const viewer = await queryOne<{ role: string }>(
      `SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, request.user.id]
    );
    if (!viewer || viewer.role !== 'admin') {
      return forbidden(reply, 'Only admins can remove group members');
    }

    const group = await queryOne<{ admin_user_id: string }>(
      `SELECT admin_user_id FROM groups WHERE id = $1 AND COALESCE(status, 'active') = 'active'`,
      [params.id]
    );
    if (!group) return notFound(reply, 'Group not found');
    if (params.userId === group.admin_user_id) {
      return forbidden(reply, 'Main admin can only be changed by a group vote');
    }
    if (params.userId === request.user.id) {
      return badRequest(reply, 'cannot_remove_self', 'Use leave group instead');
    }

    const target = await queryOne<{ role: string; status: string }>(
      `SELECT role, status FROM group_memberships WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [params.id, params.userId]
    );
    if (!target) return notFound(reply, 'Member not found');

    await withTransaction(async (client) => {
      await client.query(
        `DELETE FROM group_memberships WHERE group_id = $1 AND user_id = $2`,
        [params.id, params.userId]
      );
      await client.query(
        `UPDATE groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = $1`,
        [params.id]
      );
    });

    return reply.send({ message: 'removed', user_id: params.userId });
  });
}
