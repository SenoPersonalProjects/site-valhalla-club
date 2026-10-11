import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCampaignDto {
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
}
