import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { CampaignStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { badRequest, conflict } from './table-domain.errors';

export const TABLE_RULE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const CLUB_TIME_ZONE = 'America/Maceio';

const clubClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLUB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function civilParts(date: Date) {
  const parts = Object.fromEntries(
    clubClock.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Resolve civil midnight with the IANA zone, independently of the process zone.
function monthStart(year: number, monthIndex: number): Date {
  const target = Date.UTC(year, monthIndex, 1);
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const p = civilParts(new Date(instant));
    const delta =
      target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (delta === 0) return new Date(instant);
    instant += delta;
  }
  throw new Error('Unable to resolve club month boundary');
}

@Injectable()
export class TableRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034'
        )
          throw error;
        if (attempt === 2) {
          throw conflict(
            'TABLE_CONCURRENT_CHANGE',
            'Conflito concorrente ao alterar a mesa; tente novamente',
          );
        }
      }
    }
    throw new Error('Unreachable transaction retry state');
  }

  async assertCampaignCapacity(
    tx: Prisma.TransactionClient,
    masterId: string,
    campaignId: string,
  ) {
    const count = await tx.campaign.count({
      where: {
        masterId,
        status: CampaignStatus.ACTIVE,
        id: { not: campaignId },
      },
    });
    if (count >= 2) {
      throw conflict(
        'CAMPAIGN_ACTIVE_LIMIT_REACHED',
        'O mestre pode possuir no máximo 2 campanhas ativas simultaneamente',
      );
    }
  }

  parseOneShotDate(value: string, now = new Date()): Date {
    const date = new Date(value);
    // ISO timestamps without an offset otherwise use the server's local zone.
    const hasExplicitZone = /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
    if (!hasExplicitZone || Number.isNaN(date.getTime()) || date <= now) {
      throw badRequest(
        'SESSION_DATE_MUST_BE_FUTURE',
        'A data da sessão precisa ser um instante futuro com timezone explícita (Z ou offset)',
      );
    }
    if (date.getTime() > now.getTime() + TABLE_RULE_WINDOW_MS) {
      throw badRequest(
        'ONE_SHOT_SCHEDULE_TOO_FAR',
        'O one-shot deve ser agendado no máximo 30 dias no futuro',
      );
    }
    return date;
  }

  oneShotMonth(scheduledAt: Date) {
    const { year, month } = civilParts(scheduledAt);
    return { gte: monthStart(year, month - 1), lt: monthStart(year, month) };
  }

  async assertOneShotCapacity(
    tx: Prisma.TransactionClient,
    gameSystemId: string,
    scheduledAt: Date,
    excludeId?: string,
  ) {
    const count = await tx.oneShot.count({
      where: {
        gameSystemId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        session: { is: { scheduledAt: this.oneShotMonth(scheduledAt) } },
      },
    });
    if (count >= 5) {
      throw conflict(
        'ONE_SHOT_MONTHLY_LIMIT_REACHED',
        'O clube pode cadastrar no máximo 5 one-shots por sistema de RPG e mês',
      );
    }
  }
}
