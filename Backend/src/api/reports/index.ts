import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { queryOne } from '../../db/client';
import { authMiddleware } from '../../middleware';
import { badRequest, notFound } from '../../utils';

const ReportBody = z.object({
  content_type: z.enum(['post', 'message', 'group', 'user', 'comment']),
  content_id: z.string().uuid(),
  reason: z.string().min(3).max(30),
  description: z.string().max(1000).optional(),
});

async function contentExists(type: string, id: string) {
  const table = {
    post: 'posts',
    message: 'messages',
    group: 'groups',
    user: 'users',
    comment: 'post_comments',
  }[type];
  if (!table) return false;
  return Boolean(await queryOne(`SELECT 1 FROM ${table} WHERE id = $1`, [id]));
}

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);

  app.post('/', async (request, reply) => {
    const parsed = ReportBody.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, 'validation_error', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    if (!(await contentExists(parsed.data.content_type, parsed.data.content_id))) {
      return notFound(reply, 'Reported content not found');
    }

    const report = await queryOne(
      `
      INSERT INTO reports (reporter_id, content_type, content_id, reason, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        request.user.id,
        parsed.data.content_type,
        parsed.data.content_id,
        parsed.data.reason,
        parsed.data.description ?? null,
      ]
    );

    request.server.io?.to('admin:super').emit('report_created', { report });
    return reply.status(201).send({ report });
  });
}
