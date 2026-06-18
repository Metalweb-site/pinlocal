# PinLocal Backend API

A lightweight, production-ready Fastify-based backend for the PinLocal neighborhood community platform. Built with TypeScript, PostgreSQL, Redis, and Socket.io for real-time communication.

## Stack

- **Framework**: Fastify 4.27.0 (lightweight HTTP server)
- **Language**: TypeScript 5.5.3 (strict mode)
- **Database**: PostgreSQL 15+ via pg (connection pooling)
- **Cache/Queue**: Redis (ioredis) + Bull MQ for background jobs
- **Real-time**: Socket.io 4.7.5 (WebSocket with JWT auth)
- **Auth**: JWT (jsonwebtoken) with HTTP-only cookies
- **Storage**: Cloudflare R2 (S3-compatible media uploads)
- **OTP**: MSG91 API for phone-based authentication
- **Rate Limiting**: @fastify/rate-limit

## Project Structure

```
src/
├── index.ts              # Fastify app bootstrap, plugin registration, route mounting
├── config/               # Environment variable management
├── db/
│   ├── client.ts         # PostgreSQL connection pool & query abstractions
│   ├── migrations/       # Schema migrations (runs on startup)
│   └── seed/             # Sample data for development
├── types/                # TypeScript interfaces for all domain objects
├── utils/                # Error handlers, formatters, pagination helpers
├── middleware/           # Auth & validation middleware
├── services/
│   ├── auth/             # JWT operations & user lifecycle
│   ├── otp/              # OTP generation, delivery, verification
│   ├── redis/            # Redis connection & cache helpers
│   ├── socket/           # Socket.io event handlers
│   └── storage/          # Cloudflare R2 file operations
├── api/
│   ├── auth/             # POST /send-otp, /verify-otp, /refresh, /logout
│   ├── users/            # GET /me, PATCH /me (profile)
│   ├── feed/             # GET / (paginated with ranking algorithm)
│   ├── groups/           # CRUD, membership management
│   ├── threads/          # Thread management within groups
│   ├── messages/         # Message retrieval & deletion
│   ├── posts/            # Post CRUD, likes, comments
│   └── media/            # File upload to R2
└── jobs/
    ├── engagement/       # Hourly engagement score recalculation
    └── cleanup/          # Nightly maintenance (OTP cleanup, user activity)
```

## Setup

### Prerequisites
- Node.js 20+ 
- PostgreSQL 15+
- Redis instance
- Supabase account (or local PostgreSQL)
- Upstash Redis (or local Redis)

### Installation

```bash
cd Backend
npm install
```

### Configuration

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- `DATABASE_URL`: Supabase or PostgreSQL connection string
- `REDIS_URL`: Redis connection (Upstash or local)
- `JWT_SECRET`: Generate with `openssl rand -hex 64`
- `MSG91_AUTH_KEY`: OTP service credentials (optional in dev)
- `R2_*`: Cloudflare R2 credentials (optional in dev)

### Database Setup

```bash
# Apply schema migrations
npm run migrate

# Auto-import real pincodes if a dataset exists in Backend/data/pincodes/
npm run seed

# Force sample-only fallback data
npm run seed:sample

# Import a specific file
npm run import:pincodes -- --file ./data/pincodes/india-pincodes.csv

# Recompute pincode locality winners from existing users
npm run recompute:localities
```

### Pincode Data

For real testing, put a real India pincode dataset inside:

`Backend/data/pincodes/`

Supported names:
- `india-pincodes.csv`
- `india_pincodes.csv`
- `india-pincodes.json`
- `india_pincodes.json`
- `india-pincodes-full.csv`
- `india_pincodes_full.csv`
- `pincodes.csv`
- `pincodes.json`

The import flow validates pincodes, deduplicates rows, keeps the fallback `000000` row, and generates nearby `neighbor_codes` automatically from coordinates.
For production imports, use `PINCODE_IMPORT_MODE=replace` so the master table is refreshed cleanly in one pass.

### Locality Consensus

PinLocal can learn a canonical locality name per pincode from real users:

- GPS / detected locality only: weight `1`
- User accepted / confirmed locality: weight `2`
- User manually edited locality: weight `4`

Once a pincode reaches enough contributors and a strong winner, the backend can use that pincode-level winner directly and skip unnecessary reverse-geocoding calls for later users in the same area.

## Running

### Development

```bash
npm run dev
```

Server runs on `http://localhost:3001` with auto-reload via nodemon.

### Build

```bash
npm run build
```

Outputs compiled JavaScript to `dist/`.

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/send-otp` - Request OTP (rate-limited 3/10min)
- `POST /api/v1/auth/verify-otp` - Verify OTP & get JWT
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Clear cookies

### Users
- `GET /api/v1/users/me` - Fetch current user profile
- `PATCH /api/v1/users/me` - Update profile (username, avatar, pincodes, interests)

### Feed
- `GET /api/v1/feed` - Paginated feed with ranking algorithm

### Groups, Threads, Messages, Posts, Media
- Full CRUD operations (to be implemented)

## Environment Variables

See `.env.example` for all available options:

```
PORT                    # Server port (default 3001)
NODE_ENV                # development | production
CORS_ORIGIN             # Comma-separated allowed origins
JWT_SECRET              # 64-char hex string
JWT_ACCESS_EXPIRES      # Access token TTL (default 30d)
JWT_REFRESH_EXPIRES     # Refresh token TTL (default 90d)
DATABASE_URL            # PostgreSQL connection string
DB_POOL_MAX             # Connection pool size (default 10)
REDIS_URL               # Redis connection string
MSG91_AUTH_KEY          # OTP service API key (optional)
MSG91_TEMPLATE_ID       # OTP SMS template (optional)
R2_ACCOUNT_ID           # Cloudflare R2 account (optional)
R2_ACCESS_KEY_ID        # R2 API key (optional)
R2_SECRET_ACCESS_KEY    # R2 API secret (optional)
CDN_BASE_URL            # R2 CDN base URL (optional)
PINCODE_DATA_FILE       # Optional CSV/JSON path for pincode import
PINCODE_NEIGHBOR_RADIUS_KM
PINCODE_NEIGHBOR_MAX_COUNT
PINCODE_IMPORT_BATCH_SIZE
```

## Development Notes

### JWT Tokens
- **Access Token**: 30-day expiry, stored in HTTP-only cookie
- **Refresh Token**: 90-day expiry, can be used to get new access token
- Tokens include user ID, phone, and primary pincode

### OTP Flow
1. User requests OTP via `/send-otp` (rate-limited)
2. OTP stored in Redis with 10-minute expiry
3. User enters code via `/verify-otp`
4. Access & refresh tokens issued on success
5. New user auto-created with placeholder pincode

### Real-time Features
Socket.io connects authenticated users via JWT. Rooms:
- `user:{userId}` - Private messages
- `thread:{threadId}` - Thread notifications
- `group:{groupId}` - Group broadcasts

### Caching
Redis caches:
- Last seen updates (debounced 5min)
- Feed rankings (5min TTL)
- Rate limit counters

### Background Jobs
Bull MQ queues:
- **engagement-score**: Hourly post engagement recalculation
- **nightly-cleanup**: Daily OTP cleanup, user activity refresh

## Testing

Health check:
```bash
curl http://localhost:3001/health
```

Send OTP (with phone number):
```bash
curl -X POST http://localhost:3001/api/v1/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9876543210"}'
```

## Deployment

The backend is configured for Railway deployment via `railway.toml`:

```bash
railway link
railway up
```

For other platforms, use standard Node.js deployment with environment variables set.

## License

Proprietary - All rights reserved
