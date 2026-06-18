import { pool, query, testConnection } from '../client';

type UserLocalityRow = {
  primary_pincode: string;
  locality_name: string | null;
  locality_user_edited: boolean | null;
  locality_confirmed: boolean | null;
};

type LocalityCandidate = {
  normalized: string;
  display: string;
  weight: number;
  userCount: number;
};

const LOCALITY_MIN_CONTRIBUTORS = Number(process.env.LOCALITY_MIN_CONTRIBUTORS ?? '10');
const LOCALITY_MIN_WIN_SHARE = Number(process.env.LOCALITY_MIN_WIN_SHARE ?? '0.6');
const LOCALITY_MIN_LEAD_SHARE = Number(process.env.LOCALITY_MIN_LEAD_SHARE ?? '0.2');
const LOCALITY_MIN_LEAD_WEIGHT = Number(process.env.LOCALITY_MIN_LEAD_WEIGHT ?? '3');

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

function localityWeight(row: Pick<UserLocalityRow, 'locality_user_edited' | 'locality_confirmed'>): number {
  if (row.locality_user_edited) return 4;
  if (row.locality_confirmed) return 2;
  return 1;
}

async function recomputePincodeLocalityConsensus(pincode: string): Promise<void> {
  const rows = await query<Pick<UserLocalityRow, 'locality_name' | 'locality_user_edited' | 'locality_confirmed'>>(
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

async function recomputeAll() {
  await testConnection();
  const pincodes = await query<{ primary_pincode: string }>(
    `
    SELECT DISTINCT primary_pincode
    FROM users
    WHERE primary_pincode <> '000000'
      AND COALESCE(TRIM(locality_name), '') <> ''
    ORDER BY primary_pincode
    `
  );

  console.log(`[LocalityConsensus] Recomputing ${pincodes.length} pincodes...`);
  for (const { primary_pincode } of pincodes) {
    await recomputePincodeLocalityConsensus(primary_pincode);
  }
  console.log('[LocalityConsensus] Done.');
}

recomputeAll()
  .catch((error) => {
    console.error('[LocalityConsensus] Fatal error:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
