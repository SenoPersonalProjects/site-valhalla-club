import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { WarningStatus } from '../generated/prisma/enums';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { warningReferenceTime } from './warning-policy';
import { WARNING_TRANSACTION_ATTEMPTS } from './warnings.constants';
import { isWarningWriteConflict } from './warnings.transaction';
import {
  WARNING_EXPIRATION_BATCH_SIZE,
  WARNING_EXPIRATION_INTERVAL_MS,
  WARNING_EXPIRATION_MAX_BATCHES,
  WARNING_EXPIRATION_TRANSACTION_TIMEOUT_MS,
} from './warning-expiration.constants';

@Injectable()
export class WarningExpirationService implements OnApplicationBootstrap {
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  @Interval('warning-expiration', WARNING_EXPIRATION_INTERVAL_MS)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.reconcile();
      this.logger.info('warnings_expiration_reconciled', result);
    } catch {
      // Committed batches remain valid. Retry remaining work on the next cycle.
      this.logger.error('warnings_expiration_reconciliation_failed');
    } finally {
      this.running = false;
    }
  }

  async reconcile(at = new Date()) {
    const reference = warningReferenceTime(at);
    let count = 0;
    for (let batch = 1; batch <= WARNING_EXPIRATION_MAX_BATCHES; batch++) {
      const result = await this.expireBatch(reference);
      count += result.count;
      if (result.scanned < WARNING_EXPIRATION_BATCH_SIZE)
        return { count, batches: batch, batchLimitReached: false };
    }
    return {
      count,
      batches: WARNING_EXPIRATION_MAX_BATCHES,
      batchLimitReached: true,
    };
  }

  private async expireBatch(at: Date) {
    for (let attempt = 0; attempt < WARNING_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const where = {
              status: WarningStatus.ACTIVE,
              expiresAt: { lte: at },
            };
            const candidates = await tx.warning.findMany({
              where,
              select: { id: true },
              take: WARNING_EXPIRATION_BATCH_SIZE,
              orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
            });
            let count = 0;
            for (const candidate of candidates) {
              // The conditional write is authoritative even when another worker
              // or a reversal has changed the row after candidate selection.
              const updated = await tx.warning.updateMany({
                where: { id: candidate.id, ...where },
                data: { status: WarningStatus.EXPIRED },
              });
              if (updated.count === 0) continue;
              if (updated.count !== 1)
                throw new Error('Unexpected warning expiration update count');
              await this.audit.record(tx, {
                actorId: null,
                requestId: null,
                action: AUDIT_ACTION.WARNING_EXPIRED,
                entityType: AUDIT_ENTITY.WARNING,
                entityId: candidate.id,
                metadata: {
                  changed: true,
                  fromStatus: WarningStatus.ACTIVE,
                  toStatus: WarningStatus.EXPIRED,
                },
              });
              count++;
            }
            return { count, scanned: candidates.length };
          },
          {
            // No recurrence read here: a conditional update plus atomic audit is
            // enough at ReadCommitted; concurrent losers update zero rows.
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            timeout: WARNING_EXPIRATION_TRANSACTION_TIMEOUT_MS,
          },
        );
      } catch (error) {
        if (
          !isWarningWriteConflict(error) ||
          attempt === WARNING_TRANSACTION_ATTEMPTS - 1
        )
          throw error;
      }
    }
    throw new Error('Unreachable warning expiration retry state');
  }
}
