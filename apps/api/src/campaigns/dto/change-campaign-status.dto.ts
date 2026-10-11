import { IsEnum } from 'class-validator';
import {
  CampaignStatus,
  type CampaignStatus as CampaignStatusValue,
} from '../../generated/prisma/enums';

export class ChangeCampaignStatusDto {
  @IsEnum(CampaignStatus)
  status!: CampaignStatusValue;
}
