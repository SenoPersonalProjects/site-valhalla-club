import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCampaignDto {
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
}
