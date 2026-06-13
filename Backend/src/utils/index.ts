import type { FastifyReply } from 'fastify';

// ─── Standard error response ─────────────────────────────────────────────────
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  message: string
) {
  return reply.status(statusCode).send({ error, message, statusCode });
}

// ─── Common error factories ───────────────────────────────────────────────────
export function notFound(reply: FastifyReply, msg = 'Resource not found') {
  return sendError(reply, 404, 'not_found', msg);
}

export function forbidden(reply: FastifyReply, msg = 'Forbidden') {
  return sendError(reply, 403, 'forbidden', msg);
}

export function badRequest(reply: FastifyReply, error: string, msg: string) {
  return sendError(reply, 400, error, msg);
}

export function unauthorized(reply: FastifyReply, msg = 'Unauthorized') {
  return sendError(reply, 401, 'unauthorized', msg);
}

// ─── Typed error with code for service layer ─────────────────────────────────
export function makeError(code: string, message: string, statusCode = 400): Error {
  const err = new Error(message) as any;
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

// ─── Handle service layer errors in routes ───────────────────────────────────
export function handleServiceError(reply: FastifyReply, err: any) {
  const statusCode = err.statusCode ?? 500;
  const error = err.code ?? 'internal_error';
  const message = err.message ?? 'An error occurred';
  return reply.status(statusCode).send({ error, message, statusCode });
}

// ─── Pagination helper ───────────────────────────────────────────────────────
export function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? '1', 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

// ─── ISO timestamp ───────────────────────────────────────────────────────────
export function nowISO(): string {
  return new Date().toISOString();
}
