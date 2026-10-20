import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CampaignStatus, SessionStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { TABLE_RULE_WINDOW_MS } from '../tables/table-rules.service';

@Injectable()
export class CampaignInactivityService implements OnApplicationBootstrap {
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  @Interval('campaign-inactivity', 60 * 60 * 1000)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.reconcile();
      this.logger.info('campaign_inactivity_reconciled', {
        count: result.count,
      });
    } catch {
      // Never log Prisma exceptions or connection strings. Retry on the next run/startup.
      this.logger.error('campaign_inactivity_reconciliation_failed');
    } finally {
      this.running = false;
    }
  }

  reconcile(now = new Date()) {
    const cutoff = new Date(now.getTime() - TABLE_RULE_WINDOW_MS);
    return this.prisma.campaign.updateMany({
      where: {
        status: CampaignStatus.ACTIVE,
        updatedAt: { lt: cutoff },
        sessions: {
          none: {
            status: { not: SessionStatus.CANCELLED },
            scheduledAt: { gte: cutoff },
          },
        },
      },
      data: { status: CampaignStatus.INACTIVE },
    });
  }
}
