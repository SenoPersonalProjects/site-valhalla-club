import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
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
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'one-shot', masterId: 'master' }),
      },
      session: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'session',
          campaignId: 'campaign',
          oneShotId: null,
          campaign: { masterId: 'master' },
        }),
      },
      sessionParticipant: { findMany: jest.fn().mockResolvedValue([]) },
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
          ({ JWT_SECRET: secret, JWT_EXPIRES_IN: '15m' })[key],
      })
      .overrideProvider(StructuredLoggerService)
      .useValue(logs)
      .compile();
    app = module.createNestApplication();
    await app.init();
    jwt = app.get(JwtService);
  });
  beforeEach(() => {
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
  it('rejects minors, malformed date, missing mandatory profile and injected roles', async () => {
    for (const dto of [
      { ...registration(), birthDate: '2020-01-01' },
      { ...registration(), birthDate: '2000-02-30' },
      { ...registration(), whatsappNumber: undefined },
      { ...registration(), systemRole: 'ADMIN' },
      { ...registration(), displayName: '   ' },
    ]) {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(dto)
        .expect(400);
    }
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
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
