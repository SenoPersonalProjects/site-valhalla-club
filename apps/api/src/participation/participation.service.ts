import { Injectable } from '@nestjs/common';
import { maxLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../audit/audit.constants';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Prisma } from '../generated/prisma/client';
import {
  AccountStatus,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { TableRulesService } from '../tables/table-rules.service';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../tables/table-domain.errors';
import {
  ATTENDANCE_RESULTS,
  PARTICIPATION_MAX_OFFSET,
  PARTICIPATION_REASON_MAX_LENGTH,
  PARTICIPATION_FORBIDDEN_CHARACTER,
} from './participation.constants';
import { RecordAttendanceDto } from './participation.dto';
import {
  participantSelect,
  participationSessionSelect,
} from './participation.select';

@Injectable()
export class ParticipationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: TableActorsService,
    private readonly rules: TableRulesService,
    private readonly audit: AuditService,
  ) {}

  async list(sessionId: string, actorId: string, query: PaginationQueryDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const session = await this.session(tx, sessionId);
        await this.actors.assertCanManage(this.ownerId(session), actorId, tx);
        const skip = (query.page - 1) * query.limit;
        if (!Number.isSafeInteger(skip) || skip > PARTICIPATION_MAX_OFFSET) {
          throw badRequest('BAD_REQUEST', 'Paginação inválida');
        }
        const where = { sessionId };
        const items = await tx.sessionParticipant.findMany({
          where,
          select: participantSelect,
          orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
          skip,
          take: query.limit,
        });
        const total = await tx.sessionParticipant.count({ where });
        return {
          items,
          meta: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async add(
    sessionId: string,
    actorId: string,
    userId: string,
    requestId?: string,
  ) {
    try {
      return await this.rules.serializable(async (tx) => {
        const session = await this.session(tx, sessionId);
        const masterId = this.ownerId(session);
        await this.actors.assertCanManage(masterId, actorId, tx);
        this.assertScheduled(session.status);
        if (userId === masterId) {
          throw conflict(
            'SESSION_MASTER_PARTICIPATION',
            'O mestre é registrado automaticamente na conclusão',
          );
        }
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        if (!user) throw notFound('USER_NOT_FOUND', 'Usuário não encontrado');
        if (user.status !== AccountStatus.APPROVED) {
          throw forbidden(
            'PARTICIPANT_ACCOUNT_NOT_APPROVED',
            'A conta do participante precisa estar aprovada',
          );
        }
        const participant = await tx.sessionParticipant.create({
          data: { sessionId, userId, role: SessionParticipantRole.PLAYER },
          select: participantSelect,
        });
        await this.audit.record(tx, {
          action: AUDIT_ACTION.SESSION_PARTICIPANT_ADDED,
          entityType: AUDIT_ENTITY.SESSION_PARTICIPANT,
          entityId: participant.id,
          actorId,
          requestId,
          metadata: { changed: true, sessionId },
        });
        return participant;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflict(
          'PARTICIPANT_ALREADY_REGISTERED',
          'A conta já possui participação nesta sessão',
        );
      }
      throw error;
    }
  }

  async recordAttendance(
    sessionId: string,
    userId: string,
    actorId: string,
    dto: RecordAttendanceDto,
    requestId?: string,
  ) {
    return this.rules.serializable(async (tx) => {
      const session = await this.session(tx, sessionId);
      const masterId = this.ownerId(session);
      if (session.status === SessionStatus.COMPLETED) {
        await this.actors.assertAdministrator(actorId, tx);
      } else {
        await this.actors.assertCanManage(masterId, actorId, tx);
        this.assertScheduled(session.status);
      }
      const now = new Date();
      if (session.scheduledAt > now) {
        throw conflict(
          'SESSION_NOT_STARTED',
          'A chamada só pode ser registrada a partir do horário agendado',
        );
      }
      if (!ATTENDANCE_RESULTS.includes(dto.status)) {
        throw badRequest(
          'PARTICIPANT_ATTENDANCE_INVALID',
          'Informe presença ou ausência',
        );
      }
      const correctionReason =
        session.status === SessionStatus.COMPLETED
          ? this.requiredReason(dto.reason)
          : undefined;
      const participant = await this.player(tx, sessionId, userId);
      if (participant.status === SessionParticipantStatus.CANCELLED) {
        throw conflict(
          'PARTICIPATION_CANCELLED',
          'Uma participação cancelada não recebe presença ou ausência',
        );
      }
      const changed = participant.status !== dto.status;
      if (session.status === SessionStatus.COMPLETED && changed) {
        const feedbacks = await tx.feedback.count({ where: { sessionId } });
        if (feedbacks > 0) {
          throw conflict(
            'PARTICIPATION_HAS_FEEDBACK',
            'A presença não pode ser alterada após feedback na sessão',
          );
        }
      }
      const result = changed
        ? await tx.sessionParticipant.update({
            where: { id: participant.id },
            data: {
              status: dto.status,
              attendedAt:
                dto.status === SessionParticipantStatus.ATTENDED ? now : null,
              ...(correctionReason !== undefined
                ? { attendanceCorrectionReason: correctionReason }
                : {}),
            },
            select: participantSelect,
          })
        : participant;
      // Free-form reasons stay on the private participation, never in metadata.
      await this.audit.record(tx, {
        action: AUDIT_ACTION.SESSION_ATTENDANCE_RECORDED,
        entityType: AUDIT_ENTITY.SESSION_PARTICIPANT,
        entityId: participant.id,
        actorId,
        requestId,
        metadata: {
          changed,
          sessionId,
          fromStatus: participant.status,
          toStatus: dto.status,
          correction: session.status === SessionStatus.COMPLETED,
        },
      });
      return result;
    });
  }

  async cancel(
    sessionId: string,
    userId: string,
    actorId: string,
    reason: string,
    requestId?: string,
  ) {
    return this.rules.serializable(async (tx) => {
      const session = await this.session(tx, sessionId);
      await this.actors.assertCanManage(this.ownerId(session), actorId, tx);
      this.assertScheduled(session.status);
      const cancellationReason = this.requiredReason(reason);
      const participant = await this.player(tx, sessionId, userId);
      const changed = participant.status !== SessionParticipantStatus.CANCELLED;
      if (ATTENDANCE_RESULTS.some((status) => status === participant.status)) {
        throw conflict(
          'PARTICIPATION_ALREADY_REVIEWED',
          'A participação já possui chamada registrada',
        );
      }
      const result = changed
        ? await tx.sessionParticipant.update({
            where: { id: participant.id },
            data: {
              status: SessionParticipantStatus.CANCELLED,
              cancelledAt: new Date(),
              cancellationReason,
            },
            select: participantSelect,
          })
        : participant;
      await this.audit.record(tx, {
        action: AUDIT_ACTION.SESSION_PARTICIPATION_CANCELLED,
        entityType: AUDIT_ENTITY.SESSION_PARTICIPANT,
        entityId: participant.id,
        actorId,
        requestId,
        metadata: { changed, sessionId },
      });
      return result;
    });
  }

  // Called only by the authorized completion of Campaign Session or OneShot.
  // Never opens a nested transaction or changes Session/OneShot status itself.
  async complete(
    tx: Prisma.TransactionClient,
    sessionId: string,
    masterId: string,
    actorId: string,
    requestId?: string,
  ) {
    const participants = await tx.sessionParticipant.findMany({
      where: { sessionId },
      select: { id: true, userId: true, role: true, status: true },
    });
    const players = participants.filter(
      (p) => p.role === SessionParticipantRole.PLAYER,
    );
    if (
      players.some(
        (p) =>
          p.status === SessionParticipantStatus.REGISTERED ||
          p.status === SessionParticipantStatus.CONFIRMED,
      )
    ) {
      throw conflict(
        'SESSION_ATTENDANCE_PENDING',
        'Conclua a chamada de todos os jogadores antes de encerrar a sessão',
      );
    }
    if (
      participants.some(
        (p) =>
          (p.role === SessionParticipantRole.MASTER && p.userId !== masterId) ||
          (p.userId === masterId && p.role !== SessionParticipantRole.MASTER),
      )
    ) {
      throw conflict(
        'SESSION_MASTER_PARTICIPATION_CONFLICT',
        'A participação do mestre não corresponde ao responsável da mesa',
      );
    }
    const master = participants.find((p) => p.userId === masterId);
    if (master && master.status !== SessionParticipantStatus.ATTENDED) {
      throw conflict(
        'SESSION_MASTER_PARTICIPATION_CONFLICT',
        'A presença do mestre possui estado incompatível com a conclusão',
      );
    }
    if (!master) {
      try {
        await tx.sessionParticipant.create({
          data: {
            sessionId,
            userId: masterId,
            role: SessionParticipantRole.MASTER,
            status: SessionParticipantStatus.ATTENDED,
            attendedAt: new Date(),
          },
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw conflict(
            'SESSION_MASTER_PARTICIPATION_CONFLICT',
            'A participação do mestre foi alterada durante a conclusão; tente novamente',
          );
        }
        throw error;
      }
    }
    await this.audit.record(tx, {
      action: AUDIT_ACTION.SESSION_COMPLETED,
      entityType: AUDIT_ENTITY.SESSION,
      entityId: sessionId,
      actorId,
      requestId,
      metadata: {
        attendedPlayers: players.filter(
          (p) => p.status === SessionParticipantStatus.ATTENDED,
        ).length,
        absentPlayers: players.filter(
          (p) => p.status === SessionParticipantStatus.NO_SHOW,
        ).length,
      },
    });
  }

  private async session(tx: Prisma.TransactionClient, id: string) {
    const session = await tx.session.findUnique({
      where: { id },
      select: participationSessionSelect,
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Sessão não encontrada');
    return session;
  }

  private ownerId(
    session: Prisma.SessionGetPayload<{
      select: typeof participationSessionSelect;
    }>,
  ) {
    const masterId = session.campaign?.masterId ?? session.oneShot?.masterId;
    if (!masterId || Boolean(session.campaign) === Boolean(session.oneShot)) {
      throw conflict(
        'SESSION_WITHOUT_TABLE',
        'A sessão precisa pertencer a uma única mesa',
      );
    }
    return masterId;
  }

  private async player(
    tx: Prisma.TransactionClient,
    sessionId: string,
    userId: string,
  ) {
    const participant = await tx.sessionParticipant.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
      select: participantSelect,
    });
    if (!participant)
      throw notFound('PARTICIPANT_NOT_FOUND', 'Participação não encontrada');
    if (participant.role !== SessionParticipantRole.PLAYER) {
      throw conflict(
        'SESSION_MASTER_PARTICIPATION',
        'A chamada manual é exclusiva de jogadores',
      );
    }
    return participant;
  }

  private assertScheduled(status: SessionStatus) {
    if (status !== SessionStatus.SCHEDULED)
      throw conflict('SESSION_CLOSED', 'A sessão não está agendada');
  }

  private requiredReason(value?: string) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      !maxLength(value, PARTICIPATION_REASON_MAX_LENGTH) ||
      value.includes(PARTICIPATION_FORBIDDEN_CHARACTER)
    ) {
      throw badRequest(
        'PARTICIPATION_REASON_REQUIRED',
        'Informe um motivo válido para a operação',
      );
    }
    return value.trim();
  }
}
