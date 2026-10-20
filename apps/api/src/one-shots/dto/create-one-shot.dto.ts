import { Type } from 'class-transformer';
import {
  IsDateString,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class CreateOneShotSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsDateString()
  scheduledAt!: string;
}

export class CreateOneShotDto {
  @IsString()
  @IsNotEmpty()
  gameSystemId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ValidateNested()
  @IsDefined()
  @Type(() => CreateOneShotSessionDto)
  session!: CreateOneShotSessionDto;
}
