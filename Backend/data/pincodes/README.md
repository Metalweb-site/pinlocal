Place your real pincode dataset in this folder before production testing.

Supported formats:
- `india-pincodes.csv`
- `india_pincodes.csv`
- `india-pincodes.json`
- `india_pincodes.json`
- `india-pincodes-full.csv`
- `india_pincodes_full.csv`
- `pincodes.csv`
- `pincodes.json`

Expected fields (any close variant is accepted):
- `pincode`
- `city`
- `district`
- `state`
- `lat` or `latitude`
- `lng` / `lon` / `longitude`

Examples:

1. Auto-detect default file
   `npm run seed`

2. Import a specific CSV
   `npm run import:pincodes -- --file ./data/pincodes/india-pincodes.csv`

3. Only insert demo pincodes
   `npm run seed:sample`

Notes:
- Real latitude/longitude values are strongly recommended.
- Neighbor pincodes are generated automatically from coordinates.
- Production imports should use `PINCODE_IMPORT_MODE=replace` so the master pincode table is refreshed cleanly.
- A fallback `000000` row is always inserted for onboarding placeholders.
