export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST'): HttpError => new HttpError(400, message, code);
export const notFound = (message: string, code = 'NOT_FOUND'): HttpError => new HttpError(404, message, code);
export const conflict = (message: string, code = 'CONFLICT'): HttpError => new HttpError(409, message, code);
export const serviceUnavailable = (message: string, code = 'SERVICE_UNAVAILABLE'): HttpError => new HttpError(503, message, code);
