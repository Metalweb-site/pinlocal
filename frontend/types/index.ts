export interface User {
  id: string
  phone: string
  username: string | null
  avatar_url: string | null
  cover_image_url?: string | null
  bio?: string | null
  location_text?: string | null
  locality_name?: string | null
  locality_user_edited?: boolean | null
  locality_confirmed?: boolean | null
  city?: string | null
  district?: string | null
  state?: string | null
  latitude?: number | null
  longitude?: number | null
  location_source?: 'gps' | 'manual' | 'pincode' | null
  location_accuracy_meters?: number | null
  website_url?: string | null
  has_passcode?: boolean
  primary_pincode: string
  secondary_pincode: string | null
  interests: string[]
  created_at: string
  last_seen: string
}

export interface Group {
  id: string
  name: string
  description: string | null
  cover_image_url: string | null
  pincode: string
  category: string
  type: 'open' | 'private' | 'secret'
  status?: 'active' | 'suspended' | 'banned'
  admin_user_id: string
  member_count: number
  post_count: number
  engagement_score: number
  created_at: string
  default_thread_id?: string | null
  unread_count?: number
  is_member?: boolean
  membership_status?: 'active' | 'pending' | 'banned'
  role?: 'admin' | 'moderator' | 'member'
}

export interface Thread {
  id: string
  group_id: string
  name: string
  is_announcement: boolean
  created_by: string
  created_at: string
  unread_count?: number
}

export interface Message {
  id: string
  thread_id: string
  sender_id: string
  sender?: Pick<User, 'id' | 'username' | 'avatar_url'>
  content: string | null
  media_url: string | null
  media_asset_id?: string | null
  reply_to_id: string | null
  reply_to?: Pick<Message, 'id' | 'content' | 'sender_id'>
  reactions?: MessageReaction[]
  is_deleted: boolean
  created_at: string
}

export interface MessageReaction {
  emoji: string
  count: number
  user_reacted?: boolean
}

export interface Post {
  id: string
  group_id: string
  group?: Pick<Group, 'id' | 'name' | 'cover_image_url' | 'category' | 'pincode' | 'member_count' | 'type' | 'default_thread_id'>
  author_user_id: string
  author?: Pick<User, 'id' | 'username' | 'avatar_url'>
  latest_swipers?: Pick<User, 'id' | 'username' | 'avatar_url'>[]
  pincode: string
  category: string | null
  content_text: string | null
  media_urls: string[]
  media_asset_ids?: string[]
  like_count: number
  comment_count: number
  swipe_count: number
  share_count: number
  engagement_score: number
  ranking_score?: number
  ranking_label?: 'for_you' | 'trending' | 'viral'
  is_personal_post?: boolean
  is_liked?: boolean
  is_saved?: boolean
  is_member?: boolean
  viewer_role?: 'admin' | 'moderator' | 'member' | null
  created_at: string
}

export interface UserActivity {
  id: string
  type: 'like' | 'comment'
  created_at: string
  content?: string | null
  post: Post
}

export interface ConnectionUser extends Pick<User, 'id' | 'phone' | 'username' | 'avatar_url' | 'primary_pincode'> {
  followed_at?: string
  follower_count?: number
  is_following?: boolean
  follows_you?: boolean
}

export interface PublicProfileUser extends Pick<User, 'id' | 'username' | 'avatar_url' | 'cover_image_url' | 'bio' | 'location_text' | 'website_url' | 'primary_pincode' | 'interests' | 'created_at'> {
  is_following?: boolean
  follows_you?: boolean
  mutual_count: number
  follower_count: number
  following_count: number
  post_count: number
  group_count: number
}

export interface PostComment {
  id: string
  post_id: string
  user_id: string
  user?: Pick<User, 'id' | 'username' | 'avatar_url'>
  content: string
  created_at: string
}

export interface Membership {
  user_id: string
  group_id: string
  role: 'admin' | 'moderator' | 'member'
  status: 'active' | 'pending' | 'banned'
  joined_at: string
}

export interface GroupMember extends Membership {
  user: Pick<User, 'id' | 'username' | 'avatar_url' | 'phone'>
}

export interface GroupAdminVote {
  id: string
  group_id: string
  initiator_user_id: string
  current_admin_user_id: string
  status: 'active' | 'passed' | 'failed'
  yes_count: number
  no_count: number
  total_eligible: number
  ends_at: string
  created_at: string
  resolved_at: string | null
  user_vote?: 'yes' | 'no' | null
  initiator?: Pick<User, 'id' | 'username' | 'phone'>
  current_admin?: Pick<User, 'id' | 'username' | 'phone'>
}

export interface Notification {
  id: string
  user_id: string
  type: string
  reference_id: string | null
  reference_type: string | null
  custom_message?: string | null
  is_read: boolean
  created_at: string
  message?: string
}

export interface PersonalConversation {
  id: string
  user_one_id: string
  user_two_id: string
  created_at: string
  updated_at: string
  other_user?: Pick<User, 'id' | 'username' | 'phone' | 'avatar_url' | 'primary_pincode'>
  last_message?: PersonalMessage | null
}

export interface PersonalMessage {
  id: string
  conversation_id: string
  sender_id: string
  sender?: Pick<User, 'id' | 'username' | 'avatar_url'>
  content: string | null
  media_url: string | null
  media_asset_id?: string | null
  is_deleted: boolean
  created_at: string
}

export type Category =
  | 'Residents'
  | 'Help'
  | 'Events'
  | 'Marketplace'
  | 'Buy & Sell'
  | 'Food'
  | 'Sports'
  | 'Parents'
  | 'Pets'
  | 'Announcement'
  | 'General'

export const CATEGORIES: { label: string; emoji: string; color: string }[] = [
  { label: 'Residents', emoji: '🏠', color: '#FF4D00' },
  { label: 'Help',      emoji: '❤️', color: '#16A34A' },
  { label: 'Events',    emoji: '🎉', color: '#A855F7' },
  { label: 'Marketplace', emoji: '🛒', color: '#4D9EFF' },
  { label: 'Buy & Sell', emoji: '🛒', color: '#4D9EFF' },
  { label: 'Food',      emoji: '🍕', color: '#FFB800' },
  { label: 'Sports',    emoji: '⚽', color: '#00FFB2' },
  { label: 'Parents',   emoji: '👨‍👩‍👧', color: '#FF6B9D' },
  { label: 'Pets',      emoji: '🐾', color: '#69DB7C' },
  { label: 'Announcement', emoji: '📣', color: '#F97316' },
  { label: 'General',   emoji: '💬', color: '#888888' },
]

export const getCategoryColor = (cat: string) =>
  CATEGORIES.find(c => c.label === cat)?.color ?? '#888888'

export const getCategoryEmoji = (cat: string) =>
  CATEGORIES.find(c => c.label === cat)?.emoji ?? '💬'
