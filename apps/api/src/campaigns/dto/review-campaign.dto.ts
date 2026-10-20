import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  ApprovalStatus,
  type ApprovalStatus as ApprovalStatusValue,
} from '../../generated/prisma/enums';

const REVIEW_DECISIONS = [
  ApprovalStatus.APPROVED,
  ApprovalStatus.REJECTED,
] as const;

export class ReviewCampaignDto {
  @IsIn(REVIEW_DECISIONS)
  decision!: ApprovalStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
