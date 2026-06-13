# PinLocal Deployment Checklist

## Backend

Deploy the `Backend` folder as a Docker service. The Docker image installs FFmpeg automatically for video duration checks, compression, and thumbnails.

Required backend environment variables:

```env
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-frontend-domain.com
JWT_SECRET=replace_with_a_long_random_secret
JWT_ACCESS_EXPIRES=30d
JWT_REFRESH_EXPIRES=90d
DATABASE_URL=your_postgres_connection_string
DB_POOL_MAX=10
REDIS_URL=your_redis_connection_string
SUPER_ADMIN_PHONES=8888888888
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=pinlocal-media
CDN_BASE_URL=https://your-public-r2-or-custom-domain
MEDIA_FFMPEG_PATH=ffmpeg
MEDIA_FFPROBE_PATH=ffprobe
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
MSG91_SENDER_ID=PINLOC
```

After the backend deploys, run:

```bash
npm run migrate
```

## Frontend

Deploy the `frontend` folder to Vercel, Cloudflare Pages, or another Next.js host.

Required frontend environment variables:

```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://your-backend-domain.com
```

## Media Test

After deployment:

1. Upload a small JPG/PNG image.
2. Upload an MP4 under 50 MB and under 120 seconds.
3. Confirm the video autoplays, loops, and has a generated thumbnail/processed URL.
4. Try a video over 120 seconds and confirm it is rejected.
5. Try a renamed fake media file and confirm it is rejected.
