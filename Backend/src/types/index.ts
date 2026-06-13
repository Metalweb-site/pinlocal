// ─── Core domain types ────────────────────────────────────────────────────────

export interface User {
  id: string;
  phone: string;
  username: string | null;
  avatar_url: string | null;
  cover_image_url?: string | null;
  bio?: string | null;
  location_text?: string | null;
  website_url?: string | null;
  passcode_hash?: string | null;
  has_passcode?: boolean;
  primary_pincode: string;
  secondary_pincode: string | null;
  interests: string[];
  created_at: string;
  last_seen: string;
}

export interface PincodeMeta {
  pincode: string;
  city: string | null;
  district: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  neighbor_codes: string[];
  active_users_30d: number;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  pincode: string;
  category: string;
  type: 'open' | 'private' | 'secret';
  status?: 'active' | 'suspended' | 'banned';
  admin_user_id: string;
  member_count: number;
  post_count: number;
  engagement_score: number;
  created_at: string;
  default_thread_id?: string | null;
  unread_count?: number;
  is_member?: boolean;
  membership_status?: 'active' | 'pending' | 'banned';
  role?: 'admin' | 'moderator' | 'member';
}

export interface Thread {
  id: string;
  group_id: string;
  name: string;
  is_announcement: boolean;
  created_by: string | null;
  created_at: string;
  unread_count?: number;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  sender?: Pick<User, 'id' | 'username' | 'avatar_url'>;
  content: string | null;
  media_url: string | null;
  media_asset_id?: string | null;
  reply_to_id: string | null;
  reply_to?: Pick<Message, 'id' | 'content' | 'sender_id'>;
  reactions?: { emoji: string; count: number; user_reacted?: boolean }[];
  is_deleted: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  group_id: string;
  group?: Pick<Group, 'id' | 'name' | 'cover_image_url' | 'category' | 'pincode' | 'member_count'>;
  author_user_id: string;
  author?: Pick<User, 'id' | 'username' | 'avatar_url'>;
  latest_swipers?: Pick<User, 'id' | 'username' | 'avatar_url'>[];
  pincode: string;
  category: string | null;
  content_text: string | null;
  media_urls: string[];
  media_asset_ids?: string[];
  like_count: number;
  comment_count: number;
  swipe_count: number;
  share_count: number;
  engagement_score: number;
  ranking_score?: number;
  ranking_label?: 'for_you' | 'trending' | 'viral';
  is_personal_post?: boolean;
  is_liked?: boolean;
  is_saved?: boolean;
  is_member?: boolean;
  viewer_role?: 'admin' | 'moderator' | 'member' | null;
  created_at: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  user?: Pick<User, 'id' | 'username' | 'avatar_url'>;
  content: string;
  created_at: string;
}

export interface Membership {
  user_id: string;
  group_id: string;
  role: 'admin' | 'moderator' | 'member';
  status: 'active' | 'pending' | 'banned';
  joined_at: string;
}

export interface MemberObject extends Membership {
  user: Pick<User, 'id' | 'username' | 'avatar_url' | 'phone'>;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  custom_message?: string | null;
  is_read: boolean;
  created_at: string;
  message?: string;
}

export interface PersonalConversation {
  id: string;
  user_one_id: string;
  user_two_id: string;
  created_at: string;
  updated_at: string;
  other_user?: Pick<User, 'id' | 'username' | 'phone' | 'avatar_url' | 'primary_pincode'>;
  last_message?: PersonalMessage | null;
  unread_count?: number;
}

export interface PersonalMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender?: Pick<User, 'id' | 'username' | 'avatar_url'>;
  content: string | null;
  media_url: string | null;
  media_asset_id?: string | null;
  is_deleted: boolean;
  created_at: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  hasMore: boolean;
}

export interface FeedResponse {
  posts: Post[];
  page: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// ─── Fastify request augmentation ────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      phone: string;
      primary_pincode: string;
    };
  }

  interface FastifyInstance {
    io?: import('socket.io').Server;
  }
}
