import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { ApprovalStatus, CampaignStatus } from '../generated/prisma/enums';
import { CampaignsService } from '../campaigns/campaigns.service';
import { OneShotsService } from '../one-shots/one-shots.service';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from './table-actors.service';
import { TableRulesService } from './table-rules.service';

// Optimistic serializable test double: both requests can read the same snapshot,
// but only one commits. The loser receives Prisma's conflict and must re-read.
describe('Quota transaction boundaries', () => {
  const actors = {
    assertCanManage: jest.fn().mockResolvedValue(undefined),
    assertMaster: jest.fn().mockResolvedValue(undefined),
    assertActiveGameSystem: jest.fn().mockResolvedValue(undefined),
  } as unknown as TableActorsService;

  it.each(['campaign', 'oneShot'] as const)(
    'keeps concurrent %s quota reads and writes in the transaction and revalidates after conflict',
    async (kind) => {
      let committed = kind === 'campaign' ? 1 : 4;
      let version = 0;
      const attempts: Array<{ count: jest.Mock; write: jest.Mock }> = [];
      const outsideWrite = jest.fn(() => {
        throw new Error('write outside transaction');
      });
      const outsideCount = jest.fn(() => {
        throw new Error('count outside transaction');
      });
      const transaction = jest.fn(
        async (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: { isolationLevel: string },
        ) => {
          expect(options).toEqual({ isolationLevel: 'Serializable' });
          const snapshot = committed,
            snapshotVersion = version;
          const count = jest.fn().mockResolvedValue(snapshot);
          const write = jest.fn().mockResolvedValue({ id: 'result' });
          attempts.push({ count, write });
          const tx = {
            campaign: {
              findUnique: jest
                .fn()
                .mockResolvedValue({
                  masterId: 'master-1',
                  status: CampaignStatus.DRAFT,
                  approvalStatus: ApprovalStatus.APPROVED,
                }),
              count,
              update: write,
            },
            oneShot: { count, create: write },
          } as unknown as Prisma.TransactionClient;
          const result = await operation(tx);
          if (version !== snapshotVersion) {
            throw new Prisma.PrismaClientKnownRequestError('retry', {
              code: 'P2034',
              clientVersion: '7.10.0',
            });
          }
          committed++;
          version++;
          return result;
        },
      );
      const prisma = {
        $transaction: transaction,
        campaign: { count: outsideCount, update: outsideWrite },
        oneShot: { count: outsideCount, create: outsideWrite },
      } as unknown as PrismaService;
      const rules = new TableRulesService(prisma);
      const campaigns = new CampaignsService(prisma, actors, rules, {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService);
      const oneShots = new OneShotsService(prisma, actors, rules, {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService);
      const publish = (id: string) =>
        kind === 'campaign'
          ? campaigns.publish(id, 'master-1')
          : oneShots.create(id, {
              title: 'Mesa',
              gameSystemId: 'system-1',
              session: {
                scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
              },
            });
      const results = await Promise.allSettled([
        publish('first'),
        publish('second'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({
        response: {
          code:
            kind === 'campaign'
              ? 'CAMPAIGN_ACTIVE_LIMIT_REACHED'
              : 'ONE_SHOT_MONTHLY_LIMIT_REACHED',
        },
      });
      expect(committed).toBe(kind === 'campaign' ? 2 : 5);
      expect(transaction).toHaveBeenCalledTimes(3);
      expect(attempts[2].count).toHaveBeenCalledTimes(1);
      expect(attempts[2].write).not.toHaveBeenCalled();
      expect(outsideCount).not.toHaveBeenCalled();
      expect(outsideWrite).not.toHaveBeenCalled();
    },
  );
});
