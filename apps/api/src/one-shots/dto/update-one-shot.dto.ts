import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class UpdateOneShotSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateOneShotDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  gameSystemId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOneShotSessionDto)
  session?: UpdateOneShotSessionDto;
}
