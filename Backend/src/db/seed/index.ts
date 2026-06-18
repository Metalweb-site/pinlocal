import fs from 'fs';
import path from 'path';
import { pool, testConnection } from '../client';

type SeedPincodeRow = {
  pincode: string;
  city: string | null;
  district: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  neighbors: string[];
};

type ParsedArgs = {
  filePath: string | null;
  sampleOnly: boolean;
};

const SAMPLE_PINCODES: SeedPincodeRow[] = [
  { pincode: '400001', city: 'Mumbai', district: 'Mumbai City', state: 'Maharashtra', lat: 18.9322, lng: 72.8264, neighbors: ['400002', '400003'] },
  { pincode: '110001', city: 'New Delhi', district: 'Central Delhi', state: 'Delhi', lat: 28.6353, lng: 77.2250, neighbors: ['110002', '110003'] },
  { pincode: '560001', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', lat: 12.9716, lng: 77.5946, neighbors: ['560002', '560003'] },
  { pincode: '600001', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, neighbors: ['600002', '600003'] },
  { pincode: '700001', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, neighbors: ['700002', '700003'] },
];

const FALLBACK_UNKNOWN_PINCODE: SeedPincodeRow = {
  pincode: '000000',
  city: 'Unknown',
  district: 'Unknown',
  state: 'Unknown',
  lat: 0,
  lng: 0,
  neighbors: [],
};

const DEFAULT_DATASET_CANDIDATES = [
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india-pincodes.csv'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india_pincodes.csv'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india-pincodes.json'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india_pincodes.json'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india-pincodes-full.csv'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india_pincodes_full.csv'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india-pincodes-full.json'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'india_pincodes_full.json'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'pincodes.csv'),
  path.resolve(__dirname, '..', '..', '..', 'data', 'pincodes', 'pincodes.json'),
];

const NEIGHBOR_RADIUS_KM = Number(process.env.PINCODE_NEIGHBOR_RADIUS_KM ?? '8');
const NEIGHBOR_MAX_COUNT = Number(process.env.PINCODE_NEIGHBOR_MAX_COUNT ?? '12');
const GRID_CELL_DEGREES = Number(process.env.PINCODE_GRID_CELL_DEGREES ?? '0.12');
const IMPORT_BATCH_SIZE = Math.max(1, Number(process.env.PINCODE_IMPORT_BATCH_SIZE ?? '500'));
const IMPORT_MODE = (process.env.PINCODE_IMPORT_MODE ?? 'replace').trim().toLowerCase();

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let filePath: string | null = process.env.PINCODE_DATA_FILE ?? null;
  let sampleOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--sample') {
      sampleOnly = true;
      continue;
    }
    if (arg === '--file' && args[index + 1]) {
      filePath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--file=')) {
      filePath = arg.slice('--file='.length);
    }
  }

  return { filePath, sampleOnly };
}

function resolveDatasetPath(filePath: string | null): string | null {
  if (filePath) {
    const absolute = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(__dirname, '..', '..', '..', filePath);
    return fs.existsSync(absolute) ? absolute : null;
  }

  return DEFAULT_DATASET_CANDIDATES.find(candidate => fs.existsSync(candidate)) ?? null;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content: string): Record<string, string>[] {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const direct = record[key];
    if (direct !== undefined && direct !== null && String(direct).trim() !== '') return direct;

    const normalized = normalizeHeader(key);
    if (normalized !== key) {
      const normalizedValue = record[normalized];
      if (normalizedValue !== undefined && normalizedValue !== null && String(normalizedValue).trim() !== '') return normalizedValue;
    }
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCoordinate(value: number | null, kind: 'lat' | 'lng'): number | null {
  if (value === null) return null;
  if (value === 0) return null;

  const min = kind === 'lat' ? 6 : 68;
  const max = kind === 'lat' ? 38 : 98;
  if (value < min || value > max) return null;

  return Number(value.toFixed(6));
}

function cleanText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean || null;
}

