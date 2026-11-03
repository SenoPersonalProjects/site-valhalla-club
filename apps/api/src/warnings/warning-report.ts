import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ReportStatus, ReportTargetType } from '../generated/prisma/enums';

export const warningReportSelect = {
  status: true,
  targetType: true,
  reportedUserId: true,
  categoryId: true,
} satisfies Prisma.ReportSelect;

export const warningReportAlreadyUsed = () =>
  new ConflictException({
    code: 'WARNING_REPORT_ALREADY_USED',
    message: 'Este report já originou uma advertência',
  });

export async function assertWarningReport(
  tx: Pick<Prisma.TransactionClient, 'report' | 'warning'>,
  reportId: string,
  userId: string,
  categoryId: string,
): Promise<void> {
  const report = await tx.report.findUnique({
    where: { id: reportId },
    select: warningReportSelect,
  });
  if (!report)
    throw new NotFoundException({
      code: 'REPORT_NOT_FOUND',
      message: 'Report não encontrado',
    });
  if (report.status !== ReportStatus.RESOLVED)
    throw new ConflictException({
      code: 'WARNING_REPORT_NOT_RESOLVED',
      message: 'O report precisa estar resolvido para originar uma advertência',
    });
  if (
    report.targetType !== ReportTargetType.USER ||
    report.reportedUserId === null
  )
    throw new ConflictException({
      code: 'WARNING_REPORT_TARGET_INVALID',
      message: 'O report precisa estar direcionado a um usuário',
    });
  if (report.reportedUserId !== userId)
    throw new ConflictException({
      code: 'WARNING_REPORT_USER_MISMATCH',
      message: 'O usuário deve corresponder ao alvo do report',
    });
  if (report.categoryId !== categoryId)
    throw new ConflictException({
      code: 'WARNING_REPORT_CATEGORY_MISMATCH',
      message: 'A categoria deve corresponder à categoria do report',
    });
  // No status filter: expiration and reversal never release the report for reuse.
  if (
    await tx.warning.findUnique({ where: { reportId }, select: { id: true } })
  )
    throw warningReportAlreadyUsed();
}
