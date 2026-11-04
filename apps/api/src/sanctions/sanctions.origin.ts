import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ReportStatus,
  ReportTargetType,
  WarningStatus,
} from '../generated/prisma/enums';

type Origin = {
  userId: string;
  reportId: string | null;
  warningId: string | null;
};

export async function assertSanctionOrigin(
  tx: Pick<Prisma.TransactionClient, 'report' | 'warning'>,
  origin: Origin,
): Promise<void> {
  if (origin.reportId !== null) {
    const report = await tx.report.findUnique({
      where: { id: origin.reportId },
      select: { status: true, targetType: true, reportedUserId: true },
    });
    if (!report)
      throw new NotFoundException({
        code: 'REPORT_NOT_FOUND',
        message: 'Report não encontrado',
      });
    if (report.status !== ReportStatus.RESOLVED)
      throw new ConflictException({
        code: 'SANCTION_REPORT_NOT_RESOLVED',
        message: 'O report precisa estar resolvido',
      });
    if (
      report.targetType !== ReportTargetType.USER ||
      report.reportedUserId === null
    )
      throw new ConflictException({
        code: 'SANCTION_REPORT_TARGET_INVALID',
        message: 'O report precisa estar direcionado a um usuário',
      });
    if (report.reportedUserId !== origin.userId)
      throw new ConflictException({
        code: 'SANCTION_REPORT_USER_MISMATCH',
        message: 'O usuário deve corresponder ao alvo do report',
      });
  }
  if (origin.warningId !== null) {
    const warning = await tx.warning.findUnique({
      where: { id: origin.warningId },
      select: { userId: true, reportId: true, status: true },
    });
    if (!warning)
      throw new NotFoundException({
        code: 'WARNING_NOT_FOUND',
        message: 'Advertência não encontrada',
      });
    if (warning.userId !== origin.userId)
      throw new ConflictException({
        code: 'SANCTION_WARNING_USER_MISMATCH',
        message: 'A advertência deve pertencer ao usuário sancionado',
      });
    if (warning.status === WarningStatus.REVERSED)
      throw new ConflictException({
        code: 'SANCTION_WARNING_REVERSED',
        message: 'Uma advertência revertida não pode fundamentar nova sanção',
      });
    if (origin.reportId !== null && warning.reportId !== origin.reportId)
      throw new ConflictException({
        code: 'SANCTION_ORIGIN_MISMATCH',
        message: 'O report deve ser a origem da advertência informada',
      });
  }
}
