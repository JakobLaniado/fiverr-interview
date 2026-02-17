import { IsUrl } from 'class-validator';

export class CreateLinkDto {
  @IsUrl({}, { message: 'targetUrl must be a valid URL' })
  targetUrl: string;
}
