import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { PUBLIC_ROUTE } from './public.decorator';

describe('AuthGuard', () => {
  const jwt = new JwtService({
    secret: 'unit-test-only-secret-at-least-32-bytes',
    signOptions: { algorithm: 'HS256', expiresIn: 60 },
  });
  const findUnique = jest.fn();
  const reflector = new Reflector();
  const guard = new AuthGuard(reflector, jwt, {
    user: { findUnique },
  } as unknown as PrismaService);
  function context(headers = {}, handler = () => undefined) {
    const request = { headers, user: { id: 'untrusted-injected-user' } };
    const execution = {
      getHandler: () => handler,
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, execution };
  }
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue({
      id: 'real-user',
      status: 'APPROVED',
      authVersion: 3,
    });
  });
  it('erases unverified context and fails closed even with x-user-id', async () => {
    const { request, execution } = context({ 'x-user-id': 'real-user' });
    await expect(guard.canActivate(execution)).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_REQUIRED' },
    });
    expect(request.user).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('authenticates verified sub using fresh database state, never roles in claims', async () => {
    const token = jwt.sign({
      sub: 'real-user',
      ver: 3,
      type: 'access',
      systemRole: 'DEV',
    });
    const { request, execution } = context({
      authorization: `Bearer ${token}`,
    });
    expect(await guard.canActivate(execution)).toBe(true);
    expect(request.user).toEqual({ id: 'real-user' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'real-user' },
      select: { id: true, status: true, authVersion: true },
    });
  });
  it.each(['Basic abc', 'Bearer', 'Bearer a b', 'Bearer invalid'])(
    'rejects malformed credentials %s',
    async (authorization) => {
      await expect(
        guard.canActivate(context({ authorization }).execution),
      ).rejects.toMatchObject({
        status: 401,
        response: { code: 'AUTH_TOKEN_INVALID' },
      });
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
  it.each([
    { sub: '' },
    { sub: '   ' },
    { sub: 3 },
    { ver: -1 },
    { ver: 0.5 },
    { ver: '3' },
    { ver: null },
    { ver: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'refresh' },
  ])('rejects invalid claim shape %j', async (override) => {
    const token = jwt.sign({
      sub: 'real-user',
      ver: 3,
      type: 'access',
      ...override,
    });
    await expect(
      guard.canActivate(
        context({ authorization: `Bearer ${token}` }).execution,
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('rejects a correctly shaped token signed by a different key', async () => {
    const token = jwt.sign(
      { sub: 'real-user', ver: 3, type: 'access' },
      { secret: 'different-signing-key' },
    );
    await expect(
      guard.canActivate(
        context({ authorization: `Bearer ${token}` }).execution,
      ),
    ).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });
  });
  it('rejects unsigned alg=none tokens instead of trusting their payload', async () => {
    const token = jwt.sign(
      { sub: 'real-user', ver: 3, type: 'access' },
      { algorithm: 'none' },
    );
    await expect(
      guard.canActivate(
        context({ authorization: `Bearer ${token}` }).execution,
      ),
    ).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('rejects an overflowing exp even when a malformed JSON payload has a valid signature', async () => {
    const signer = new JwtService({
      secret: 'unit-test-only-secret-at-least-32-bytes',
    });
    const token = signer.sign(
      '{"sub":"real-user","ver":3,"type":"access","exp":1e309}',
    );
    await expect(
      guard.canActivate(
        context({ authorization: `Bearer ${token}` }).execution,
      ),
    ).rejects.toMatchObject({ response: { code: 'AUTH_TOKEN_INVALID' } });
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('does not swallow persistence failures as credential errors', async () => {
    const error = new Error('database unavailable');
    findUnique.mockRejectedValueOnce(error);
    const token = jwt.sign({ sub: 'real-user', ver: 3, type: 'access' });
    await expect(
      guard.canActivate(
        context({ authorization: `Bearer ${token}` }).execution,
      ),
    ).rejects.toBe(error);
  });
  it('rejects a token whose account no longer exists', async () => {
    findUnique.mockResolvedValueOnce(null);
    const token = jwt.sign({ sub: 'real-user', ver: 3, type: 'access' });
    await expect(
      guard.canActivate(
        context({ authorization: `Bearer ${token}` }).execution,
      ),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_TOKEN_INVALID' },
    });
  });
  it('permits only explicitly public handlers without querying identity', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(PUBLIC_ROUTE, true, handler);
    const { request, execution } = context({}, handler);
    expect(await guard.canActivate(execution)).toBe(true);
    expect(request.user).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
