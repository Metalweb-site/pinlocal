-- ============================================================
-- PinLocal — Full Database Schema
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone             VARCHAR(15) UNIQUE NOT NULL,
  username          VARCHAR(30) UNIQUE,
  avatar_url        TEXT,
  cover_image_url   TEXT,
  bio               TEXT,
  location_text     VARCHAR(120),
  locality_name     VARCHAR(120),
  locality_user_edited BOOLEAN DEFAULT FALSE,
  locality_confirmed BOOLEAN DEFAULT FALSE,
  city              VARCHAR(120),
  district          VARCHAR(120),
  state             VARCHAR(120),
  latitude          DECIMAL(9,6),
  longitude         DECIMAL(9,6),
  location_source   VARCHAR(20),
  location_accuracy_meters INT,
  website_url       TEXT,
  passcode_hash     TEXT,
  primary_pincode   VARCHAR(6) NOT NULL,
  secondary_pincode VARCHAR(6),
  interests         TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  last_seen         TIMESTAMPTZ DEFAULT NOW()
);

-- USER CONNECTIONS / FOLLOWS
CREATE TABLE IF NOT EXISTS user_connections (
  follower_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_user_connections_follower ON user_connections(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_connections_following ON user_connections(following_id, created_at DESC);

-- PINCODE METADATA
CREATE TABLE IF NOT EXISTS pincode_meta (
  pincode           VARCHAR(6) PRIMARY KEY,
  city              VARCHAR(100),
  district          VARCHAR(100),
  state             VARCHAR(100),
  lat               DECIMAL(9,6),
  lng               DECIMAL(9,6),
  neighbor_codes    TEXT[] DEFAULT '{}',
  active_users_30d  INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reverse_geocode_cache (
  cache_key              VARCHAR(32) PRIMARY KEY,
  lat                    DECIMAL(9,6) NOT NULL,
  lng                    DECIMAL(9,6) NOT NULL,
  pincode                VARCHAR(6),
  locality_name          VARCHAR(120),
  city                   VARCHAR(120),
  district               VARCHAR(120),
  state                  VARCHAR(120),
  display_name           TEXT,
  source                 VARCHAR(20) DEFAULT 'nominatim',
  expires_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reverse_geocode_cache_expires ON reverse_geocode_cache(expires_at);

CREATE TABLE IF NOT EXISTS pincode_locality_defaults (
  pincode              VARCHAR(6) PRIMARY KEY REFERENCES pincode_meta(pincode) ON DELETE CASCADE,
  canonical_locality   VARCHAR(120) NOT NULL,
  normalized_locality  VARCHAR(120) NOT NULL,
  confidence_score     DECIMAL(5,2) DEFAULT 0,
  support_count        INT DEFAULT 0,
  weighted_score       INT DEFAULT 0,
  total_contributors   INT DEFAULT 0,
  runner_up_locality   VARCHAR(120),
  runner_up_weight     INT DEFAULT 0,
  status               VARCHAR(15) DEFAULT 'pending' CHECK (status IN ('pending','confirmed')),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pincode_locality_defaults_status ON pincode_locality_defaults(status, updated_at DESC);

-- MEDIA ASSETS
CREATE TABLE IF NOT EXISTS media_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_type        VARCHAR(10) NOT NULL CHECK (media_type IN ('image','video')),
  mime_type         VARCHAR(80) NOT NULL,
  original_url      TEXT NOT NULL,
  original_key      TEXT NOT NULL,
  processed_url     TEXT,
  processed_key     TEXT,
  thumbnail_url     TEXT,
  thumbnail_key     TEXT,
  status            VARCHAR(15) DEFAULT 'uploaded'
                    CHECK (status IN ('uploaded','processing','ready','failed','rejected')),
  moderation_status VARCHAR(15) DEFAULT 'pending'
                    CHECK (moderation_status IN ('pending','approved','rejected','review')),
  size_bytes        INT NOT NULL,
  duration_seconds  DECIMAL(10,3),
  width             INT,
  height            INT,
  error_message     TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_assets_user_created ON media_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status, created_at DESC);

-- GROUPS
CREATE TABLE IF NOT EXISTS groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(80) NOT NULL,
  description       TEXT,
  cover_image_url   TEXT,
  pincode           VARCHAR(6) NOT NULL,
  category          VARCHAR(30) NOT NULL,
  type              VARCHAR(10) NOT NULL CHECK (type IN ('open','private','secret')),
  status            VARCHAR(15) DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
  admin_user_id     UUID NOT NULL REFERENCES users(id),
  member_count      INT DEFAULT 1,
  post_count        INT DEFAULT 0,
  engagement_score  DECIMAL(10,4) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_groups_pincode  ON groups(pincode);
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category);

-- GROUP MEMBERSHIPS
CREATE TABLE IF NOT EXISTS group_memberships (
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id          UUID REFERENCES groups(id) ON DELETE CASCADE,
  role              VARCHAR(15) DEFAULT 'member' CHECK (role IN ('admin','moderator','member')),
  status            VARCHAR(10) DEFAULT 'active'  CHECK (status IN ('active','pending','banned')),
  joined_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_group ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user  ON group_memberships(user_id);

-- GROUP MAIN ADMIN VOTES
CREATE TABLE IF NOT EXISTS group_admin_votes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  initiator_user_id     UUID NOT NULL REFERENCES users(id),
  current_admin_user_id UUID NOT NULL REFERENCES users(id),
  status                VARCHAR(15) DEFAULT 'active'
                        CHECK (status IN ('active','passed','failed')),
  yes_count             INT DEFAULT 0,
  no_count              INT DEFAULT 0,
  total_eligible        INT NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_group_admin_votes_group ON group_admin_votes(group_id, status);

CREATE TABLE IF NOT EXISTS group_admin_vote_ballots (
  vote_id    UUID REFERENCES group_admin_votes(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  choice     VARCHAR(3) NOT NULL CHECK (choice IN ('yes','no')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (vote_id, user_id)
);

-- THREADS
CREATE TABLE IF NOT EXISTS threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name              VARCHAR(50) NOT NULL,
  is_announcement   BOOLEAN DEFAULT FALSE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_threads_group ON threads(group_id);

-- MESSAGES
CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id),
  content           TEXT,
  media_url         TEXT,
  media_asset_id    UUID REFERENCES media_assets(id),
  reply_to_id       UUID REFERENCES messages(id),
  is_deleted        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread  ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji      VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);

-- PERSONAL CHATS
CREATE TABLE IF NOT EXISTS personal_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_one_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_two_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_one_id <> user_two_id),
  UNIQUE (user_one_id, user_two_id)
);
CREATE INDEX IF NOT EXISTS idx_personal_conversations_user_one ON personal_conversations(user_one_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_conversations_user_two ON personal_conversations(user_two_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS personal_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES personal_conversations(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id),
  content           TEXT,
  media_url         TEXT,
  media_asset_id    UUID REFERENCES media_assets(id),
  is_deleted        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_personal_messages_conversation ON personal_messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS personal_conversation_cursors (
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES personal_conversations(id) ON DELETE CASCADE,
  last_read_msg_id  UUID REFERENCES personal_messages(id),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

-- USER THREAD CURSORS
CREATE TABLE IF NOT EXISTS user_thread_cursors (
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  thread_id         UUID REFERENCES threads(id) ON DELETE CASCADE,
  last_read_msg_id  UUID REFERENCES messages(id),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, thread_id)
);

-- POSTS
CREATE TABLE IF NOT EXISTS posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_user_id    UUID NOT NULL REFERENCES users(id),
  pincode           VARCHAR(6) NOT NULL,
  category          VARCHAR(30),
  content_text      TEXT,
  media_urls        TEXT[] DEFAULT '{}',
  media_asset_ids   UUID[] DEFAULT '{}',
  like_count        INT DEFAULT 0,
  comment_count     INT DEFAULT 0,
  swipe_count       INT DEFAULT 0,
  share_count       INT DEFAULT 0,
  engagement_score  DECIMAL(10,4) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_posts_pincode ON posts(pincode);
CREATE INDEX IF NOT EXISTS idx_posts_score   ON posts(pincode, engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts(category, created_at DESC);

-- POST LIKES
CREATE TABLE IF NOT EXISTS post_likes (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- POST SAVES
CREATE TABLE IF NOT EXISTS post_saves (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_saves_user_created ON post_saves(user_id, created_at DESC);

-- POST SWIPES / GROUP JOINS FROM FEED
CREATE TABLE IF NOT EXISTS post_swipes (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_post_swipes_post_created ON post_swipes(post_id, created_at DESC);

-- POST COMMENTS
CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           VARCHAR(30) NOT NULL,
  reference_id   UUID,
  reference_type VARCHAR(20),
  custom_message TEXT,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, is_read);

-- USER THREAD NOTIFICATION PREFERENCES
CREATE TABLE IF NOT EXISTS user_thread_notif_prefs (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  thread_id  UUID REFERENCES threads(id) ON DELETE CASCADE,
  preference VARCHAR(15) DEFAULT 'mentions_only'
             CHECK (preference IN ('all','mentions_only','muted')),
  PRIMARY KEY (user_id, thread_id)
);

-- USER NOTIFICATION SETTINGS
CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled            BOOLEAN DEFAULT TRUE,
  email_enabled           BOOLEAN DEFAULT FALSE,
  group_updates_enabled   BOOLEAN DEFAULT TRUE,
  chat_messages_enabled   BOOLEAN DEFAULT TRUE,
  activity_enabled        BOOLEAN DEFAULT TRUE,
  quiet_hours_enabled     BOOLEAN DEFAULT FALSE,
  quiet_hours_start       TIME DEFAULT '22:00',
  quiet_hours_end         TIME DEFAULT '07:00',
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_group_notif_prefs (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id   UUID REFERENCES groups(id) ON DELETE CASCADE,
  preference VARCHAR(15) DEFAULT 'all' CHECK (preference IN ('all','muted')),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS personal_conversation_notif_prefs (
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id  UUID REFERENCES personal_conversations(id) ON DELETE CASCADE,
  preference       VARCHAR(15) DEFAULT 'all' CHECK (preference IN ('all','muted')),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

-- REPORTS
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id),
  content_type VARCHAR(15) NOT NULL CHECK (content_type IN ('post','message','group','user','comment')),
  content_id   UUID NOT NULL,
  reason       VARCHAR(30) NOT NULL,
  description  TEXT,
  status       VARCHAR(15) DEFAULT 'pending'
               CHECK (status IN ('pending','reviewed','actioned','dismissed')),
  admin_response TEXT,
  actioned_by UUID REFERENCES users(id),
  actioned_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- USER SANCTIONS
CREATE TABLE IF NOT EXISTS user_sanctions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  type       VARCHAR(10) NOT NULL CHECK (type IN ('warn','mute','suspend','ban')),
  scope      VARCHAR(10) NOT NULL CHECK (scope IN ('group','platform')),
  group_id   UUID REFERENCES groups(id),
  expires_at TIMESTAMPTZ,
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ADMIN AUDIT LOGS
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID NOT NULL REFERENCES users(id),
  action         VARCHAR(60) NOT NULL,
  target_type    VARCHAR(30),
  target_id      UUID,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs(target_type, target_id);

-- OTP STORE
CREATE TABLE IF NOT EXISTS otp_store (
  phone      VARCHAR(15) PRIMARY KEY,
  code       VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT DEFAULT 0
);
