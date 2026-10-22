import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  normalizeDisplayName,
  normalizeWhatsapp,
} from '../auth/auth.validation';
import { unauthorized } from '../auth/auth.guard';
import { Prisma } from '../generated/prisma/client';
import { AccountStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './account.dto';

export const ACCOUNT_DELETION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
export const ownProfileSelect = {
  displayName: true,
  whatsappNumber: true,
  birthDate: true,
} satisfies Prisma.ProfileSelect;
export const accountDeletionSelect = {
  id: true,
  status: true,
  deletionRequestedAt: true,
  deletionExpiresAt: true,
} satisfies Prisma.UserSelect;

const deletionNotAllowed = () =>
  new ConflictException({
    code: 'ACCOUNT_DELETION_NOT_ALLOWED',
    message: 'A conta não permite solicitar exclusão neste estado',
  });

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const data: Prisma.ProfileUpdateInput = {};
    if (dto.displayName !== undefined)
      data.displayName = normalizeDisplayName(dto.displayName);
    if (dto.whatsappNumber !== undefined)
      data.whatsappNumber = normalizeWhatsapp(dto.whatsappNumber);
    if (!Object.keys(data).length)
      throw new BadRequestException({
        code: 'PROFILE_UPDATE_REQUIRED',
        message: 'Informe ao menos um campo editável do perfil',
      });
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // Profile edits also change the account modification timestamp. This
        // conditional write serializes with lifecycle changes on the same User
        // row. Hold it through the Profile write; no stale pre-transaction status.
        const result = await transaction.user.updateMany({
          where: { id, status: AccountStatus.APPROVED },
          data: { updatedAt: new Date() },
        });
        if (!result.count) throw unauthorized('AUTH_ACCOUNT_UNAVAILABLE');
        return transaction.profile.update({
          where: { userId: id },
          data,
          select: ownProfileSelect,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException({
            code: 'PROFILE_CONFLICT',
            message: 'Não foi possível utilizar os dados de perfil informados',
          });
        if (error.code === 'P2025')
          throw new NotFoundException({
            code: 'PROFILE_NOT_FOUND',
            message: 'Perfil não encontrado',
          });
      }
      throw error;
    }
  }

  async requestDeletion(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      // Compare-and-set precedes any read, including on concurrent repeats.
      // No overwrite of an incompatible state and only one version increment.
      await transaction.user.updateMany({
        where: { id, status: AccountStatus.APPROVED },
        data: {
          status: AccountStatus.DELETION_PENDING,
          deletionRequestedAt: now,
          deletionExpiresAt: new Date(
            now.getTime() + ACCOUNT_DELETION_WINDOW_MS,
          ),
          authVersion: { increment: 1 },
        },
      });
      const user = await transaction.user.findUnique({
        where: { id },
        select: accountDeletionSelect,
      });
      if (!user)
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Usuário não encontrado',
        });
      if (
        user.status !== AccountStatus.DELETION_PENDING ||
        !user.deletionRequestedAt ||
        !user.deletionExpiresAt
      ) {
        throw deletionNotAllowed();
      }
      // Repeats return the original window; never extend it or anonymize early.
      return user;
    });
  }
}
