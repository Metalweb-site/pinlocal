import type { Server as IOServer } from 'socket.io';
import { queryOne } from '../../db/client';

export type BadgeCounts = {
  notifications: number;
  groups: number;
  chats: number;
};

export async function getBadgeCounts(userId: string): Promise<BadgeCounts> {
  const badges = await queryOne<BadgeCounts>(
    `
    SELECT
      (
        SELECT COUNT(*)::int
        FROM notifications n
        LEFT JOIN user_notification_settings ns ON ns.user_id = $1
        WHERE n.user_id = $1
          AND n.is_read = false
          AND (
            COALESCE(ns.activity_enabled, true) = true
            OR n.type NOT IN ('like', 'reply', 'post_milestone')
          )
          AND (
            COALESCE(ns.group_updates_enabled, true) = true
            OR n.type NOT IN ('join_approved', 'join_request', 'mention')
          )
      ) AS notifications,
      (
        SELECT COUNT(*)::int
        FROM messages m
        JOIN threads t ON t.id = m.thread_id
        JOIN groups g ON g.id = t.group_id
        JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $1 AND gm.status = 'active'
        LEFT JOIN user_group_notif_prefs gp ON gp.group_id = g.id AND gp.user_id = $1
        LEFT JOIN user_notification_settings ns ON ns.user_id = $1
        LEFT JOIN user_thread_cursors c ON c.thread_id = t.id AND c.user_id = $1
        LEFT JOIN messages last_read ON last_read.id = c.last_read_msg_id
        WHERE m.sender_id != $1
          AND m.is_deleted = false
          AND COALESCE(g.status, 'active') = 'active'
          AND COALESCE(ns.group_updates_enabled, true) = true
          AND COALESCE(gp.preference, 'all') != 'muted'
          AND (c.last_read_msg_id IS NULL OR m.created_at > COALESCE(last_read.created_at, 'epoch'))
      ) AS groups,
      (
        SELECT COUNT(*)::int
        FROM personal_messages pm
        JOIN personal_conversations pc ON pc.id = pm.conversation_id
        LEFT JOIN personal_conversation_notif_prefs cp ON cp.conversation_id = pc.id AND cp.user_id = $1
        LEFT JOIN user_notification_settings ns ON ns.user_id = $1
        LEFT JOIN personal_conversation_cursors c ON c.conversation_id = pc.id AND c.user_id = $1
        LEFT JOIN personal_messages last_read ON last_read.id = c.last_read_msg_id
        WHERE (pc.user_one_id = $1 OR pc.user_two_id = $1)
          AND pm.sender_id != $1
          AND pm.is_deleted = false
          AND COALESCE(ns.chat_messages_enabled, true) = true
          AND COALESCE(cp.preference, 'all') != 'muted'
          AND (c.last_read_msg_id IS NULL OR pm.created_at > COALESCE(last_read.created_at, 'epoch'))
      ) AS chats
    `,
    [userId]
  );

  return badges ?? { notifications: 0, groups: 0, chats: 0 };
}

export async function emitBadgeCounts(io: IOServer | undefined, userId: string): Promise<void> {
  if (!io) return;
  const badges = await getBadgeCounts(userId);
  io.to(`user:${userId}`).emit('badge_counts_updated', { badges });
}
