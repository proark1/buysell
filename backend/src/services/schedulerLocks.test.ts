import { assertEqual } from './testHelpers.js';
import { releaseSchedulerLock, tryAcquireSchedulerLock } from './schedulerLocks.js';

interface LockRow {
  name: string;
  owner: string;
  leasedUntil: Date;
  heartbeatAt: Date;
  metadataJson?: unknown;
}

let row: LockRow | undefined;

const db = {
  schedulerLock: {
    updateMany: async ({ where, data }: { where: { name: string; OR?: Array<Record<string, unknown>>; owner?: string }; data: Partial<LockRow> }) => {
      if (!row || row.name !== where.name) return { count: 0 };
      const now = new Date();
      const expired = row.leasedUntil.getTime() <= now.getTime();
      const sameOwner = where.owner ? row.owner === where.owner : where.OR?.some((item) => 'owner' in item && item.owner === row?.owner);
      if (expired || sameOwner) {
        row = { ...row, ...data } as typeof row;
        return { count: 1 };
      }
      return { count: 0 };
    },
    create: async ({ data }: { data: LockRow }) => {
      if (row) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      row = data;
      return row;
    }
  }
};

const first = await tryAcquireSchedulerLock(db as never, {
  name: 'job',
  ttlMs: 60_000,
  owner: 'worker-1',
  metadata: { purpose: 'test' }
});
assertEqual(first?.owner, 'worker-1', 'first worker acquires lock');

const second = await tryAcquireSchedulerLock(db as never, {
  name: 'job',
  ttlMs: 60_000,
  owner: 'worker-2'
});
assertEqual(second, undefined, 'second worker cannot acquire live lock');

await releaseSchedulerLock(db as never, first!);
const third = await tryAcquireSchedulerLock(db as never, {
  name: 'job',
  ttlMs: 60_000,
  owner: 'worker-2'
});
assertEqual(third?.owner, 'worker-2', 'released lock can be acquired');

console.log('schedulerLocks unit test passed');
