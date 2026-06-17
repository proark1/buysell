import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type ErrorLike = Error & {
  code?: string;
  statusCode?: number;
};

type ErrorHandlerApp = FastifyInstance & {
  log: {
    error(value: unknown, message?: string): void;
  };
  setErrorHandler(handler: (error: ErrorLike, request: FastifyRequest, reply: FastifyReply) => unknown): void;
};

const statusCodeFor = (error: ErrorLike): number => {
  const statusCode = error.statusCode ?? 500;
  return statusCode >= 400 && statusCode < 600 ? statusCode : 500;
};

export function registerErrorHandler(app: FastifyInstance): void {
  const fastifyApp = app as ErrorHandlerApp;

  fastifyApp.setErrorHandler((error: ErrorLike, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = statusCodeFor(error);
    const isServerError = statusCode >= 500;

    fastifyApp.log.error({ error }, isServerError ? 'Request failed' : 'Request rejected');

    return reply.status(statusCode).send({
      error: isServerError ? 'Internal server error' : error.message,
      code: isServerError ? 'INTERNAL_SERVER_ERROR' : error.code,
      requestId: (request as FastifyRequest & { id?: string }).id
    });
  });
}
