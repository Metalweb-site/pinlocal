import { pool, testConnection, withTransaction } from '../client';

const CONFIRM_VALUE = 'PINLOCAL_RESET';
const RESET_ALL_CONFIRM_VALUE = 'PINLOCAL_RESET_ALL';

const DATA_TABLES = [
  'admin_audit_logs',
  'reports',
  'user_sanctions',
  'notifications',
  'user_thread_notif_prefs',
  'user_notification_settings',
  'user_group_notif_prefs',
  'personal_conversation_notif_prefs',
  'post_comments',
  'post_swipes',
  'post_saves',
  'post_likes',
  'posts',
  'message_reactions',
  'messages',
  'personal_conversation_cursors',
  'personal_messages',
  'personal_conversations',
  'user_thread_cursors',
  'threads',
  'group_admin_vote_ballots',
  'group_admin_votes',
  'group_memberships',
  'groups',
  'media_assets',
  'user_connections',
  'otp_store',
  'users',
];

const MASTER_DATA_TABLES = [
  'pincode_meta',
];

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function isConfirmed() {
  return process.argv.includes('--confirm') || process.env.RESET_DATABASE_CONFIRM === CONFIRM_VALUE;
}

function shouldResetMasterData() {
  return process.argv.includes('--all') || process.env.RESET_DATABASE_CONFIRM === RESET_ALL_CONFIRM_VALUE;
}

async function resetDatabase() {
  if (!isConfirmed()) {
    console.error(`
[Reset] Refusing to wipe the database without confirmation.

This deletes users, profiles, groups, threads, messages, posts, comments,
reports, notifications, media asset records, and OTPs.
It keeps the schema, _migrations table, and pincode master data intact.

Run one of these:
  npm run reset:db -- --confirm
  RESET_DATABASE_CONFIRM=${CONFIRM_VALUE} npm run reset:db

Only if you also want to delete pincode master data:
  npm run reset:db:all -- --confirm
  RESET_DATABASE_CONFIRM=${RESET_ALL_CONFIRM_VALUE} npm run reset:db
`);
    process.exit(1);
  }

  const resetAll = shouldResetMasterData();
  const tablesToReset = resetAll ? [...DATA_TABLES, ...MASTER_DATA_TABLES] : DATA_TABLES;

  await testConnection();
  await withTransaction(async (client) => {
    const existing = await client.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])
      `,
      [tablesToReset]
    );

    const tables = existing.rows.map(row => row.table_name);
    if (tables.length === 0) {
      console.log('[Reset] No app data tables found.');
      return;
    }

    await client.query(`TRUNCATE TABLE ${tables.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
    console.log(`[Reset] Wiped ${tables.length} ${resetAll ? 'data/master' : 'data'} tables.`);
  });

  console.log(resetAll
    ? '[Reset] Database is fully clean, including pincode data. Run npm run seed or import pincodes before production testing.'
    : '[Reset] App data is clean. Pincode master data was kept.'
  );
}

resetDatabase()
  .catch((err) => {
    console.error('[Reset] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
