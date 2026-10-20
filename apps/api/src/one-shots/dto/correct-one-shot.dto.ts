import {
  IsDateString,
  IsNotEmpty,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CorrectOneShotDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  gameSystemId?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsDateString()
  scheduledAt?: string;
}
