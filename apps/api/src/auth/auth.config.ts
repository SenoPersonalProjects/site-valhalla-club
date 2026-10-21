import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

export function jwtConfiguration(config: ConfigService): JwtModuleOptions {
  const secret = config.get<string>('JWT_SECRET');
  const expiration = config.get<string>('JWT_EXPIRES_IN');
  if (!secret || Buffer.byteLength(secret.trim()) < 32) {
    throw new Error('JWT_SECRET deve ser configurado com pelo menos 32 bytes');
  }
  const match = expiration?.match(/^([1-9]\d*)(s|m|h|d)?$/);
  if (!match)
    throw new Error(
      'JWT_EXPIRES_IN deve ser uma duração positiva (segundos, s, m, h ou d)',
    );
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = Number(match[1]) * units[match[2] ?? 's'];
  if (!Number.isSafeInteger(seconds))
    throw new Error('JWT_EXPIRES_IN fora do intervalo suportado');
  return {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: seconds },
    verifyOptions: { algorithms: ['HS256'] },
  };
}
