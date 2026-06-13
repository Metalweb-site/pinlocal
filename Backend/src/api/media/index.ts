import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware';
import { handleServiceError, notFound } from '../../utils';
import { createMediaAsset, getMediaAssetForUser, serializeMediaAsset } from '../../services/media';

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authMiddleware);
  app.post('/upload', async (request, reply) => {
    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: 'missing_file', message: 'No file uploaded', statusCode: 400 });
      }

      const buffer = await file.toBuffer();
      const media = await createMediaAsset(request.user.id, file.mimetype, buffer);
      return reply.send(serializeMediaAsset(media));
    } catch (err) {
      return handleServiceError(reply, err);
    }
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const media = await getMediaAssetForUser(id, request.user.id);
    if (!media) return notFound(reply, 'Media not found');
    return reply.send(serializeMediaAsset(media));
  });
}
