import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { StructuredLoggerService } from './../src/observability/structured-logger.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { CurrentUserId } from './../src/common/http/current-user-id.decorator';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  AccountStatus,
  SystemRole,
  ClubRole,
  OneShotStatus,
} from './../src/generated/prisma/enums';

@Controller('__test/context')
class UserContextTestController {
  @Get()
  read(@CurrentUserId() userId: string) {
    return { userId };
  }
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LogMethod = (
  event: string,
  context?: Readonly<Record<string, unknown>>,
) => void;

@Controller('__test/errors')
class ErrorTestController {
  @Get('custom')
  customError(): never {
    throw new HttpException(
      {
        code: 'INVALID_INPUT',
        message: 'Dados inválidos',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  @Get('not-found')
  notFoundError(): never {
    throw new NotFoundException('Recurso não encontrado');
  }

  @Get('unexpected')
  unexpectedError(): never {
    throw new Error('database password=super-secret');
  }
}

@Controller('__test/observability')
class ObservabilityTestController {
  @Post('report')
  createReport(): { accepted: true } {
    return { accepted: true };
  }
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let trustedUser: { id?: unknown } | undefined;
  const userRepository = { findUnique: jest.fn() };
  const oneShotRepository = { findUnique: jest.fn(), update: jest.fn() };
  const sessionRepository = { update: jest.fn() };
  let structuredLogger: {
    info: jest.MockedFunction<LogMethod>;
    warn: jest.MockedFunction<LogMethod>;
    error: jest.MockedFunction<LogMethod>;
  };

  beforeEach(async () => {
    trustedUser = undefined;
    userRepository.findUnique.mockReset();
    oneShotRepository.findUnique.mockReset().mockResolvedValue({
      id: 'one-shot-1',
      masterId: 'master-1',
      gameSystemId: 'system-1',
      status: OneShotStatus.SCHEDULED,
      session: {
        id: 'session-1',
        scheduledAt: new Date(Date.now() + 86_400_000),
      },
    });
    oneShotRepository.update
      .mockReset()
      .mockResolvedValue({ id: 'one-shot-1' });
    sessionRepository.update.mockReset().mockResolvedValue({ id: 'session-1' });
    structuredLogger = {
      info: jest.fn<LogMethod>(),
      warn: jest.fn<LogMethod>(),
      error: jest.fn<LogMethod>(),
    };

    const prismaMock = {
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
      user: userRepository,
      gameSystem: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
      session: sessionRepository,
      campaign: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      oneShot: {
        ...oneShotRepository,
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: async (operation: unknown): Promise<unknown> =>
        typeof operation === 'function'
          ? (operation as (client: unknown) => Promise<unknown>)(prismaMock)
          : Promise.all(operation as Promise<unknown>[]),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [
        ErrorTestController,
        ObservabilityTestController,
        UserContextTestController,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(StructuredLoggerService)
      .useValue(structuredLogger)
      .compile();

    app = moduleFixture.createNestApplication();
    // Test infrastructure supplies context from test state, never from HTTP input.
    app.use(
      (
        req: Request & { user?: { id?: unknown } },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = trustedUser;
        next();
      },
    );
    await app.init();
    structuredLogger.info.mockClear();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('reconciles on startup and registers periodic reconciliation with Nest scheduling', () => {
    const prisma = app.get(PrismaService) as unknown as {
      campaign: { updateMany: jest.Mock };
    };
    expect(prisma.campaign.updateMany).toHaveBeenCalledTimes(1);
    expect(
      app.get(SchedulerRegistry).getInterval('campaign-inactivity'),
    ).toBeDefined();
  });

  it('requires a user context on private table routes', async () => {
    const response = await request(app.getHttpServer())
      .get('/tables/me')
      .expect(401);

    expect(readResponseBody(response)).toMatchObject({
      statusCode: 401,
      code: 'USER_CONTEXT_REQUIRED',
    });
  });

  it('does not authenticate administrative correction with x-user-id', async () => {
    const response = await request(app.getHttpServer())
      .patch('/admin/one-shots/one-shot-1/correction')
      .set('x-user-id', 'admin-1')
      .send({ gameSystemId: 'system-2' })
      .expect(401);
    expect(readResponseBody(response)).toMatchObject({
      code: 'USER_CONTEXT_REQUIRED',
    });
    expect(oneShotRepository.update).not.toHaveBeenCalled();
  });

  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'allows approved %s administrative correction',
    async (systemRole) => {
      trustedUser = { id: 'admin-1' };
      userRepository.findUnique.mockResolvedValue({
        status: AccountStatus.APPROVED,
        systemRole,
      });
      await request(app.getHttpServer())
        .patch('/admin/one-shots/one-shot-1/correction')
        .send({ gameSystemId: 'system-2' })
        .expect(200)
        .expect({ id: 'one-shot-1' });
      expect(oneShotRepository.update).toHaveBeenCalled();
      expect(sessionRepository.update).toHaveBeenCalled();
    },
  );

  it.each([
    {
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.USER,
      clubRoles: [{ role: ClubRole.ADMIN }],
    },
    {
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.USER,
      clubRoles: [{ role: ClubRole.MASTER }],
    },
    ...[SystemRole.ADMIN, SystemRole.DEV].flatMap((systemRole) =>
      Object.values(AccountStatus)
        .filter((status) => status !== AccountStatus.APPROVED)
        .map((status) => ({ status, systemRole })),
    ),
  ])('rejects unauthorized correction context %j', async (user) => {
    trustedUser = { id: 'actor-1' };
    userRepository.findUnique.mockResolvedValue(user);
    const response = await request(app.getHttpServer())
      .patch('/admin/one-shots/one-shot-1/correction')
      .send({ gameSystemId: 'system-2' })
      .expect(403);
    expect(readResponseBody(response)).toMatchObject({
      code: 'ADMIN_ROLE_REQUIRED',
    });
    expect(oneShotRepository.findUnique).not.toHaveBeenCalled();
    expect(oneShotRepository.update).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
  });

  it.each([
    { title: 'not structural' },
    { scheduledAt: null },
    { gameSystemId: null },
    { scheduledAt: 'invalid' },
  ])('validates administrative correction input %j', async (body) => {
    trustedUser = { id: 'admin-1' };
    await request(app.getHttpServer())
      .patch('/admin/one-shots/one-shot-1/correction')
      .send(body)
      .expect(400);
    expect(oneShotRepository.update).not.toHaveBeenCalled();
  });

  it.each([
    '/tables/me',
    '/campaigns/campaign-1',
    '/one-shots/one-shot-1',
    '/sessions/session-1',
  ])('does not authenticate %s with x-user-id alone', async (path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('x-user-id', 'master-1')
      .expect(401);
    expect(readResponseBody(response)).toMatchObject({
      code: 'USER_CONTEXT_REQUIRED',
    });
  });

  it.each([
    {},
    { id: '' },
    { id: '  ' },
    { id: 123 },
    { id: ['master-1'] },
    { id: null },
  ])('rejects invalid trusted context %j', async (user) => {
    trustedUser = user;
    const response = await request(app.getHttpServer())
      .get('/__test/context')
      .expect(401);
    expect(readResponseBody(response)).toMatchObject({
      code: 'USER_CONTEXT_REQUIRED',
    });
  });

  it('accepts request.user.id supplied by trusted test infrastructure', async () => {
    trustedUser = { id: 'master-1' };
    await request(app.getHttpServer())
      .get('/__test/context')
      .set('x-user-id', 'different-user')
      .expect(200)
      .expect({ userId: 'master-1' });
  });

  it.each(['/campaigns/public', '/one-shots/public'])(
    'keeps %s accessible without authenticated context',
    async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .expect(200)
        .expect({
          items: [],
          meta: { page: 1, limit: 20, total: 0, pages: 0 },
        });
    },
  );

  it('validates campaign input before reaching the domain service', async () => {
    trustedUser = { id: 'master-1' };
    const response = await request(app.getHttpServer())
      .post('/campaigns')
      .send({ title: 'Campanha sem sistema' })
      .expect(400);

    expect(readResponseBody(response)).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('validates the mandatory session of a one-shot', async () => {
    trustedUser = { id: 'master-1' };
    const response = await request(app.getHttpServer())
      .post('/one-shots')
      .send({ gameSystemId: 'system-1', title: 'One-shot incompleto' })
      .expect(400);

    expect(readResponseBody(response)).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('rejects invalid public pagination parameters', async () => {
    const response = await request(app.getHttpServer())
      .get('/campaigns/public?page=0&limit=100')
      .expect(400);

    expect(readResponseBody(response)).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('generates a request ID when the header is absent', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('x-request-id', UUID_V4_PATTERN);
  });

  it('preserves a safe request ID received from the client', () => {
    const requestId = 'client-request-123';

    return request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', requestId)
      .expect(200)
      .expect('x-request-id', requestId);
  });

  it('replaces an unsafe request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'unsafe request id')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(UUID_V4_PATTERN);
  });

  it('logs request entry and completion with safe HTTP metadata', async () => {
    const requestId = 'observable-request-123';

    await request(app.getHttpServer())
      .get('/health?token=must-not-be-logged')
      .set('x-request-id', requestId)
      .expect(200);

    expect(structuredLogger.info).toHaveBeenNthCalledWith(
      1,
      'request_received',
      {
        requestId,
        method: 'GET',
        route: '/health',
      },
    );

    const completionContext = structuredLogger.info.mock.calls[1]?.[1];

    expect(structuredLogger.info.mock.calls[1]?.[0]).toBe('request_completed');
    expect(completionContext).toMatchObject({
      requestId,
      method: 'GET',
      route: '/health',
      statusCode: 200,
    });
    expect(typeof completionContext?.durationMs).toBe('number');
    expect(Number(completionContext?.durationMs)).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(structuredLogger.info.mock.calls)).not.toContain(
      'must-not-be-logged',
    );
    expect(structuredLogger.error).not.toHaveBeenCalled();
  });

  it('returns a standardized custom error code', async () => {
    const requestId = 'custom-error-request';

    const response = await request(app.getHttpServer())
      .get('/__test/errors/custom')
      .set('x-request-id', requestId)
      .expect(400)
      .expect('x-request-id', requestId);

    const { timestamp, ...body } = readResponseBody(response);

    expect(body).toEqual({
      statusCode: 400,
      code: 'INVALID_INPUT',
      message: 'Dados inválidos',
      requestId,
      path: '/__test/errors/custom',
    });

    expectValidTimestamp(timestamp);
  });

  it('derives a standardized error code from the HTTP status', async () => {
    const requestId = 'not-found-request';

    const response = await request(app.getHttpServer())
      .get('/__test/errors/not-found')
      .set('x-request-id', requestId)
      .expect(404);

    const { timestamp, ...body } = readResponseBody(response);

    expect(body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado',
      requestId,
      path: '/__test/errors/not-found',
    });

    expectValidTimestamp(timestamp);
  });

  it('does not expose unexpected internal error details', async () => {
    const requestId = 'internal-error-request';

    const response = await request(app.getHttpServer())
      .get('/__test/errors/unexpected')
      .set('x-request-id', requestId)
      .expect(500);

    const { timestamp, ...body } = readResponseBody(response);

    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      requestId,
      path: '/__test/errors/unexpected',
    });

    expectValidTimestamp(timestamp);

    expect(JSON.stringify(structuredLogger.error.mock.calls)).not.toContain(
      'super-secret',
    );
  });

  it('traces unmatched routes without logging query secrets', async () => {
    const requestId = 'missing-route-request';

    const response = await request(app.getHttpServer())
      .get('/missing-resource?token=must-not-be-logged')
      .set('x-request-id', requestId)
      .expect(404);

    const { timestamp, ...body } = readResponseBody(response);
    const failureContext = structuredLogger.error.mock.calls[0]?.[1];

    expect(body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /missing-resource?token=must-not-be-logged',
      requestId,
      path: '/missing-resource',
    });

    expectValidTimestamp(timestamp);

    expect(structuredLogger.error.mock.calls[0]?.[0]).toBe('request_failed');

    expect(failureContext).toMatchObject({
      requestId,
      method: 'GET',
      route: '/missing-resource',
      statusCode: 404,
    });

    expect(typeof failureContext?.durationMs).toBe('number');

    expect(JSON.stringify(structuredLogger.error.mock.calls)).not.toContain(
      'must-not-be-logged',
    );
  });

  it('does not include sensitive headers or payloads in HTTP logs', async () => {
    const sensitiveValues = [
      'authorization-secret',
      'cookie-secret',
      'password-secret',
      'report-secret',
      'warning-secret',
      'sanction-secret',
      'https://example.com/private-evidence',
    ];

    await request(app.getHttpServer())
      .post('/__test/observability/report')
      .set('x-request-id', 'sensitive-payload-request')
      .set('authorization', 'Bearer authorization-secret')
      .set('cookie', 'session=cookie-secret')
      .send({
        password: 'password-secret',
        report: 'report-secret',
        warning: 'warning-secret',
        sanction: 'sanction-secret',
        evidenceLink: 'https://example.com/private-evidence',
      })
      .expect(201)
      .expect({ accepted: true });

    const serializedLogs = JSON.stringify({
      info: structuredLogger.info.mock.calls,
      warn: structuredLogger.warn.mock.calls,
      error: structuredLogger.error.mock.calls,
    });

    for (const sensitiveValue of sensitiveValues) {
      expect(serializedLogs).not.toContain(sensitiveValue);
    }

    expect(structuredLogger.info).toHaveBeenCalledTimes(2);
    expect(structuredLogger.error).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    await app.close();
  });
});

function readResponseBody(response: {
  body: unknown;
}): Record<string, unknown> {
  const body = response.body;

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected a JSON object response');
  }

  return body as Record<string, unknown>;
}

function expectValidTimestamp(timestamp: unknown): void {
  expect(typeof timestamp).toBe('string');
  expect(Number.isNaN(Date.parse(String(timestamp)))).toBe(false);
}
