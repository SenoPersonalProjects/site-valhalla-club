import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsDateString()
  scheduledAt!: string;
}
