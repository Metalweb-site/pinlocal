import fs from 'fs';
import path from 'path';
import { pool, testConnection } from '../client';

async function runMigrations() {
  await testConnection();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const schemaPath = path.join(__dirname, '..', '..', '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    const migrationName = '001_initial_schema';
    const already = await client.query('SELECT id FROM _migrations WHERE name = $1', [migrationName]);

    if (already.rowCount && already.rowCount > 0) {
      console.log(`[Migrate] ${migrationName} already applied, skipping.`);
    } else {
      console.log(`[Migrate] Applying ${migrationName}...`);
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migrationName]);
      console.log(`[Migrate] ${migrationName} applied successfully.`);
    }

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_name = 'groups_pincode_fkey'
            AND table_name = 'groups'
        ) THEN
          ALTER TABLE groups DROP CONSTRAINT groups_pincode_fkey;
        END IF;
      END $$;
    `);

    await client.query(`
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
    `);

    await client.query(`
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS custom_message TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS passcode_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS location_text VARCHAR(120);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url TEXT;
      ALTER TABLE groups ADD COLUMN IF NOT EXISTS status VARCHAR(15) DEFAULT 'active';
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0;
      ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_asset_ids UUID[] DEFAULT '{}';
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_asset_id UUID;
      ALTER TABLE IF EXISTS personal_messages ADD COLUMN IF NOT EXISTS media_asset_id UUID;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_response TEXT;
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS actioned_by UUID REFERENCES users(id);
      ALTER TABLE reports ADD COLUMN IF NOT EXISTS actioned_at TIMESTAMPTZ;
      ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_content_type_check;
      ALTER TABLE reports ADD CONSTRAINT reports_content_type_check CHECK (content_type IN ('post','message','group','user','comment'));

      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_category_created ON posts(category, created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS post_swipes (
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, post_id)
      );
      CREATE INDEX IF NOT EXISTS idx_post_swipes_post_created ON post_swipes(post_id, created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS post_saves (
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, post_id)
      );
      CREATE INDEX IF NOT EXISTS idx_post_saves_user_created ON post_saves(user_id, created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_admin_votes (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id              UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        initiator_user_id     UUID NOT NULL REFERENCES users(id),
        current_admin_user_id UUID NOT NULL REFERENCES users(id),
        status                VARCHAR(15) DEFAULT 'active' CHECK (status IN ('active','passed','failed')),
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
    `);

    await client.query(`
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
        media_asset_id    UUID,
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
    `);

    await client.query(`
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
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
        user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
        emoji      VARCHAR(16) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
    `);

    await client.query(`
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
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_connections (
        follower_id  UUID REFERENCES users(id) ON DELETE CASCADE,
        following_id UUID REFERENCES users(id) ON DELETE CASCADE,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (follower_id, following_id),
        CHECK (follower_id <> following_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_connections_follower ON user_connections(follower_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_connections_following ON user_connections(following_id, created_at DESC);
    `);

    await client.query(`
      DO $$
      DECLARE
        bot_ids UUID[] := '{}';
      BEGIN
        IF to_regclass('public.bot_profiles') IS NOT NULL THEN
          SELECT ARRAY(SELECT user_id FROM bot_profiles) INTO bot_ids;
        END IF;

        SELECT ARRAY(
          SELECT DISTINCT id
          FROM users
          WHERE phone IN ('bot-v-raftaar', 'bot-v-rajveer')
             OR id = ANY(bot_ids)
        ) INTO bot_ids;

        IF array_length(bot_ids, 1) IS NOT NULL THEN
          UPDATE user_thread_cursors
          SET last_read_msg_id = NULL
          WHERE last_read_msg_id IN (SELECT id FROM messages WHERE sender_id = ANY(bot_ids));

          DELETE FROM message_reactions
          WHERE message_id IN (SELECT id FROM messages WHERE sender_id = ANY(bot_ids));

          DELETE FROM messages WHERE sender_id = ANY(bot_ids);
          DELETE FROM group_memberships WHERE user_id = ANY(bot_ids);
          DELETE FROM users WHERE id = ANY(bot_ids);
        END IF;

        DROP TABLE IF EXISTS bot_profiles;
        ALTER TABLE users DROP COLUMN IF EXISTS is_bot;
      END $$;
    `);

    console.log('[Migrate] Compatibility migrations complete.');

    console.log('[Migrate] All migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[Migrate] Fatal error:', err.message);
  process.exit(1);
});
