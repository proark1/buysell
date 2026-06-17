declare module 'dotenv/config';

declare module 'zod' {
  export const z: any;
}

declare module 'fastify' {
  export interface FastifyReply {
    status(code: number): FastifyReply;
    send(payload: unknown): unknown;
    type(contentType: string): FastifyReply;
  }

  export interface FastifyRequest {
    body: unknown;
    query?: unknown;
    params?: unknown;
    headers: Record<string, string | string[] | undefined>;
  }

  export interface FastifyInstance {
    get(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>): void;
    post(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>): void;
    patch(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>): void;
    put(path: string, handler: (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>): void;
    listen(options: { port: number; host: string }): Promise<void>;
    log: { info(payload: unknown, message?: string): void; error(payload: unknown, message?: string): void };
  }

  export default function Fastify(options?: unknown): FastifyInstance;
}

declare const process: {
  env: Record<string, string | undefined>;
};


declare module '@prisma/client' {
  export class PrismaClient {
    productCandidate: any;
    amazonMatch: any;
    profitSnapshot: any;
    aiDecision: any;
    auditLog: any;
    actionItem: any;
    ruleConfig: any;
    ebayListing: any;
    order: any;
    amazonPurchase: any;
    credential: any;
    discoveryScanRun: any;
    $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
  }
}


declare module 'node:crypto' {
  export function createCipheriv(algorithm: string, key: Buffer, iv: Buffer): any;
  export function createDecipheriv(algorithm: string, key: Buffer, iv: Buffer): any;
  export function createHash(algorithm: string): any;
  export function randomBytes(size: number): Buffer;
}

declare class Buffer extends Uint8Array {
  static concat(list: Uint8Array[]): Buffer;
  static from(value: string, encoding?: string): Buffer;
  toString(encoding?: string): string;
}

declare function setTimeout(handler: () => void, timeout?: number): unknown;
