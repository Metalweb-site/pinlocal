import Fastify from 'fastify';
import fastifyCors        from '@fastify/cors';
import fastifyCookie      from '@fastify/cookie';
import fastifyHelmet      from '@fastify/helmet';
import fastifyMultipart   from '@fastify/multipart';
import fastifyRateLimit   from '@fastify/rate-limit';
import socketioPlugin     from 'fastify-socket.io';

import { config }              from './config';
import { testConnection }      from './db/client';
import { redis, testRedisConnection } from './services/redis';
import { registerSocketHandlers }     from './services/socket';
import { scheduleEngagementJob, engagementWorker } from './jobs/engagement';
import { scheduleCleanupJob, cleanupWorker }        from './jobs/cleanup';
import { mediaProcessingWorker } from './jobs/media';

// API routes
import { authRoutes }    from './api/auth';
import { userRoutes }    from './api/users';
import { feedRoutes }    from './api/feed';
import { groupRoutes }   from './api/groups';
import { threadRoutes }  from './api/threads';
import { messageRoutes } from './api/messages';
import { postRoutes }    from './api/posts';
import { mediaRoutes }   from './api/media';
import { notificationRoutes } from './api/notifications';
import { adminRoutes } from './api/admin';
import { reportRoutes } from './api/reports';
import { chatRoutes } from './api/chats';

const app = Fastify({
  logger: {
    level: config.server.isProd ? 'info' : 'debug',
  },
});

async function bootstrap() {
  // ── Security & cross-cutting plugins ──────────────────────────────────────
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });

  await app.register(fastifyCors, {
    origin: config.server.corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(fastifyCookie, { secret: config.jwt.secret });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  // Global rate limit: 100 req/min per IP
  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: () => ({
      error: 'rate_limited',
      message: 'Too many requests — please slow down.',
      statusCode: 429,
    }),
  });

  // Socket.io — attached to the same HTTP server
  await app.register(socketioPlugin, {
    cors: {
      origin: config.server.corsOrigin.split(',').map((o) => o.trim()),
      credentials: true,
    },
  });

  // ── API routes ─────────────────────────────────────────────────────────────
  const V1 = '/api/v1';

  await app.register(authRoutes,    { prefix: `${V1}/auth` });
  await app.register(userRoutes,    { prefix: `${V1}/users` });
  await app.register(feedRoutes,    { prefix: `${V1}/feed` });
  await app.register(groupRoutes,   { prefix: `${V1}/groups` });
  await app.register(threadRoutes,  { prefix: `${V1}/groups` });     // /:groupId/threads
  await app.register(messageRoutes, { prefix: `${V1}` });            // /threads/:id/messages + /messages/:id
  await app.register(postRoutes,    { prefix: `${V1}/posts` });
  await app.register(mediaRoutes,   { prefix: `${V1}/media` });
  await app.register(notificationRoutes, { prefix: `${V1}/notifications` });
  await app.register(adminRoutes, { prefix: `${V1}/admin` });
  await app.register(reportRoutes, { prefix: `${V1}/reports` });
  await app.register(chatRoutes, { prefix: `${V1}/chats` });

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    env: config.server.nodeEnv,
    ts: new Date().toISOString(),
  }));

  // ── Global error handler ───────────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: (error as any).code ?? 'internal_error',
      message:
        config.server.isProd && statusCode >= 500
          ? 'An internal server error occurred'
          : error.message,
      statusCode,
    });
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'not_found', message: 'Route not found', statusCode: 404 });
  });

  // ── Connect to external services ──────────────────────────────────────────
  await testConnection();
  await testRedisConnection();

  // ── Register Socket.io handlers ───────────────────────────────────────────
  registerSocketHandlers((app as any).io);

  // ── Start background jobs ─────────────────────────────────────────────────
  await scheduleEngagementJob();
  await scheduleCleanupJob();

  // ── Listen ────────────────────────────────────────────────────────────────
  await app.listen({ port: config.server.port, host: '0.0.0.0' });

  console.log(`
╔══════════════════════════════════════════════════╗
║            PinLocal API Server                   ║
╠══════════════════════════════════════════════════╣
║  URL   : http://0.0.0.0:${config.server.port}                  ║
║  Env   : ${config.server.nodeEnv.padEnd(38)}║
║  Prefix: /api/v1                                 ║
║  Socket: attached                                ║
╚══════════════════════════════════════════════════╝
  `);
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  console.log(`\n[Server] ${signal} received — shutting down...`);
  await engagementWorker.close();
  await cleanupWorker.close();
  await mediaProcessingWorker.close();
  await app.close();
  await redis.quit();
  console.log('[Server] Shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});
