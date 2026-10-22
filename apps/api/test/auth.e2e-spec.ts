import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { PUBLIC_ROUTE } from '../src/auth/public.decorator';
import { AuthGuard } from '../src/auth/auth.guard';
import { AuthorizationGuard } from '../src/authorization/authorization.guard';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PasswordService } from '../src/auth/password.service';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { CurrentUserId } from '../src/common/http/current-user-id.decorator';
import { PrismaService } from '../src/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { StructuredLoggerService } from '../src/observability/structured-logger.service';

@Controller('__test/jwt-context')
class JwtContextController {
  @Get('without-current-user')
  privateWithoutParameter() {
    return { private: true };
  }

  @Get()
  read(@CurrentUserId() userId: string) {
    return { userId };
  }
}

// Repository double only: the application uses the real global guard, JWT signer,
// bcrypt, DTO validation, controllers and domain services. No identity middleware.
describe('Authentication with real Bearer JWT (e2e)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let users: Map<string, any>;
  let hash: string;
  const password = 'test-only long password';
  const secret = 'test-only-auth-secret-at-least-32-bytes';
  const logs = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const project = (value: any, select: any): any => {
    if (!value || !select) return value;
    return Object.fromEntries(
      Object.entries(select).map(([key, rule]: [string, any]) => {
        let selected = value[key];
        if (rule !== true && selected) {
          if (Array.isArray(selected)) {
            if (rule.where?.role)
              selected = selected.filter(
                (item: any) => item.role === rule.where.role,
              );
            selected = selected.map((item: any) => project(item, rule.select));
          } else selected = project(selected, rule.select);
        }
        return [key, selected];
      }),
    );
  };
  const seed = (id: string, overrides = {}) => {
    const value = {
      id,
      email: `${id}@example.com`,
      passwordHash: hash,
      authVersion: 0,
      status: 'APPROVED',
      systemRole: 'USER',
      clubRoles: [],
      profile: {
        displayName: id,
        whatsappNumber: `+558299999${id === 'admin' ? '0001' : '0002'}`,
        birthDate: new Date('1990-01-01Z'),
      },
      ...overrides,
    };
    users.set(id, value);
    return value;
  };
  let prisma: any;
  beforeAll(async () => {
    hash = await bcrypt.hash(password, 12);
    prisma = {
      onModuleInit: jest.fn(),
      onModuleDestroy: jest.fn(),
      user: {
        findUnique: jest.fn(async ({ where, select }) =>
          project(
            [...users.values()].find((u) =>
              where.id ? u.id === where.id : u.email === where.email,
            ) ?? null,
            select,
          ),
        ),
        create: jest.fn(async ({ data, select }) => {
          if (
            [...users.values()].some(
              (u) =>
                u.email === data.email ||
                u.profile?.whatsappNumber ===
                  data.profile.create.whatsappNumber,
            )
          ) {
            throw new Prisma.PrismaClientKnownRequestError(
              'private uniqueness detail',
              { code: 'P2002', clientVersion: '7' },
            );
          }
          const value = seed(`registered-${users.size}`, {
            ...data,
            profile: data.profile.create,
          });
          return project(value, select);
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          const user = users.get(where.id);
          if (!user || (where.status && user.status !== where.status))
            return { count: 0 };
          for (const [key, value] of Object.entries(data) as [string, any][])
            user[key] = value?.increment ? user[key] + value.increment : value;
          return { count: 1 };
        }),
      },
      campaign: {
        create: jest.fn(async ({ data }) => ({
          id: 'created-campaign',
          ...data,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'campaign',
          masterId: 'master',
          status: 'ACTIVE',
        }),
      },
      oneShot: {
        create: jest.fn(async ({ data }) => ({
          id: 'created-one-shot',
          ...data,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue({
          id: 'one-shot',
          masterId: 'master',
          gameSystemId: 'system',
          status: 'DRAFT',
          approvalStatus: 'PENDING',
          session: {
            id: 'one-shot-session',
            scheduledAt: new Date(Date.now() + 86_400_000),
          },
        }),
      },
      gameSystem: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
      session: {
        create: jest.fn(async ({ data }) => ({
          id: 'created-session',
          ...data,
        })),
        update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
        findUnique: jest.fn().mockResolvedValue({
          id: 'session',
          campaignId: 'campaign',
          oneShotId: null,
          campaign: { masterId: 'master' },
        }),
      },
      sessionParticipant: { findMany: jest.fn().mockResolvedValue([]) },
      profile: {
        update: jest.fn(async ({ where, data, select }) => {
          const user = users.get(where.userId);
          if (!user?.profile)
            throw new Prisma.PrismaClientKnownRequestError(
              'private missing profile',
              { code: 'P2025', clientVersion: '7' },
            );
          if (
            data.whatsappNumber &&
            [...users.values()].some(
              (other) =>
                other.id !== user.id &&
                other.profile?.whatsappNumber === data.whatsappNumber,
            )
          )
            throw new Prisma.PrismaClientKnownRequestError(
              'private uniqueness detail',
              { code: 'P2002', clientVersion: '7' },
            );
          Object.assign(user.profile, data);
          return project(user.profile, select);
        }),
      },
      $transaction: async (operation: any) =>
        typeof operation === 'function'
          ? operation(prisma)
          : Promise.all(operation),
    };
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [JwtContextController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) =>
          ({ JWT_SECRET: secret, JWT_EXPIRES_IN: '15m', RENDER: 'true' })[key],
      })
      .overrideProvider(StructuredLoggerService)
      .useValue(logs)
      .compile();
    app = module.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
  });
  beforeEach(() => {
    app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
    users = new Map();
    seed('admin', { systemRole: 'ADMIN' });
    seed('master', { clubRoles: [{ id: 'role', role: 'MASTER' }] });
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });
  const token = (id = 'master', claims = {}) =>
    jwt.sign({
      sub: id,
      ver: users.get(id)?.authVersion ?? 0,
      type: 'access',
      ...claims,
    });
  const registration = () => ({
    email: ' NEW@Example.COM ',
    password,
    displayName: ' New Player ',
    whatsappNumber: '+55 (82) 99999-9999',
    birthDate: '1990-01-01',
  });
  it('has exactly the six deliberate public routes across every loaded controller', () => {
    const publicRoutes: string[] = [];
    const reflector = app.get(Reflector);
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (!controller) continue;
        for (const name of Object.getOwnPropertyNames(controller.prototype)) {
          const handler = controller.prototype[name];
          const method = Reflect.getMetadata(METHOD_METADATA, handler);
          if (
            method === undefined ||
            !reflector.getAllAndOverride(PUBLIC_ROUTE, [handler, controller])
          )
            continue;
          const path =
            [
              Reflect.getMetadata(PATH_METADATA, controller),
              Reflect.getMetadata(PATH_METADATA, handler),
            ]
              .join('/')
              .replace(/\/+/g, '/')
              .replace(/^\/?/, '/')
              .replace(/\/$/, '') || '/';
          publicRoutes.push(`${RequestMethod[method]} ${path}`);
        }
      }
    }
    expect(publicRoutes.sort()).toEqual(
      [
        'GET /',
        'GET /health',
        'GET /campaigns/public',
        'GET /one-shots/public',
        'POST /auth/register',
        'POST /auth/login',
      ].sort(),
    );
  });
  it.each(['status', 'systemRole', 'clubRoles', 'authVersion'])(
    'forbids injecting %s in registration',
    async (field) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...registration(),
          [field]: field === 'authVersion' ? 100 : 'ADMIN',
        })
        .expect(400);
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );
  it('does not accept token or identity from cookies, query, body or alternative headers', async () => {
    const bearer = token();
    await request(app.getHttpServer())
      .get('/auth/me')
      .query({ accessToken: bearer })
      .set('Cookie', `accessToken=${bearer}`)
      .set('x-user-id', 'admin')
      .send({ accessToken: bearer, user: { id: 'admin' } })
      .expect(401);
  });
  it('handles null passwordHash as INVALID_CREDENTIALS without disclosing account status', async () => {
    users.get('master').passwordHash = null;
    users.get('master').status = 'ANONYMIZED';
    const response = await login().expect(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
  });
  const login = (id = 'master', candidatePassword = password) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `${id}@example.com`, password: candidatePassword });

  it('registers normalized PENDING user and profile, hashes password, returns no secrets and grants no roles', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration())
      .expect(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      status: 'PENDING',
    });
    const user = users.get(response.body.id);
    expect(user).toMatchObject({
      email: 'new@example.com',
      status: 'PENDING',
      systemRole: 'USER',
      clubRoles: [],
      profile: {
        displayName: 'New Player',
        whatsappNumber: '+5582999999999',
        birthDate: new Date('1990-01-01T00:00:00Z'),
      },
    });
    expect(user.passwordHash).not.toBe(password);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });
  it.each(['email', 'whatsappNumber'])(
    'rejects duplicate %s without Prisma details',
    async (field) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registration())
        .expect(201);
      const dto = registration();
      if (field === 'email') dto.whatsappNumber = '+5582999998888';
      else dto.email = 'another@example.com';
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(409);
      expect(response.body.code).toBe('REGISTRATION_CONFLICT');
      expect(JSON.stringify(response.body)).not.toContain('private uniqueness');
    },
  );
  it('handles competing registrations without returning an internal error or a partial account', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/auth/register').send(registration()),
      request(app.getHttpServer()).post('/auth/register').send(registration()),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      [...users.values()].filter((user) => user.email === 'new@example.com'),
    ).toHaveLength(1);
    expect(
      responses.find((response) => response.status === 409)!.body.code,
    ).toBe('REGISTRATION_CONFLICT');
  });
  it.each(['minor', 'date', 'phone', 'role', 'name'])(
    'rejects invalid registration: %s',
    async (scenario) => {
      const dto: Record<string, unknown> = registration();
      if (scenario === 'minor') dto.birthDate = '2020-01-01';
      if (scenario === 'date') dto.birthDate = '2000-02-30';
      if (scenario === 'phone') delete dto.whatsappNumber;
      if (scenario === 'role') dto.systemRole = 'ADMIN';
      if (scenario === 'name') dto.displayName = '   ';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(400);
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );
  it('accepts someone exactly 18 on the club civil date', async () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Maceio',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((p) => p.type === type)!.value;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        ...registration(),
        birthDate: `${Number(part('year')) - 18}-${part('month')}-${part('day')}`,
      })
      .expect(201);
  });
  it('logs in an APPROVED user and puts only essential claims in the JWT', async () => {
    const response = await login().expect(200);
    expect(response.body.tokenType).toBe('Bearer');
    expect(jwt.verify(response.body.accessToken)).toEqual({
      sub: 'master',
      ver: 0,
      type: 'access',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    await request(app.getHttpServer())
      .get('/__test/jwt-context')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200, { userId: 'master' });
  });

  const limitedResponse = (response: request.Response) => {
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Muitas solicitações. Tente novamente mais tarde.',
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /example\.com|203\.0\.113|remaining|limit:|passwordHash/,
    );
    expect(
      Object.keys(response.headers).some((key) =>
        key.startsWith('x-ratelimit'),
      ),
    ).toBe(false);
  };

  it('limits login by normalized identity and trusted CF IP, ignoring changing XFF, then expires the window', async () => {
    const verify = jest
      .spyOn(app.get(PasswordService), 'verify')
      .mockResolvedValue(false);
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    const attempt = (index: number) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .set('CF-Connecting-IP', '203.0.113.21')
        .set('X-Forwarded-For', `1.2.3.${index}`)
        .send({
          email: index % 2 ? ' MASTER@Example.COM ' : 'master@example.com',
          password: 'wrong-password',
        });
    try {
      for (let i = 0; i < 5; i++)
        expect((await attempt(i).expect(401)).body.code).toBe(
          'INVALID_CREDENTIALS',
        );
      limitedResponse(await attempt(5));
      expect(verify).toHaveBeenCalledTimes(5);
      now.mockReturnValue(start + 15 * 60_000);
      expect((await attempt(6).expect(401)).body.code).toBe(
        'INVALID_CREDENTIALS',
      );
    } finally {
      verify.mockRestore();
      now.mockRestore();
    }
  });

  it('gives nonexistent accounts and wrong passwords the same contract before and after the login limit', async () => {
    const verify = jest
      .spyOn(app.get(PasswordService), 'verify')
      .mockResolvedValue(false);
    try {
      for (const email of ['master@example.com', 'absent@example.com']) {
        for (let i = 0; i < 5; i++) {
          const response = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password: 'wrong' })
            .expect(401);
          expect(response.body).toMatchObject({
            code: 'INVALID_CREDENTIALS',
            message: 'Autenticação necessária ou sessão inválida',
          });
        }
        limitedResponse(
          await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password: 'wrong' }),
        );
      }
    } finally {
      verify.mockRestore();
    }
  });

  it('limits register to three identity attempts including conflicts, then expires after one hour', async () => {
    const hashPassword = jest
      .spyOn(app.get(PasswordService), 'hash')
      .mockResolvedValue(hash);
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    try {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registration())
        .expect(201);
      for (let i = 0; i < 2; i++)
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(registration())
          .expect(409);
      limitedResponse(
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(registration()),
      );
      expect(prisma.user.create).toHaveBeenCalledTimes(3);
      now.mockReturnValue(start + 60 * 60_000);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registration())
        .expect(409);
    } finally {
      hashPassword.mockRestore();
      now.mockRestore();
    }
  });

  it('enforces the aggregate login limit despite changing both origin and email', async () => {
    const verify = jest
      .spyOn(app.get(PasswordService), 'verify')
      .mockResolvedValue(false);
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    const attempt = (i: number) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .set('CF-Connecting-IP', `203.0.113.${i + 1}`)
        .send({ email: `absent-${i}@example.com`, password: 'wrong' });
    try {
      for (let i = 0; i < 60; i++) await attempt(i).expect(401);
      limitedResponse(await attempt(60));
      expect(verify).toHaveBeenCalledTimes(60);
      now.mockReturnValue(start + 60_000);
      await attempt(61).expect(401);
    } finally {
      verify.mockRestore();
      now.mockRestore();
    }
  });

  it('enforces the aggregate register limit before bcrypt/persistence despite identity rotation', async () => {
    const hashPassword = jest
      .spyOn(app.get(PasswordService), 'hash')
      .mockResolvedValue(hash);
    const start = Date.now();
    const now = jest.spyOn(Date, 'now').mockReturnValue(start);
    const attempt = (i: number) =>
      request(app.getHttpServer())
        .post('/auth/register')
        .set('CF-Connecting-IP', `203.0.113.${i + 1}`)
        .send({
          ...registration(),
          email: `new-${i}@example.com`,
          whatsappNumber: `+55829999${String(i).padStart(5, '0')}`,
        });
    try {
      for (let i = 0; i < 20; i++) await attempt(i).expect(201);
      limitedResponse(await attempt(20));
      expect(hashPassword).toHaveBeenCalledTimes(20);
      expect(prisma.user.create).toHaveBeenCalledTimes(20);
      now.mockReturnValue(start + 60_000);
      await attempt(21).expect(201);
    } finally {
      hashPassword.mockRestore();
      now.mockRestore();
    }
  });

  it('keeps login and register buckets independent', async () => {
    const verify = jest
      .spyOn(app.get(PasswordService), 'verify')
      .mockResolvedValue(false);
    const hashPassword = jest
      .spyOn(app.get(PasswordService), 'hash')
      .mockResolvedValue(hash);
    try {
      for (let i = 0; i < 5; i++) await login('master', 'wrong').expect(401);
      limitedResponse(await login('master', 'wrong'));
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registration())
        .expect(201);
      for (let i = 0; i < 2; i++)
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(registration())
          .expect(409);
      limitedResponse(
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(registration()),
      );
      await login('admin', 'wrong').expect(401);
    } finally {
      verify.mockRestore();
      hashPassword.mockRestore();
    }
  });

  it('does not throttle unrelated public or private handlers', async () => {
    const bearer = token();
    for (let i = 0; i < 65; i++) {
      await request(app.getHttpServer()).get('/health').expect(200);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);
    }
  });
  it('protects private handlers even when they do not declare CurrentUserId', async () => {
    await request(app.getHttpServer())
      .get('/__test/jwt-context/without-current-user')
      .set('x-user-id', 'admin')
      .expect(401);
    await request(app.getHttpServer())
      .get('/__test/jwt-context/without-current-user')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200, { private: true });
  });

  it('reuses auth/me for the own profile and never accepts a different identity from headers/query/body', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me?userId=admin')
      .set('Authorization', `Bearer ${token()}`)
      .set('x-user-id', 'admin')
      .send({ userId: 'admin' })
      .expect(200);
    expect(response.body).toMatchObject({
      id: 'master',
      profile: { displayName: 'master' },
    });
    for (const field of [
      'passwordHash',
      'authVersion',
      'reviewedById',
      'reviewNote',
      'suspensionReason',
    ])
      expect(JSON.stringify(response.body)).not.toContain(field);
  });
  it.each(['/account/profile', '/account/deletion-request'])(
    'requires real Bearer for %s and ignores x-user-id',
    async (path) => {
      const method = path.endsWith('profile') ? 'patch' : 'post';
      const response = await request(app.getHttpServer())
        [method](path)
        .set('x-user-id', 'master')
        .send({})
        .expect(401);
      expect(response.body.code).toBe('AUTH_TOKEN_REQUIRED');
    },
  );
  it('updates only the authenticated profile and preserves birthDate/email/status/roles', async () => {
    const before = structuredClone(users.get('master'));
    const other = structuredClone(users.get('admin'));
    const response = await request(app.getHttpServer())
      .patch('/account/profile?userId=admin')
      .set('Authorization', `Bearer ${token()}`)
      .set('x-user-id', 'admin')
      .send({
        displayName: ' Updated Player ',
        whatsappNumber: '0044 (7700) 900001',
      })
      .expect(200);
    expect(response.body).toEqual({
      displayName: 'Updated Player',
      whatsappNumber: '+447700900001',
      birthDate: before.profile.birthDate.toISOString(),
    });
    expect(users.get('admin')).toEqual(other);
    expect(users.get('master')).toMatchObject({
      status: before.status,
      email: before.email,
      systemRole: before.systemRole,
      clubRoles: before.clubRoles,
      authVersion: before.authVersion,
    });
    expect(prisma.profile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'master' } }),
    );
  });
  it.each([
    {},
    { displayName: '' },
    { displayName: '   ' },
    { displayName: null },
    { displayName: 'a'.repeat(101) },
    { whatsappNumber: 'no-ddi' },
    { whatsappNumber: null },
  ])('rejects invalid profile input %j', async (body) => {
    await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${token()}`)
      .send(body)
      .expect(400);
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('rejects a conflicting WhatsApp with a generic domain error', async () => {
    const response = await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${token()}`)
      .send({ whatsappNumber: users.get('admin').profile.whatsappNumber })
      .expect(409);
    expect(response.body.code).toBe('PROFILE_CONFLICT');
    expect(JSON.stringify(response.body)).not.toMatch(
      /private uniqueness|admin@example|passwordHash|authVersion/,
    );
    expect(users.get('master').profile.whatsappNumber).toBe('+5582999990002');
  });
  it.each([
    'userId',
    'id',
    'email',
    'birthDate',
    'status',
    'systemRole',
    'clubRoles',
    'authVersion',
    'reviewedById',
    'suspendedById',
    'createdAt',
    'updatedAt',
    'deletionRequestedAt',
    'deletionExpiresAt',
    'anonymizedAt',
  ])('rejects privileged/immutable profile field %s', async (field) => {
    await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${token()}`)
      .send({ displayName: 'Valid', [field]: 'untrusted' })
      .expect(400);
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it.each(['userId', 'status', 'deletionExpiresAt'])(
    'does not accept deletion target/lifecycle field %s in the body',
    async (field) => {
      await request(app.getHttpServer())
        .post('/account/deletion-request')
        .set('Authorization', `Bearer ${token()}`)
        .send({ [field]: 'admin' })
        .expect(400);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(users.get('admin').status).toBe('APPROVED');
    },
  );
  it.each(['get', 'patch', 'delete'])(
    'offers no arbitrary profile path for third-party access (%s)',
    async (method) => {
      await request(app.getHttpServer())
        [method]('/account/profile/admin')
        .set('Authorization', `Bearer ${token()}`)
        .send({ displayName: 'Other' })
        .expect(404);
      expect(prisma.profile.update).not.toHaveBeenCalled();
    },
  );
  it('offers no arbitrary deletion path for third-party access', async () => {
    await request(app.getHttpServer())
      .post('/account/admin/deletion-request')
      .set('Authorization', `Bearer ${token()}`)
      .send({})
      .expect(404);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it.each(['admin', 'master', 'dev'])(
    'deletes only the own account for %s, revokes all old tokens and retains personal data/history for now',
    async (id) => {
      if (id === 'dev') seed('dev', { systemRole: 'DEV' });
      const original = (await login(id).expect(200)).body.accessToken;
      const second = token(id);
      const before = structuredClone(users.get(id));
      const otherId = id === 'admin' ? 'master' : 'admin';
      const other = structuredClone(users.get(otherId));
      const start = Date.now();
      const response = await request(app.getHttpServer())
        .post(`/account/deletion-request?userId=${otherId}`)
        .set('Authorization', `Bearer ${original}`)
        .set('x-user-id', otherId)
        .send({})
        .expect(200);
      const end = Date.now();
      expect(response.body).toEqual({
        id,
        status: 'DELETION_PENDING',
        deletionRequestedAt: expect.any(String),
        deletionExpiresAt: expect.any(String),
      });
      const requested = Date.parse(response.body.deletionRequestedAt);
      expect(requested).toBeGreaterThanOrEqual(start);
      expect(requested).toBeLessThanOrEqual(end);
      expect(Date.parse(response.body.deletionExpiresAt) - requested).toBe(
        90 * 86400000,
      );
      expect(users.get(id)).toMatchObject({
        status: 'DELETION_PENDING',
        authVersion: before.authVersion + 1,
        email: before.email,
        passwordHash: before.passwordHash,
        profile: before.profile,
        clubRoles: before.clubRoles,
      });
      expect(users.get(otherId)).toEqual(other);
      for (const bearer of [original, second]) {
        const denied = await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${bearer}`)
          .expect(401);
        expect(denied.body.code).toBe('AUTH_ACCOUNT_UNAVAILABLE');
      }
      const repeated = await request(app.getHttpServer())
        .post('/account/deletion-request')
        .set('Authorization', `Bearer ${original}`)
        .send({})
        .expect(401);
      expect(repeated.body.code).toBe('AUTH_ACCOUNT_UNAVAILABLE');
      await request(app.getHttpServer())
        .patch('/account/profile')
        .set('Authorization', `Bearer ${original}`)
        .send({ displayName: 'Too late' })
        .expect(401);
      expect(users.get(id).authVersion).toBe(before.authVersion + 1);
      const blockedLogin = await login(id).expect(403);
      expect(blockedLogin.body.code).toBe('ACCOUNT_DELETION_PENDING');
      const logged = JSON.stringify([
        logs.info.mock.calls,
        logs.error.mock.calls,
        logs.warn.mock.calls,
      ]);
      for (const sensitive of [
        original,
        second,
        before.email,
        before.profile.whatsappNumber,
        before.passwordHash,
        password,
      ])
        expect(logged).not.toContain(sensitive);
    },
  );
  it.each([
    'PENDING',
    'REJECTED',
    'SUSPENDED',
    'DELETION_PENDING',
    'ANONYMIZED',
  ])(
    'a current %s account cannot mutate profile or lifecycle using an old JWT',
    async (status) => {
      const bearer = token();
      users.get('master').status = status;
      await request(app.getHttpServer())
        .patch('/account/profile')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ displayName: 'Changed' })
        .expect(401);
      await request(app.getHttpServer())
        .post('/account/deletion-request')
        .set('Authorization', `Bearer ${bearer}`)
        .send({})
        .expect(401);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    },
  );
  it('keeps profile errors and logs free of private payloads and internal failures', async () => {
    prisma.profile.update.mockRejectedValueOnce(
      new Error('private database password=synthetic-secret'),
    );
    const bearer = token();
    const name = 'Private smoke name';
    const phone = '+447700900009';
    const response = await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ displayName: name, whatsappNumber: phone })
      .expect(500);
    expect(response.body).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    });
    const output = JSON.stringify([
      response.body,
      logs.info.mock.calls,
      logs.error.mock.calls,
      logs.warn.mock.calls,
    ]);
    for (const sensitive of [
      name,
      phone,
      bearer,
      'synthetic-secret',
      '1990-01-01',
      'master@example.com',
    ])
      expect(output).not.toContain(sensitive);
    await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ displayName: name, whatsappNumber: phone })
      .expect(200);
    expect(
      JSON.stringify([logs.info.mock.calls, logs.error.mock.calls]),
    ).not.toContain(phone);
  });

  it('allows retaining the same WhatsApp and returns a safe 404 if the Profile is missing', async () => {
    await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${token()}`)
      .send({ whatsappNumber: users.get('master').profile.whatsappNumber })
      .expect(200);
    users.get('master').profile = null;
    const response = await request(app.getHttpServer())
      .patch('/account/profile')
      .set('Authorization', `Bearer ${token()}`)
      .send({ displayName: 'Name' })
      .expect(404);
    expect(response.body.code).toBe('PROFILE_NOT_FOUND');
    expect(JSON.stringify(response.body)).not.toContain('private missing');
  });
  it('does not distinguish unknown email and wrong password', async () => {
    const wrong = await login('master', 'wrong').expect(401);
    const absent = await login('absent', 'wrong').expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(absent.body.code).toBe(wrong.body.code);
    expect(absent.body.message).toBe(wrong.body.message);
  });
  it.each([
    'PENDING',
    'REJECTED',
    'SUSPENDED',
    'DELETION_PENDING',
    'ANONYMIZED',
  ])('blocks login for %s only after correct password', async (status) => {
    users.get('master').status = status;
    const response = await login().expect(403);
    expect(response.body.code).toBe(`ACCOUNT_${status}`);
    expect((await login('master', 'wrong').expect(401)).body.code).toBe(
      'INVALID_CREDENTIALS',
    );
  });
  it.each([
    '/auth/me',
    '/tables/me',
    '/campaigns/campaign',
    '/one-shots/one-shot',
    '/sessions/session',
    '/campaigns/campaign/sessions',
    '/__test/jwt-context',
  ])(
    'requires a real Bearer token on %s and ignores x-user-id',
    async (url) => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('x-user-id', 'admin')
        .expect(401);
      expect(response.body.code).toBe('AUTH_TOKEN_REQUIRED');
    },
  );
  it.each(['/', '/health', '/campaigns/public', '/one-shots/public'])(
    'preserves deliberate public route %s',
    async (url) => {
      await request(app.getHttpServer()).get(url).expect(200);
    },
  );
  it.each([
    ['post', '/campaigns'],
    ['patch', '/campaigns/id'],
    ['delete', '/campaigns/id'],
    ['post', '/campaigns/id/publish'],
    ['patch', '/campaigns/id/status'],
    ['patch', '/admin/campaigns/id/approval'],
    ['post', '/one-shots'],
    ['patch', '/one-shots/id'],
    ['delete', '/one-shots/id'],
    ['post', '/one-shots/id/publish'],
    ['patch', '/one-shots/id/status'],
    ['patch', '/admin/one-shots/id/approval'],
    ['patch', '/admin/one-shots/id/correction'],
    ['post', '/campaigns/id/sessions'],
    ['patch', '/sessions/id'],
    ['patch', '/sessions/id/status'],
    ['delete', '/sessions/id'],
    ['post', '/auth/logout'],
    ['patch', '/admin/users/id/registration-review'],
  ])(
    'protects mutation %s %s before DTO or domain processing',
    async (method, url) => {
      await request(app.getHttpServer())
        [method](url)
        .set('x-user-id', 'admin')
        .send({})
        .expect(401);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    },
  );
  it('ignores role escalation claims even in a correctly signed token', async () => {
    seed('pending', { status: 'PENDING' });
    const bearer = token('master', { systemRole: 'DEV', clubRoles: ['ADMIN'] });
    const response = await request(app.getHttpServer())
      .patch('/admin/users/pending/registration-review')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
    expect(users.get('pending').status).toBe('PENDING');
  });

  const adminOperations = [
    {
      path: '/admin/users/pending/registration-review',
      body: { decision: 'APPROVED' },
    },
    {
      path: '/admin/campaigns/campaign/approval',
      body: { decision: 'APPROVED' },
    },
    {
      path: '/admin/one-shots/one-shot/approval',
      body: { decision: 'APPROVED' },
    },
    {
      path: '/admin/one-shots/one-shot/correction',
      body: { gameSystemId: 'system-2' },
    },
  ];
  it.each([
    { scenario: 'missing', code: 'AUTH_TOKEN_REQUIRED' },
    { scenario: 'invalid', code: 'AUTH_TOKEN_INVALID' },
    { scenario: 'expired', code: 'AUTH_TOKEN_INVALID' },
    { scenario: 'revoked', code: 'AUTH_TOKEN_REVOKED' },
  ])(
    'AuthGuard stops a $scenario Bearer before AuthorizationGuard on a role-protected route',
    async ({ scenario, code }) => {
      const authentication = jest.spyOn(app.get(AuthGuard), 'canActivate');
      const authorization = jest.spyOn(
        app.get(AuthorizationGuard),
        'canActivate',
      );
      try {
        const bearer =
          scenario === 'invalid'
            ? 'invalid-token'
            : scenario === 'expired'
              ? jwt.sign(
                  { sub: 'master', ver: 0, type: 'access' },
                  { expiresIn: -1 },
                )
              : token('master');
        if (scenario === 'revoked') users.get('master').authVersion++;
        const operation = request(app.getHttpServer())
          .patch('/admin/campaigns/campaign/approval')
          .set('x-user-id', 'admin');
        if (scenario !== 'missing')
          operation.set('Authorization', `Bearer ${bearer}`);
        const response = await operation
          .send({ decision: 'APPROVED' })
          .expect(401);
        expect(response.body.code).toBe(code);
        expect(authentication).toHaveBeenCalledTimes(1);
        expect(authorization).not.toHaveBeenCalled();
        expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
        expect(prisma.campaign.update).not.toHaveBeenCalled();
      } finally {
        authentication.mockRestore();
        authorization.mockRestore();
      }
    },
  );
  it('runs AuthorizationGuard only after AuthGuard creates the trusted identity', async () => {
    const authentication = jest.spyOn(app.get(AuthGuard), 'canActivate');
    const authorization = jest.spyOn(
      app.get(AuthorizationGuard),
      'canActivate',
    );
    try {
      const response = await request(app.getHttpServer())
        .patch('/admin/campaigns/campaign/approval')
        .set('Authorization', `Bearer ${token('master')}`)
        .send({ decision: 'APPROVED' })
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
      expect(authentication).toHaveBeenCalledTimes(1);
      expect(authorization).toHaveBeenCalledTimes(1);
      expect(authentication.mock.invocationCallOrder[0]).toBeLessThan(
        authorization.mock.invocationCallOrder[0],
      );
      expect(
        authorization.mock.calls[0][0].switchToHttp().getRequest().user,
      ).toEqual({ id: 'master' });
    } finally {
      authentication.mockRestore();
      authorization.mockRestore();
    }
  });
  it.each(adminOperations)(
    'rejects club ADMIN at $path before accessing domain data',
    async ({ path, body }) => {
      users.get('admin').systemRole = 'USER';
      users.get('admin').clubRoles = [{ role: 'ADMIN' }];
      seed('pending', { status: 'PENDING' });
      const bearer = (await login('admin').expect(200)).body.accessToken;
      const response = await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${bearer}`)
        .send(body)
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
      expect(prisma.oneShot.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.campaign.update).not.toHaveBeenCalled();
      expect(prisma.oneShot.update).not.toHaveBeenCalled();
      expect(prisma.session.update).not.toHaveBeenCalled();
    },
  );
  it.each(
    adminOperations.flatMap((operation) =>
      ['ADMIN', 'DEV'].map((systemRole) => ({ ...operation, systemRole })),
    ),
  )(
    'allows approved system $systemRole at $path with a real login JWT',
    async ({ path, body, systemRole }) => {
      users.get('admin').systemRole = systemRole;
      seed('pending', { status: 'PENDING' });
      const bearer = (await login('admin').expect(200)).body.accessToken;
      await request(app.getHttpServer())
        .patch(path)
        .set('Authorization', `Bearer ${bearer}`)
        .send(body)
        .expect(200);
      // No club MASTER/ADMIN is needed for explicit administrative operations.
      expect(users.get('admin').clubRoles).toEqual([]);
    },
  );
  it('rechecks system role in the database with the same JWT after demotion', async () => {
    const bearer = (await login('admin').expect(200)).body.accessToken;
    users.get('admin').systemRole = 'USER';
    users.get('admin').clubRoles = [{ role: 'ADMIN' }];
    const response = await request(app.getHttpServer())
      .patch('/admin/campaigns/campaign/approval')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  const masterOperations = [
    { path: '/campaigns', body: { gameSystemId: 'system', title: 'Campaign' } },
    {
      path: '/one-shots',
      body: {
        gameSystemId: 'system',
        title: 'One-shot',
        session: {
          title: 'Session',
          scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    },
  ];
  it.each(masterOperations)(
    'permits cumulative MASTER creation at $path',
    async ({ path, body }) => {
      users.get('master').clubRoles = [
        { role: 'PLAYER' },
        { role: 'MASTER' },
        { role: 'ADMIN' },
      ];
      const bearer = (await login().expect(200)).body.accessToken;
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${bearer}`)
        .send(body)
        .expect(201);
      expect(response.body.masterId).toBe('master');
    },
  );
  it.each(
    masterOperations.flatMap((operation) =>
      [
        { systemRole: 'USER', clubRoles: [{ role: 'PLAYER' }] },
        { systemRole: 'USER', clubRoles: [{ role: 'ADMIN' }] },
        { systemRole: 'ADMIN', clubRoles: [] },
        { systemRole: 'DEV', clubRoles: [] },
      ].map((roles) => ({ ...operation, ...roles })),
    ),
  )(
    'does not infer MASTER from $systemRole / $clubRoles at $path',
    async ({ path, body, systemRole, clubRoles }) => {
      Object.assign(users.get('master'), { systemRole, clubRoles });
      const bearer = (await login().expect(200)).body.accessToken;
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${bearer}`)
        .send(body)
        .expect(403);
      expect(response.body.code).toBe('MASTER_ROLE_REQUIRED');
      expect(prisma.campaign.create).not.toHaveBeenCalled();
      expect(prisma.oneShot.create).not.toHaveBeenCalled();
    },
  );
  it.each(['headers', 'query', 'body'])(
    'ignores client roles supplied in %s',
    async (source) => {
      users.get('master').clubRoles = [{ role: 'PLAYER' }];
      const bearer = (await login().expect(200)).body.accessToken;
      const operation = request(app.getHttpServer())
        .post('/campaigns')
        .set('Authorization', `Bearer ${bearer}`);
      const injection = {
        systemRole: 'DEV',
        clubRoles: ['MASTER', 'ADMIN'],
        status: 'APPROVED',
      };
      if (source === 'headers')
        operation.set({
          'x-system-role': 'DEV',
          'x-club-roles': 'MASTER,ADMIN',
          'x-user-id': 'admin',
        });
      if (source === 'query') operation.query(injection);
      const response = await operation
        .send({
          ...masterOperations[0].body,
          ...(source === 'body' ? injection : {}),
        })
        .expect(403);
      expect(response.body.code).toBe('MASTER_ROLE_REQUIRED');
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    },
  );
  it('keeps explicit administrative management of other masters resources', async () => {
    const bearer = (await login('admin').expect(200)).body.accessToken;
    for (const path of [
      '/campaigns/campaign',
      '/one-shots/one-shot',
      '/sessions/session',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${bearer}`)
        .expect(200);
    }
  });

  it('prevents MASTER B from reading or mutating the objects created by MASTER A', async () => {
    seed('master-b', { clubRoles: [{ role: 'MASTER' }] });
    const ownerToken = (await login().expect(200)).body.accessToken;
    const otherToken = (await login('master-b').expect(200)).body.accessToken;
    const campaign = await request(app.getHttpServer())
      .post('/campaigns')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owner campaign', gameSystemId: 'system' })
      .expect(201);
    const oneShot = await request(app.getHttpServer())
      .post('/one-shots')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(masterOperations[1].body)
      .expect(201);
    const session = await request(app.getHttpServer())
      .post(`/campaigns/${campaign.body.id}/sessions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(201);
    jest.clearAllMocks();
    const operations: [string, string, Record<string, unknown>?][] = [
      ...[campaign.body.id, oneShot.body.id].flatMap(
        (id, index): [string, string, Record<string, unknown>?][] => {
          const path = `/${index === 0 ? 'campaigns' : 'one-shots'}/${id}`;
          return [
            ['get', path],
            ['patch', path, { title: 'Other user edit' }],
            ['delete', path],
            ['post', `${path}/publish`],
            [
              'patch',
              `${path}/status`,
              index === 0
                ? { status: 'ARCHIVED' }
                : { status: 'CANCELLED', reason: 'Other user' },
            ],
          ];
        },
      ),
      ['get', `/sessions/${session.body.id}`],
      ['patch', `/sessions/${session.body.id}`, { title: 'Other edit' }],
      ['delete', `/sessions/${session.body.id}`],
      [
        'patch',
        `/sessions/${session.body.id}/status`,
        { status: 'CANCELLED', reason: 'Other user' },
      ],
      ['get', `/campaigns/${campaign.body.id}/sessions`],
      [
        'post',
        `/campaigns/${campaign.body.id}/sessions`,
        { scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
      ],
    ];
    for (const [method, path, body] of operations) {
      const response = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(body ?? {})
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
    }
    expect(prisma.campaign.update).not.toHaveBeenCalled();
    expect(prisma.oneShot.update).not.toHaveBeenCalled();
    expect(prisma.session.update).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('rejects privileged fields nested in the OneShot Session DTO', async () => {
    await request(app.getHttpServer())
      .post('/one-shots')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        ...masterOperations[1].body,
        session: {
          ...masterOperations[1].body.session,
          campaignId: 'someone-else',
          oneShotId: 'someone-else',
        },
      })
      .expect(400);
    expect(prisma.oneShot.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it.each([
    'masterId',
    'approvalStatus',
    'reviewedById',
    'authVersion',
    'passwordHash',
    'createdAt',
    'systemRole',
  ])(
    'rejects mass assignment of %s on a normal domain endpoint',
    async (field) => {
      await request(app.getHttpServer())
        .post('/campaigns')
        .set('Authorization', `Bearer ${token()}`)
        .send({ ...masterOperations[0].body, [field]: 'untrusted' })
        .expect(400);
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/tables/me',
    '/campaigns/campaign',
    '/one-shots/one-shot',
    '/sessions/session',
  ])('uses real Bearer for existing domain flow %s', async (url) => {
    await request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
  });
  it.each([
    'invalid',
    'expired',
    'version',
    'type',
    'missing-exp',
    'algorithm',
  ])('rejects %s token', async (scenario) => {
    const bad =
      scenario === 'invalid'
        ? 'not-a-jwt'
        : scenario === 'expired'
          ? jwt.sign(
              { sub: 'master', ver: 0, type: 'access' },
              { expiresIn: -1 },
            )
          : scenario === 'missing-exp'
            ? new JwtService({ secret }).sign({
                sub: 'master',
                ver: 0,
                type: 'access',
              })
            : scenario === 'algorithm'
              ? jwt.sign(
                  { sub: 'master', ver: 0, type: 'access' },
                  { algorithm: 'HS384' },
                )
              : token(
                  'master',
                  scenario === 'version' ? { ver: 9 } : { type: 'refresh' },
                );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${bad}`)
      .expect(401);
  });
  it.each([
    'PENDING',
    'REJECTED',
    'SUSPENDED',
    'DELETION_PENDING',
    'ANONYMIZED',
  ])(
    'immediately blocks existing JWT after status becomes %s',
    async (status) => {
      const bearer = token();
      users.get('master').status = status;
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(401);
      expect(response.body.code).toBe('AUTH_ACCOUNT_UNAVAILABLE');
    },
  );
  it('me exposes only the own safe projection', async () => {
    users.get('master').reviewedById = 'another-user';
    users.get('master').suspensionReason = 'private';
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(Object.keys(response.body).sort()).toEqual(
      ['id', 'email', 'status', 'systemRole', 'clubRoles', 'profile'].sort(),
    );
    expect(Object.keys(response.body.profile).sort()).toEqual(
      ['displayName', 'whatsappNumber', 'birthDate'].sort(),
    );
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|authVersion|reviewedById|suspensionReason/,
    );
  });
  it('logout atomically revokes every previously issued JWT and returns no replacement', async () => {
    const first = (await login().expect(200)).body.accessToken;
    const second = token('master', { iat: Math.floor(Date.now() / 1000) - 1 });
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${first}`)
      .expect(204);
    expect(response.text).toBe('');
    expect(users.get('master').authVersion).toBe(1);
    for (const bearer of [first, second]) {
      const denied = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${bearer}`)
        .expect(401);
      expect(denied.body.code).toBe('AUTH_TOKEN_REVOKED');
    }
    const fresh = (await login().expect(200)).body.accessToken;
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${fresh}`)
      .expect(200);
  });
  it.each(['ADMIN', 'DEV'])(
    'allows approved system %s to approve PENDING registration',
    async (systemRole) => {
      users.get('admin').systemRole = systemRole;
      seed('pending', { status: 'PENDING' });
      await request(app.getHttpServer())
        .patch('/admin/users/pending/registration-review')
        .set('Authorization', `Bearer ${token('admin')}`)
        .send({ decision: 'APPROVED', note: ' checked ' })
        .expect(200);
      expect(users.get('pending')).toMatchObject({
        status: 'APPROVED',
        reviewedById: 'admin',
        reviewedAt: expect.any(Date),
        reviewNote: 'checked',
      });
      await login('pending').expect(200);
    },
  );
  it.each([{ clubRoles: [] }, { clubRoles: [{ role: 'ADMIN' }] }])(
    'denies system USER regardless of club admin role %j',
    async ({ clubRoles }) => {
      users.get('admin').systemRole = 'USER';
      users.get('admin').clubRoles = clubRoles;
      seed('pending', { status: 'PENDING' });
      const response = await request(app.getHttpServer())
        .patch('/admin/users/pending/registration-review')
        .set('Authorization', `Bearer ${token('admin')}`)
        .send({ decision: 'APPROVED' })
        .expect(403);
      expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
      expect(users.get('pending').status).toBe('PENDING');
    },
  );
  it.each(['ADMIN', 'DEV'])(
    'blocks non-approved system %s reviewer with an existing token',
    async (systemRole) => {
      users.get('admin').systemRole = systemRole;
      const bearer = token('admin');
      users.get('admin').status = 'PENDING';
      await request(app.getHttpServer())
        .patch('/admin/users/pending/registration-review')
        .set('Authorization', `Bearer ${bearer}`)
        .send({ decision: 'APPROVED' })
        .expect(401);
    },
  );
  it('rejection requires a note, stores reviewer metadata and prevents login', async () => {
    seed('pending', { status: 'PENDING' });
    await request(app.getHttpServer())
      .patch('/admin/users/pending/registration-review')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ decision: 'REJECTED', note: ' ' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/admin/users/pending/registration-review')
      .set('Authorization', `Bearer ${token('admin')}`)
      .send({ decision: 'REJECTED', note: 'Justificativa' })
      .expect(200);
    expect(users.get('pending')).toMatchObject({
      status: 'REJECTED',
      reviewedById: 'admin',
      reviewedAt: expect.any(Date),
      reviewNote: 'Justificativa',
    });
    expect((await login('pending').expect(403)).body.code).toBe(
      'ACCOUNT_REJECTED',
    );
  });
  it('never logs credentials, token, birth date or phone on successful or failed auth', async () => {
    const response = await login().expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration())
      .expect(201);
    await login('master', 'private-wrong-password').expect(401);
    const serialized = JSON.stringify(
      logs.info.mock.calls.concat(logs.warn.mock.calls, logs.error.mock.calls),
    );
    for (const sensitive of [
      password,
      hash,
      secret,
      response.body.accessToken,
      'private-wrong-password',
      registration().birthDate,
      registration().whatsappNumber,
      '+5582999999999',
    ])
      expect(serialized).not.toContain(sensitive);
    expect(serialized).toContain('requestId');
  });
  it('sanitizes unexpected persistence failures', async () => {
    prisma.user.create.mockRejectedValueOnce(
      new Error('private database password=do-not-leak'),
    );
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration())
      .expect(500);
    expect(JSON.stringify(response.body)).not.toContain('do-not-leak');
    expect(JSON.stringify(logs.error.mock.calls)).not.toContain('do-not-leak');
  });
});
