import { pool, testConnection } from '../client';

const SAMPLE_PINCODES = [
  { pincode: '400001', city: 'Mumbai', district: 'Mumbai City', state: 'Maharashtra', lat: 18.9322, lng: 72.8264, neighbors: ['400002', '400003'] },
  { pincode: '110001', city: 'New Delhi', district: 'Central Delhi', state: 'Delhi', lat: 28.6353, lng: 77.2250, neighbors: ['110002', '110003'] },
  { pincode: '560001', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', lat: 12.9716, lng: 77.5946, neighbors: ['560002', '560003'] },
  { pincode: '600001', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, neighbors: ['600002', '600003'] },
  { pincode: '700001', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, neighbors: ['700002', '700003'] },
  { pincode: '000000', city: 'Unknown', district: 'Unknown', state: 'Unknown', lat: 0, lng: 0, neighbors: [] },
];

async function seed() {
  await testConnection();
  const client = await pool.connect();

  try {
    console.log('[Seed] Inserting pincode_meta rows...');

    for (const row of SAMPLE_PINCODES) {
      await client.query(
        `INSERT INTO pincode_meta (pincode, city, district, state, lat, lng, neighbor_codes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (pincode) DO UPDATE
           SET city = EXCLUDED.city,
               district = EXCLUDED.district,
               state = EXCLUDED.state,
               lat = EXCLUDED.lat,
               lng = EXCLUDED.lng,
               neighbor_codes = EXCLUDED.neighbor_codes`,
        [row.pincode, row.city, row.district, row.state, row.lat, row.lng, row.neighbors]
      );
    }

    console.log(`[Seed] Inserted/updated ${SAMPLE_PINCODES.length} pincodes.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[Seed] Fatal error:', err.message);
  process.exit(1);
});
