import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export interface SchedulerLockLease {
  name: string;
  owner: string;
  leasedUntil: Date;
}

export interface SchedulerLockOptions {
  name: string;
  ttlMs: number;
  owner?: string;
  metadata?: Record<string, unknown>;
}

const ownerPrefix = `${process.pid}-${randomUUID()}`;

const prismaErrorCode = (error: unknown): string | undefined => (
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
);

function ownerFor(name: string, owner?: string): string {
  return owner ?? `${ownerPrefix}-${name}`;
}

export async function tryAcquireSchedulerLock(db: PrismaClient, options: SchedulerLockOptions): Promise<SchedulerLockLease | undefined> {
  const now = new Date();
  const leasedUntil = new Date(now.getTime() + Math.max(options.ttlMs, 1_000));
  const owner = ownerFor(options.name, options.owner);
  const data = {
    owner,
    leasedUntil,
    heartbeatAt: now,
    metadataJson: options.metadata
  };

  const reclaimed = await db.schedulerLock.updateMany({
    where: {
      name: options.name,
      OR: [
        { leasedUntil: { lte: now } },
        { owner }
      ]
    },
    data
  });
  if (reclaimed.count > 0) return { name: options.name, owner, leasedUntil };

  try {
    await db.schedulerLock.create({
      data: {
        name: options.name,
        ...data
      }
    });
    return { name: options.name, owner, leasedUntil };
  } catch (error) {
    if (prismaErrorCode(error) === 'P2002') return undefined;
    throw error;
  }
}

export async function heartbeatSchedulerLock(db: PrismaClient, lease: SchedulerLockLease, ttlMs: number): Promise<boolean> {
  const now = new Date();
  const result = await db.schedulerLock.updateMany({
    where: {
      name: lease.name,
      owner: lease.owner,
      leasedUntil: { gt: now }
    },
    data: {
      heartbeatAt: now,
      leasedUntil: new Date(now.getTime() + Math.max(ttlMs, 1_000))
    }
  });
  return result.count > 0;
}

export async function releaseSchedulerLock(db: PrismaClient, lease: SchedulerLockLease): Promise<void> {
  await db.schedulerLock.updateMany({
    where: {
      name: lease.name,
      owner: lease.owner
    },
    data: {
      leasedUntil: new Date(),
      heartbeatAt: new Date()
    }
  });
}

export async function withSchedulerLock<T>(
  db: PrismaClient,
  options: SchedulerLockOptions,
  work: (lease: SchedulerLockLease) => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const lease = await tryAcquireSchedulerLock(db, options);
  if (!lease) return { acquired: false };

  let heartbeat: NodeJS.Timeout | undefined;
  try {
    const heartbeatMs = Math.max(1_000, Math.floor(options.ttlMs / 3));
    heartbeat = setInterval(() => {
      heartbeatSchedulerLock(db, lease, options.ttlMs).catch(() => undefined);
    }, heartbeatMs);
    return { acquired: true, result: await work(lease) };
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await releaseSchedulerLock(db, lease);
  }
}
