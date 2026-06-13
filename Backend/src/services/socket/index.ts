import type { Server as IOServer } from 'socket.io';
import type { Socket } from 'socket.io';
import { config } from '../../config';
import { query, queryOne, withTransaction } from '../../db/client';
import { isSuperAdminPhone } from '../../middleware';
import { verifyToken } from '../auth';
import type { Message } from '../../types';
import { emitBadgeCounts } from '../badges';
import { publicMediaUrl, resolveOwnedMediaAssets } from '../media';

type AuthedSocket = Socket & {
  data: {
    user?: {
      id: string;
      phone: string;
      primary_pincode: string;
    };
  };
};

function parseCookie(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, decodeURIComponent(value.join('='))];
    })
  );
}

async function canAccessThread(threadId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    `
    SELECT 1
    FROM threads t
    JOIN groups g ON g.id = t.group_id
    JOIN group_memberships gm ON gm.group_id = t.group_id
    WHERE t.id = $1 AND gm.user_id = $2 AND gm.status = 'active' AND COALESCE(g.status, 'active') = 'active'
    `,
    [threadId, userId]
  );
  return Boolean(row);
}

async function isPlatformBanned(userId: string): Promise<boolean> {
  const row = await queryOne(
    `
    SELECT 1
    FROM user_sanctions
    WHERE user_id = $1
      AND type = 'ban'
      AND scope = 'platform'
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
    `,
    [userId]
  );
  return Boolean(row);
}

async function loadMessage(messageId: string): Promise<Message | null> {
  return queryOne<Message>(
    `
    SELECT
      m.*,
      json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) AS sender,
      CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'content', r.content, 'sender_id', r.sender_id) END AS reply_to
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN messages r ON r.id = m.reply_to_id
    WHERE m.id = $1
    `,
    [messageId]
  );
}

function ack(callback: unknown, payload: unknown): void {
  if (typeof callback === 'function') {
    (callback as (payload: unknown) => void)(payload);
  }
}

export function registerSocketHandlers(io: IOServer): void {
  io.use((socket: AuthedSocket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie);
      const bearer = socket.handshake.auth?.token as string | undefined;
      const token = cookies[config.cookies.accessTokenName] ?? bearer;
      if (!token) return next(new Error('Authentication required'));

      const payload = verifyToken(token);
      if (payload.type !== 'access') return next(new Error('Invalid token type'));

      socket.data.user = {
        id: payload.id,
        phone: payload.phone,
        primary_pincode: payload.primary_pincode,
      };
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const user = socket.data.user!;
    socket.join(`user:${user.id}`);
    if (isSuperAdminPhone(user.phone)) {
      socket.join('admin:super');
    }

    socket.on('join_thread', async ({ thread_id }: { thread_id: string }, callback?: unknown) => {
      if (!thread_id || !(await canAccessThread(thread_id, user.id))) {
        ack(callback, { ok: false, error: 'forbidden' });
        return;
      }
      socket.join(`thread:${thread_id}`);
      const room = io.sockets.adapter.rooms.get(`thread:${thread_id}`);
      io.to(`thread:${thread_id}`).emit('room_online', { count: room?.size ?? 1 });
      ack(callback, { ok: true });
    });

    socket.on('leave_thread', ({ thread_id }: { thread_id: string }) => {
      if (!thread_id) return;
      socket.leave(`thread:${thread_id}`);
      const room = io.sockets.adapter.rooms.get(`thread:${thread_id}`);
      io.to(`thread:${thread_id}`).emit('room_online', { count: room?.size ?? 0 });
    });

    socket.on('typing', async ({ thread_id }: { thread_id: string }) => {
      if (!thread_id || !(await canAccessThread(thread_id, user.id))) return;
      const row = await queryOne<{ username: string | null }>('SELECT username FROM users WHERE id = $1', [user.id]);
      socket.to(`thread:${thread_id}`).emit('user_typing', {
        user_id: user.id,
        username: row?.username ?? user.phone,
        thread_id,
      });
    });

    socket.on('mark_read', async ({ thread_id, message_id }: { thread_id: string; message_id?: string }) => {
      if (!thread_id || !message_id || !(await canAccessThread(thread_id, user.id))) return;
      await query(
        `
        INSERT INTO user_thread_cursors (user_id, thread_id, last_read_msg_id, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, thread_id)
        DO UPDATE SET last_read_msg_id = EXCLUDED.last_read_msg_id, updated_at = NOW()
        `,
        [user.id, thread_id, message_id]
      );
      await emitBadgeCounts(io, user.id);
    });

    socket.on('send_message', async (
      payload: { thread_id: string; content?: string; media_url?: string; media_asset_id?: string; reply_to_id?: string | null },
      callback?: unknown
    ) => {
      try {
        if (!payload.thread_id || !(await canAccessThread(payload.thread_id, user.id))) {
          ack(callback, { ok: false, error: 'forbidden' });
          return;
        }
        if (await isPlatformBanned(user.id)) {
          ack(callback, { ok: false, error: 'account_banned' });
          return;
        }
        const content = payload.content?.trim() || null;
        const mediaAssets = await resolveOwnedMediaAssets(payload.media_asset_id ? [payload.media_asset_id] : undefined, user.id);
        const mediaAsset = mediaAssets[0] ?? null;
        const mediaUrl = mediaAsset ? publicMediaUrl(mediaAsset) : (payload.media_url || null);
        if (!content && !mediaUrl && !payload.media_asset_id) {
          ack(callback, { ok: false, error: 'empty_message' });
          return;
        }

        const messageId = await withTransaction(async (client) => {
          const inserted = await client.query<{ id: string }>(
            `
            INSERT INTO messages (thread_id, sender_id, content, media_url, media_asset_id, reply_to_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            `,
            [payload.thread_id, user.id, content, mediaUrl, mediaAsset?.id ?? null, payload.reply_to_id ?? null]
          );
          return inserted.rows[0].id;
        });

        const message = await loadMessage(messageId);
        if (!message) {
          ack(callback, { ok: false, error: 'message_not_found' });
          return;
        }

        io.to(`thread:${payload.thread_id}`).emit('new_message', { message });
        const recipients = await query<{ user_id: string }>(
          `
          SELECT gm.user_id
          FROM threads t
          JOIN group_memberships gm ON gm.group_id = t.group_id
          WHERE t.id = $1 AND gm.status = 'active' AND gm.user_id != $2
          `,
          [payload.thread_id, user.id]
        );
        for (const recipient of recipients) {
          io.to(`user:${recipient.user_id}`).emit('group_message_created', {
            thread_id: payload.thread_id,
            message_id: message.id,
          });
          await emitBadgeCounts(io, recipient.user_id);
        }
        ack(callback, { ok: true, message });
      } catch {
        ack(callback, { ok: false, error: 'internal_error' });
      }
    });
  });

  console.log('[Socket.io] Handlers registered');
}
