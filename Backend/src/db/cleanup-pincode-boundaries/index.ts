import { pool, testConnection, withTransaction } from '../client';

const shouldFix = process.argv.includes('--fix');

async function cleanupPincodeBoundaries() {
  await testConnection();

  const invalidMemberships = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM group_memberships gm
    JOIN groups g ON g.id = gm.group_id
    JOIN users u ON u.id = gm.user_id
    WHERE gm.status = 'active'
      AND gm.role != 'admin'
      AND g.pincode NOT IN (u.primary_pincode, COALESCE(u.secondary_pincode, ''))
    `
  );

  const mismatchedPosts = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM posts p
    JOIN groups g ON g.id = p.group_id
    WHERE p.pincode != g.pincode
    `
  );

  console.log('[Cleanup] Invalid non-admin group memberships:', invalidMemberships.rows[0]?.count ?? '0');
  console.log('[Cleanup] Posts with pincode different from their group:', mismatchedPosts.rows[0]?.count ?? '0');

  if (!shouldFix) {
    console.log('[Cleanup] Dry run only. Run `npm run cleanup:pincode-boundaries -- --fix` to apply fixes.');
    return;
  }

  await withTransaction(async (client) => {
    const deletedMemberships = await client.query(
      `
      DELETE FROM group_memberships gm
      USING groups g, users u
      WHERE gm.group_id = g.id
        AND gm.user_id = u.id
        AND gm.status = 'active'
        AND gm.role != 'admin'
        AND g.pincode NOT IN (u.primary_pincode, COALESCE(u.secondary_pincode, ''))
      `
    );

    const fixedPosts = await client.query(
      `
      UPDATE posts p
      SET pincode = g.pincode
      FROM groups g
      WHERE p.group_id = g.id
        AND p.pincode != g.pincode
      `
    );

    await client.query(
      `
      UPDATE groups g
      SET member_count = COALESCE(active_members.count, 0)
      FROM (
        SELECT group_id, COUNT(*)::int AS count
        FROM group_memberships
        WHERE status = 'active'
        GROUP BY group_id
      ) active_members
      WHERE g.id = active_members.group_id
      `
    );

    await client.query(
      `
      UPDATE groups g
      SET member_count = 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM group_memberships gm
        WHERE gm.group_id = g.id
          AND gm.status = 'active'
      )
      `
    );

    await client.query(
      `
      UPDATE groups g
      SET post_count = COALESCE(posts.count, 0)
      FROM (
        SELECT group_id, COUNT(*)::int AS count
        FROM posts
        GROUP BY group_id
      ) posts
      WHERE g.id = posts.group_id
      `
    );

    await client.query(
      `
      UPDATE groups g
      SET post_count = 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM posts p
        WHERE p.group_id = g.id
      )
      `
    );

    console.log('[Cleanup] Deleted invalid non-admin memberships:', deletedMemberships.rowCount ?? 0);
    console.log('[Cleanup] Fixed mismatched post pincodes:', fixedPosts.rowCount ?? 0);
    console.log('[Cleanup] Recomputed group member/post counts.');
  });
}

cleanupPincodeBoundaries()
  .catch((err) => {
    console.error('[Cleanup] Failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
