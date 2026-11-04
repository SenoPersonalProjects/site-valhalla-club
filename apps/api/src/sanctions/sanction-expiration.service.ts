import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { SANCTION_EXPIRATION_INTERVAL_MS } from './sanctions.constants';
import { SanctionsService } from './sanctions.service';

@Injectable()
export class SanctionExpirationService implements OnApplicationBootstrap {
  private running = false;

  constructor(
    private readonly sanctions: SanctionsService,
    private readonly logger: StructuredLoggerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.run();
  }

  @Interval('sanction-expiration', SANCTION_EXPIRATION_INTERVAL_MS)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { count } = await this.sanctions.expireDue();
      this.logger.info('sanction_expiration_reconciled', { count });
    } catch {
      // Retry at the next interval/startup without leaking database or case data.
      this.logger.error('sanction_expiration_reconciliation_failed');
    } finally {
      this.running = false;
    }
  }
}
