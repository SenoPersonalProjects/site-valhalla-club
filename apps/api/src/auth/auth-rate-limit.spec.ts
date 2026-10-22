import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthRateTracker } from './auth-rate-limit';

describe('Auth rate tracker', () => {
  let render: string | undefined;
  let tracker: AuthRateTracker;
  const req = (
    headers: Record<string, unknown> = {},
    body: unknown = {},
    address = '127.0.0.1',
  ) =>
    ({
      headers,
      body,
      socket: { remoteAddress: address },
    }) as unknown as Request;
  beforeEach(() => {
    render = 'true';
    tracker = new AuthRateTracker({
      get: () => render,
    } as unknown as ConfigService);
  });

  it('uses Cloudflare origin IP on Render, ignoring forged XFF', () => {
    const actual = tracker.tracker(
      req({ 'cf-connecting-ip': '203.0.113.21', 'x-forwarded-for': '1.2.3.4' }),
      'login',
    );
    expect(actual).toBe(
      tracker.tracker(req({ 'cf-connecting-ip': '203.0.113.21' }), 'login'),
    );
    expect(actual).not.toBe(
      tracker.tracker(req({ 'cf-connecting-ip': '203.0.113.22' }), 'login'),
    );
    expect(actual).not.toBe(
      tracker.tracker(req({ 'cf-connecting-ip': '1.2.3.4' }), 'login'),
    );
  });
  it('falls back only to the socket when CF is absent, never to XFF or req.ip', () => {
    const forged = req({ 'x-forwarded-for': '1.2.3.4' });
    Object.assign(forged, { ip: '1.2.3.4' });
    expect(tracker.tracker(forged, 'login')).toBe(
      tracker.tracker(req(), 'login'),
    );
    expect(tracker.tracker(forged, 'login')).not.toBe(
      tracker.tracker(req({}, {}, '1.2.3.4'), 'login'),
    );
  });
  it('does not trust a client-supplied CF header on a direct/local deployment', () => {
    render = undefined;
    expect(
      tracker.tracker(req({ 'cf-connecting-ip': '203.0.113.21' }), 'login'),
    ).toBe(tracker.tracker(req(), 'login'));
  });
  it.each(['bad-ip', '203.0.113.21, 1.2.3.4', ['203.0.113.21']])(
    'does not trust malformed/ambiguous CF header %j',
    (cf) => {
      expect(tracker.tracker(req({ 'cf-connecting-ip': cf }), 'login')).toBe(
        tracker.tracker(req(), 'login'),
      );
    },
  );
  it('normalizes email and separates identities without putting PII in keys', () => {
    const key = tracker.tracker(
      req({}, { email: ' User@Example.COM ' }),
      'login',
    );
    expect(key).toBe(
      tracker.tracker(req({}, { email: 'user@example.com' }), 'login'),
    );
    expect(key).not.toBe(
      tracker.tracker(req({}, { email: 'other@example.com' }), 'login'),
    );
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('user@example.com');
  });
  it('normalizes WhatsApp and stores only an opaque, per-process HMAC', () => {
    const data = {
      email: 'user@example.com',
      whatsappNumber: '+55 (82) 99999-0000',
    };
    const key = tracker.tracker(req({}, data), 'register');
    expect(key).toBe(
      tracker.tracker(
        req({}, { ...data, whatsappNumber: '005582999990000' }),
        'register',
      ),
    );
    expect(key).not.toContain('5582999990000');
    expect(key).not.toContain('user@example.com');
    expect(key).not.toBe(tracker.tracker(req({}, data), 'login'));
  });
  it('handles invalid/unvalidated bodies without throwing or using request identity/roles', () => {
    expect(
      tracker.tracker(
        req({}, { email: [], whatsappNumber: {}, user: { id: 'admin' } }),
        'register',
      ),
    ).toBe(tracker.tracker(req({}, null), 'register'));
  });
  it('canonicalizes IPv4-mapped addresses and groups IPv6 /64', () => {
    expect(tracker.tracker(req({}, {}, '::ffff:192.0.2.1'), 'login')).toBe(
      tracker.tracker(req({}, {}, '192.0.2.1'), 'login'),
    );
    expect(tracker.tracker(req({}, {}, '2001:db8:abcd:12::1'), 'login')).toBe(
      tracker.tracker(req({}, {}, '2001:db8:abcd:12::ffff'), 'login'),
    );
  });
});
