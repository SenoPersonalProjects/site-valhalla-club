import { adultBirthDate, normalizeWhatsapp } from './auth.validation';
import { PasswordService, PASSWORD_COST } from './password.service';
import { jwtConfiguration } from './auth.config';
import { ConfigService } from '@nestjs/config';

describe('Registration validation', () => {
  it('normalizes explicitly international phone numbers', () => {
    expect(normalizeWhatsapp('+55 (82) 99999-1234')).toBe('+5582999991234');
    expect(normalizeWhatsapp('0055 82 999991234')).toBe('+5582999991234');
  });
  it.each(['82999991234', '+00012345678', 'letters', '+123'])(
    'rejects ambiguous/invalid phone %s',
    (value) => {
      expect(() => normalizeWhatsapp(value)).toThrow();
    },
  );
  it('accepts exactly 18 and stores UTC midnight', () => {
    expect(
      adultBirthDate(
        '2008-10-21',
        new Date('2026-10-21T03:00:00Z'),
      ).toISOString(),
    ).toBe('2008-10-21T00:00:00.000Z');
  });
  it('uses Maceio civil today, rather than UTC date or elapsed milliseconds', () => {
    expect(() =>
      adultBirthDate('2008-10-21', new Date('2026-10-21T02:59:59Z')),
    ).toThrow('O cadastro exige');
  });
  it.each([
    '2026-10-21',
    '2008-10-22',
    '2008-02-30',
    '2000-01-01T00:00:00Z',
    'not-date',
  ])('rejects minor or invalid civil date %s', (value) => {
    expect(() =>
      adultBirthDate(value, new Date('2026-10-21T12:00:00Z')),
    ).toThrow();
  });
  it('handles leap birthdays with civil comparison', () => {
    expect(() =>
      adultBirthDate('2008-02-29', new Date('2026-02-28T12:00:00Z')),
    ).toThrow();
    expect(
      adultBirthDate('2008-02-29', new Date('2026-03-01T12:00:00Z')),
    ).toBeInstanceOf(Date);
  });
});

describe('PasswordService', () => {
  const service = new PasswordService();
  it('hashes with centralized cost and verifies without retaining plaintext', async () => {
    const hash = await service.hash('a long test password');
    expect(hash).not.toBe('a long test password');
    expect(hash).toMatch(new RegExp(`^\\$2[aby]\\$${PASSWORD_COST}\\$`));
    expect(await service.verify('a long test password', hash)).toBe(true);
    expect(await service.verify('another password', hash)).toBe(false);
    expect(await service.verify('a long test password', null)).toBe(false);
  });
  it.each(['short', 'é'.repeat(37)])(
    'rejects trivial passwords and bcrypt truncation',
    (password) => {
      expect(() => service.hash(password)).toThrow('A senha deve');
    },
  );
});

describe('JWT configuration', () => {
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as ConfigService;
  it.each([
    {},
    { JWT_SECRET: 'short', JWT_EXPIRES_IN: '15m' },
    { JWT_SECRET: 'x'.repeat(32) },
    { JWT_SECRET: 'x'.repeat(32), JWT_EXPIRES_IN: '0' },
  ])('fails closed without explicit valid configuration', (values) => {
    expect(() => jwtConfiguration(config(values))).toThrow();
  });
  it('uses HS256 and explicit expiry in seconds', () => {
    expect(
      jwtConfiguration(
        config({ JWT_SECRET: 'x'.repeat(32), JWT_EXPIRES_IN: '15m' }),
      ),
    ).toMatchObject({
      signOptions: { algorithm: 'HS256', expiresIn: 900 },
      verifyOptions: { algorithms: ['HS256'] },
    });
  });
});
