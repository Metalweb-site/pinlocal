# PinLocal Frontend

A modern Next.js 14 web application for discovering and connecting with local neighborhood groups.

## Stack

- **Framework**: Next.js 14.2.0 (React 18)
- **Language**: TypeScript 5.5+
- **Styling**: Tailwind CSS 3.4
- **Fonts**: Barlow (display), DM Sans (body), DM Mono (code)
- **HTTP Client**: Axios with auto-refresh token handling
- **State Management**: Zustand (auth, chat, feed stores)
- **UI Components**: Custom reusable components
- **Animation**: CSS animations + React transitions
- **Real-time**: Socket.io client for live messaging
- **Manifest**: PWA-ready

## Project Structure

```
app/                    # Next.js App Router pages
├── layout.tsx         # Root layout with fonts, providers
├── page.tsx           # Home / landing page
├── not-found.tsx      # 404 error page
├── auth/              # Authentication flows
│   ├── login/         # Login page
│   ├── pincode/       # Pincode selection
│   └── verify/        # OTP verification
├── feed/              # Main feed with posts
├── groups/            # Group discovery & detail pages
├── profile/           # User profile
├── create/            # Create content (posts, groups)
└── alerts/            # Notifications/alerts

components/           # Reusable UI components
hooks/                # Custom React hooks (auth, socket, swipe)
lib/                  # API client, socket setup, utilities
store/                # Zustand state stores
types/                # TypeScript interfaces
public/               # Static assets & manifest
```

## Setup

### Prerequisites
- Node.js 20+
- Running backend on `http://localhost:3001`

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

## Running

### Development

```bash
npm run dev
```

Server runs on `http://localhost:3000` with hot reload.

### Build

```bash
npm run build
```

Optimized production build in `.next/`.

### Production

```bash
npm run build
npm start
```

## Pages

- `/` - Landing / home page
- `/auth/login` - Phone number login
- `/auth/verify` - OTP verification
- `/auth/pincode` - Pincode selection
- `/feed` - Main feed
- `/groups` - Group discovery
- `/groups/[groupId]` - Group detail
- `/groups/[groupId]/threads/[threadId]` - Thread view
- `/profile` - User profile
- `/create` - Create post/group

## Theme Colors

```
bg:      #0F0F0F      (Dark background)
surface: #1A1A1A      (Card background)
coral:   #FF4D00      (Primary accent)
mint:    #00FFB2      (Success)
amber:   #FFB800      (Warning)
blue:    #4D9EFF      (Info)
text1:   #F0EDE8      (Primary text)
text2:   #888888      (Secondary text)
text3:   #555555      (Tertiary text)
```

## API Integration

Axios client at `lib/api.ts`:
- Base URL from `NEXT_PUBLIC_API_URL`
- Credentials included (HTTP-only cookies)
- Auto-refresh on 401 token expiry
- Error handling with user feedback

## State Management

### Zustand Stores

**auth.store.ts** - User auth state & login/logout
**feed.store.ts** - Posts, pagination, filters
**chat.store.ts** - Messages, threads, Socket.io updates

## Real-time Communication

Socket.io connection with JWT authentication:
- Auto-reconnect on disconnect
- Private message rooms
- Group broadcast channels
- Typing indicators

## PWA Features

- Installable web app
- Service worker support
- Offline fallback
- App manifest

## Mobile Optimization

- Responsive design (mobile-first)
- Bottom navigation for mobile
- Swipe gestures for navigation
- Touch-friendly UI (48px+ tap targets)

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API base URL (e.g. `http://localhost:3001/api/v1`) |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io server URL (e.g. `http://localhost:3001`) |

## Pages

| Route | Description |
|---|---|
| `/auth/login` | Phone number entry |
| `/auth/verify` | OTP verification |
| `/auth/pincode` | Pincode selection |
| `/feed` | Main feed (swipeable posts) |
| `/groups` | My groups list |
| `/groups/[groupId]` | Group home + threads |
| `/groups/[groupId]/threads/[threadId]` | Realtime chat |
| `/create` | Create new group |
| `/profile` | User profile + edit |
| `/alerts` | Notifications |

## Key Features
- **Swipe right** on any feed card to join that group
- **Realtime chat** via Socket.io rooms per thread
- **Infinite scroll** on feed and message history
- **PWA ready** — installable on Android Chrome
- **Unread tracking** via cursor model
- **Typing indicators** in chat
- **Image/video upload** in chat and posts

## Connect to Backend
Your friend is building the backend with Fastify + Supabase.
Once they give you the API URL, add it to `.env.local` and everything connects automatically.
