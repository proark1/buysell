declare module 'dotenv/config';

declare const process: {
  env: Record<string, string | undefined>;
};

declare function setInterval(handler: () => void, timeout?: number): unknown;