function normalizeLocalityLabel(value: string | null): string | null {
  if (!value) return null;

  const stripped = value
    .replace(/\b(GPO|H\.?O|S\.?O|B\.?O)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return stripped || value;
}

function normalizePincodeRow(record: Record<string, unknown>): SeedPincodeRow | null {
  const rawPincode = cleanText(firstValue(record, ['pincode', 'pin_code', 'postal_code', 'zip', 'zipcode']));
  if (!rawPincode) return null;

  const pincode = rawPincode.replace(/\D/g, '');
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return null;

  const lat = normalizeCoordinate(parseNumber(firstValue(record, ['lat', 'latitude'])), 'lat');
  const lng = normalizeCoordinate(parseNumber(firstValue(record, ['lng', 'lon', 'long', 'longitude'])), 'lng');

  return {
    pincode,
    city: normalizeLocalityLabel(cleanText(firstValue(record, ['city', 'area', 'locality', 'division_name', 'office_name', 'taluk', 'region']))),
    district: cleanText(firstValue(record, ['district', 'district_name'])),
    state: cleanText(firstValue(record, ['state', 'state_name', 'province'])),
    lat,
    lng,
    neighbors: [],
  };
}

function readDatasetRows(filePath: string): SeedPincodeRow[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  let rawRows: Record<string, unknown>[];

  if (ext === '.json') {
    const parsed = JSON.parse(content);
    rawRows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.rows)
        ? parsed.rows
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
  } else {
    rawRows = parseCsv(content);
  }

  const map = new Map<string, SeedPincodeRow>();
  for (const record of rawRows) {
    const row = normalizePincodeRow(record);
    if (!row) continue;

    const existing = map.get(row.pincode);
    if (!existing) {
      map.set(row.pincode, row);
      continue;
    }

    map.set(row.pincode, {
      pincode: row.pincode,
      city: existing.city ?? row.city,
      district: existing.district ?? row.district,
      state: existing.state ?? row.state,
      lat: existing.lat ?? row.lat,
      lng: existing.lng ?? row.lng,
      neighbors: [],
    });
  }

  return Array.from(map.values()).sort((a, b) => a.pincode.localeCompare(b.pincode));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKm(a: SeedPincodeRow, b: SeedPincodeRow): number {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return Number.POSITIVE_INFINITY;
  const earthRadius = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function bucketKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_CELL_DEGREES)}:${Math.floor(lng / GRID_CELL_DEGREES)}`;
}

function computeNeighbors(rows: SeedPincodeRow[]): SeedPincodeRow[] {
  const buckets = new Map<string, SeedPincodeRow[]>();
  const searchable = rows.filter(row => row.lat !== null && row.lng !== null);

  for (const row of searchable) {
    const key = bucketKey(row.lat as number, row.lng as number);
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const cellRadius = Math.max(1, Math.ceil(NEIGHBOR_RADIUS_KM / (111 * GRID_CELL_DEGREES)));

  for (const row of searchable) {
    const latBucket = Math.floor((row.lat as number) / GRID_CELL_DEGREES);
    const lngBucket = Math.floor((row.lng as number) / GRID_CELL_DEGREES);
    const candidates: Array<{ pincode: string; distance: number }> = [];

    for (let latOffset = -cellRadius; latOffset <= cellRadius; latOffset += 1) {
      for (let lngOffset = -cellRadius; lngOffset <= cellRadius; lngOffset += 1) {
        const bucket = buckets.get(`${latBucket + latOffset}:${lngBucket + lngOffset}`) ?? [];
        for (const candidate of bucket) {
          if (candidate.pincode === row.pincode) continue;
          const distance = distanceKm(row, candidate);
          if (distance <= NEIGHBOR_RADIUS_KM) {
            candidates.push({ pincode: candidate.pincode, distance });
          }
        }
      }
    }

    row.neighbors = candidates
      .sort((a, b) => a.distance - b.distance || a.pincode.localeCompare(b.pincode))
      .slice(0, NEIGHBOR_MAX_COUNT)
      .map(candidate => candidate.pincode);
  }

  return rows;
}

async function writeRows(rows: SeedPincodeRow[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = 0`);

    if (IMPORT_MODE === 'replace') {
      await client.query(`DELETE FROM pincode_meta`);
    }

    for (let offset = 0; offset < rows.length; offset += IMPORT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + IMPORT_BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders = batch.map((row, index) => {
        const base = index * 7;
        values.push(row.pincode, row.city, row.district, row.state, row.lat, row.lng, row.neighbors);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
      }).join(', ');

      if (IMPORT_MODE === 'upsert') {
        await client.query(
          `INSERT INTO pincode_meta (pincode, city, district, state, lat, lng, neighbor_codes)
           VALUES ${placeholders}
           ON CONFLICT (pincode) DO UPDATE
             SET city = EXCLUDED.city,
                 district = EXCLUDED.district,
                 state = EXCLUDED.state,
                 lat = EXCLUDED.lat,
                 lng = EXCLUDED.lng,
                 neighbor_codes = EXCLUDED.neighbor_codes`,
          values
        );
      } else {
        await client.query(
          `INSERT INTO pincode_meta (pincode, city, district, state, lat, lng, neighbor_codes)
           VALUES ${placeholders}`,
          values
        );
      }

      const processed = Math.min(offset + batch.length, rows.length);
      if (processed === rows.length || processed % Math.max(IMPORT_BATCH_SIZE * 5, 2500) === 0) {
        console.log(`[Seed] Imported ${processed}/${rows.length} pincode rows...`);
      }
    }

    await client.query('COMMIT');
    await client.query('ANALYZE pincode_meta');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function buildSeedRows(datasetRows: SeedPincodeRow[] | null, sampleOnly: boolean): { rows: SeedPincodeRow[]; mode: string } {
  if (sampleOnly || !datasetRows || datasetRows.length === 0) {
    return {
      rows: [...SAMPLE_PINCODES, FALLBACK_UNKNOWN_PINCODE],
      mode: sampleOnly ? 'sample-only' : 'sample-fallback',
    };
  }

  const withUnknown = [...datasetRows.filter(row => row.pincode !== FALLBACK_UNKNOWN_PINCODE.pincode), FALLBACK_UNKNOWN_PINCODE];
  return { rows: computeNeighbors(withUnknown), mode: 'dataset-import' };
}

