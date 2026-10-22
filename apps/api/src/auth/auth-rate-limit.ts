import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import {
  Injectable,
  HttpException,
  HttpStatus,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard, normalizeIp } from '@nestjs/throttler';
import { Request } from 'express';
import { normalizeWhatsapp } from './auth.validation';

export type AuthRateOperation = 'login' | 'register';

// Milliseconds, as required by @nestjs/throttler 6.x. No account lockout.
export const AUTH_RATE_LIMITS = {
  login: {
    aggregate: { limit: 60, ttl: 60_000, blockDuration: 0 },
    individual: { limit: 5, ttl: 15 * 60_000, blockDuration: 0 },
  },
  register: {
    aggregate: { limit: 20, ttl: 60_000, blockDuration: 0 },
    individual: { limit: 3, ttl: 60 * 60_000, blockDuration: 0 },
  },
} as const;

@Injectable()
export class AuthRateTracker {
  // Ephemeral HMAC key prevents dictionary lookup of stored PII hashes.
  // Like the in-memory counters, this key is discarded on restart.
  private readonly key = randomBytes(32);
  constructor(private readonly config: ConfigService) {}

  tracker(request: Request, operation: AuthRateOperation): string {
    // Trust this header only on the public Render ingress, where Cloudflare
    // overwrites it. Direct/local requests cannot supply a trusted IP header.
    const cf = request.headers['cf-connecting-ip'];
    const address =
      this.config.get<string>('RENDER') === 'true' &&
      typeof cf === 'string' &&
      isIP(cf.trim())
        ? cf.trim()
        : (request.socket?.remoteAddress ?? 'unknown-origin');
    const body: unknown = request.body;
    const fields =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const email =
      typeof fields.email === 'string' ? fields.email.trim().toLowerCase() : '';
    let whatsapp = '';
    if (operation === 'register' && typeof fields.whatsappNumber === 'string') {
      try {
        whatsapp = normalizeWhatsapp(fields.whatsappNumber);
      } catch {
        /* DTO/service reject invalid input. */
      }
    }
    return createHmac('sha256', this.key)
      .update(
        JSON.stringify([operation, normalizeIp(address, 64), email, whatsapp]),
      )
      .digest('hex');
  }
}

@Injectable()
export class AuthRateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas solicitações. Tente novamente mais tarde.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// Route-scoped guard: no global throttle, no dependence on @Public metadata.
export const AuthRateLimit = (operation: AuthRateOperation) =>
  applyDecorators(
    UseGuards(AuthRateLimitGuard),
    Throttle(AUTH_RATE_LIMITS[operation]),
  );
