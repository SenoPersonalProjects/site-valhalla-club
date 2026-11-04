import { StructuredLoggerService } from '../observability/structured-logger.service';
import { SanctionExpirationService } from './sanction-expiration.service';
import { SanctionsService } from './sanctions.service';

describe('Sanction expiration scheduling', () => {
  const expireDue = jest.fn<Promise<{ count: number }>, []>();
  const logger = { info: jest.fn(), error: jest.fn() };
  let service: SanctionExpirationService;
  beforeEach(() => {
    jest.clearAllMocks();
    expireDue.mockReset().mockResolvedValue({ count: 2 });
    service = new SanctionExpirationService(
      { expireDue } as unknown as SanctionsService,
      logger as unknown as StructuredLoggerService,
    );
  });
  it('reconciles on startup with safe count-only logging', async () => {
    await service.onApplicationBootstrap();
    expect(expireDue).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('sanction_expiration_reconciled', {
      count: 2,
    });
  });
  it('logs a generic error and can retry on the next interval', async () => {
    expireDue.mockRejectedValueOnce(
      new Error('private database URL and reason'),
    );
    await expect(service.run()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'sanction_expiration_reconciliation_failed',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private');
    await service.run();
    expect(expireDue).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
  it('does not overlap executions and resets the guard after completion', async () => {
    let resolve!: (value: { count: number }) => void;
    expireDue.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = service.run();
    await service.run();
    expect(expireDue).toHaveBeenCalledTimes(1);
    resolve({ count: 1 });
    await pending;
    await service.run();
    expect(expireDue).toHaveBeenCalledTimes(2);
  });
  it('resets overlap protection after a failed execution', async () => {
    let reject!: (error: Error) => void;
    expireDue.mockImplementationOnce(
      () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    );
    const pending = service.run();
    await service.run();
    reject(new Error('private data'));
    await pending;
    await service.run();
    expect(expireDue).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
