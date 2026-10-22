import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client';
import { AccountStatus, SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { LoginDto, RegisterDto, RegistrationReviewDto } from './auth.dto';
import { unauthorized } from './auth.guard';
import {
  adultBirthDate,
  invalidRegistration,
  normalizeWhatsapp,
} from './auth.validation';
import { PasswordService } from './password.service';

export const sessionUserSelect = {
  id: true,
  email: true,
  status: true,
  systemRole: true,
  clubRoles: { select: { role: true } },
  profile: {
    select: { displayName: true, whatsappNumber: true, birthDate: true },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly actors: TableActorsService,
  ) {}

  async register(dto: RegisterDto) {
    const birthDate = adultBirthDate(dto.birthDate);
    const whatsappNumber = normalizeWhatsapp(dto.whatsappNumber);
    const displayName = dto.displayName.trim();
    if (!displayName)
      invalidRegistration('INVALID_DISPLAY_NAME', 'Informe o nome de exibição');
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          passwordHash,
          status: AccountStatus.PENDING,
          systemRole: SystemRole.USER,
          profile: { create: { displayName, whatsappNumber, birthDate } },
        },
        select: { id: true, status: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'REGISTRATION_CONFLICT',
          message: 'Email ou WhatsApp já cadastrado',
        });
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, passwordHash: true, status: true, authVersion: true },
    });
    if (
      !(await this.passwords.verify(
        dto.password,
        user?.passwordHash ?? null,
      )) ||
      !user
    )
      throw unauthorized('INVALID_CREDENTIALS');
    if (user.status !== AccountStatus.APPROVED)
      throw new ForbiddenException({
        code: `ACCOUNT_${user.status}`,
        message: 'A conta não está autorizada a autenticar',
      });
    return {
      accessToken: await this.jwt.signAsync({
        sub: user.id,
        ver: user.authVersion,
        type: 'access',
      }),
      tokenType: 'Bearer',
    };
  }

  async me(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: sessionUserSelect,
    });
    if (!user || user.status !== AccountStatus.APPROVED)
      throw unauthorized('AUTH_ACCOUNT_UNAVAILABLE');
    return user;
  }

  async logout(id: string): Promise<void> {
    // A single conditional increment is atomic and does not depend on a prior read.
    const result = await this.prisma.user.updateMany({
      where: { id, status: AccountStatus.APPROVED },
      data: { authVersion: { increment: 1 } },
    });
    if (!result.count) throw unauthorized('AUTH_ACCOUNT_UNAVAILABLE');
  }

  async review(id: string, reviewerId: string, dto: RegistrationReviewDto) {
    const note = dto.note?.trim() || null;
    if (dto.decision === 'REJECTED' && !note)
      invalidRegistration(
        'REGISTRATION_REJECTION_NOTE_REQUIRED',
        'A rejeição exige justificativa',
      );
    return this.prisma.$transaction(async (transaction) => {
      await this.actors.assertAdministrator(reviewerId, transaction);
      const user = await transaction.user.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!user)
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Usuário não encontrado',
        });
      if (user.status === dto.decision) return user;
      if (user.status !== AccountStatus.PENDING)
        throw new ConflictException({
          code: 'REGISTRATION_REVIEW_NOT_PENDING',
          message: 'Somente cadastro pendente pode ser revisado',
        });
      const result = await transaction.user.updateMany({
        where: { id, status: AccountStatus.PENDING },
        data: {
          status: dto.decision,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      if (!result.count)
        throw new ConflictException({
          code: 'REGISTRATION_REVIEW_CONFLICT',
          message: 'O cadastro já foi revisado; consulte o estado atual',
        });
      return { id, status: dto.decision };
    });
  }
}
