import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotContains,
  ValidateIf,
} from 'class-validator';
import {
  FeedbackTargetType,
  FeedbackVisibility,
  type FeedbackTargetType as FeedbackTargetTypeValue,
  type FeedbackVisibility as FeedbackVisibilityValue,
} from '../generated/prisma/enums';
import {
  FEEDBACK_COMMENT_MAX_LENGTH,
  FEEDBACK_FORBIDDEN_CHARACTER,
  FEEDBACK_ID_MAX_LENGTH,
  FEEDBACK_MODERATION_REASON_MAX_LENGTH,
  FEEDBACK_RATING_MAX,
  FEEDBACK_RATING_MIN,
} from './feedback.constants';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export class FeedbackSessionParamsDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(FEEDBACK_ID_MAX_LENGTH)
  @NotContains(FEEDBACK_FORBIDDEN_CHARACTER)
  sessionId!: string;
}

export class CreateFeedbackDto {
  @IsEnum(FeedbackTargetType)
  targetType!: FeedbackTargetTypeValue;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Matches(/\S/)
  @MaxLength(FEEDBACK_ID_MAX_LENGTH)
  @NotContains(FEEDBACK_FORBIDDEN_CHARACTER)
  targetUserId?: string | null;

  @IsInt()
  @Min(FEEDBACK_RATING_MIN)
  @Max(FEEDBACK_RATING_MAX)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDBACK_COMMENT_MAX_LENGTH)
  @NotContains(FEEDBACK_FORBIDDEN_CHARACTER)
  comment?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(FeedbackVisibility)
  visibility?: FeedbackVisibilityValue;
}

export class FeedbackParamsDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(FEEDBACK_ID_MAX_LENGTH)
  @NotContains(FEEDBACK_FORBIDDEN_CHARACTER)
  id!: string;
}

export class ListFeedbacksDto extends PaginationQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(FeedbackTargetType)
  targetType?: FeedbackTargetTypeValue;
}

export class UpdateFeedbackDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(FEEDBACK_RATING_MIN)
  @Max(FEEDBACK_RATING_MAX)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(FEEDBACK_COMMENT_MAX_LENGTH)
  @NotContains(FEEDBACK_FORBIDDEN_CHARACTER)
  comment?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(FeedbackVisibility)
  visibility?: FeedbackVisibilityValue;
}

export class HideFeedbackDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(FEEDBACK_MODERATION_REASON_MAX_LENGTH)
  @NotContains(FEEDBACK_FORBIDDEN_CHARACTER)
  reason!: string;
}