function assertUniquePincodes(rows: SeedPincodeRow[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.pincode)) {
      duplicates.add(row.pincode);
    } else {
      seen.add(row.pincode);
    }
  }

  if (duplicates.size > 0) {
    const sample = Array.from(duplicates).slice(0, 10).join(', ');
    throw new Error(`Duplicate pincodes detected in import payload: ${sample}`);
  }
}

async function seed() {
  const { filePath, sampleOnly } = parseArgs();
  const datasetPath = sampleOnly ? null : resolveDatasetPath(filePath);

  await testConnection();

  let datasetRows: SeedPincodeRow[] | null = null;
  if (datasetPath) {
    console.log(`[Seed] Loading pincode dataset from ${datasetPath}`);
    datasetRows = readDatasetRows(datasetPath);
    console.log(`[Seed] Parsed ${datasetRows.length} valid pincode rows from dataset.`);
    const rowsWithCoordinates = datasetRows.filter(row => row.lat !== null && row.lng !== null).length;
    console.log(`[Seed] ${rowsWithCoordinates} rows have usable coordinates; ${datasetRows.length - rowsWithCoordinates} will import without neighbor geo links.`);
  } else if (filePath && !sampleOnly) {
    console.warn(`[Seed] Dataset file not found: ${filePath}`);
  } else {
    console.log('[Seed] No external pincode dataset found, using fallback sample data.');
  }

  const { rows, mode } = buildSeedRows(datasetRows, sampleOnly);
  assertUniquePincodes(rows);
  console.log(`[Seed] Writing ${rows.length} pincode_meta rows (${mode}, ${IMPORT_MODE} mode, batch ${IMPORT_BATCH_SIZE}).`);
  await writeRows(rows);

  if (mode !== 'dataset-import') {
    console.log('[Seed] Only sample pincodes exist right now. Import a real India dataset before wide production testing.');
    console.log('[Seed] You can run: npm run seed -- --file ./data/pincodes/india-pincodes.csv');
  }

  console.log('[Seed] Pincode seeding complete.');
}

seed()
  .catch((err) => {
    console.error('[Seed] Fatal error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
