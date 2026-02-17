import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LinksService } from './links.service';
import type { StatsResponse } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { LinkStatsQueryDto } from './dto/link-stats-query.dto';

@Controller()
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Post('links')
  @HttpCode(HttpStatus.CREATED)
  async createLink(
    @Body() dto: CreateLinkDto,
  ): Promise<{ shortUrl: string; shortCode: string; targetUrl: string }> {
    const link = await this.linksService.createLink(dto.targetUrl);
    return {
      shortUrl: this.linksService.buildShortUrl(link.shortCode),
      shortCode: link.shortCode,
      targetUrl: link.targetUrl,
    };
  }

  @Get('stats')
  async getStats(@Query() query: LinkStatsQueryDto): Promise<StatsResponse> {
    return this.linksService.getStats(query.page, query.limit);
  }

  @Get(':shortCode')
  async redirect(
    @Param('shortCode') shortCode: string,
    @Res() res: Response,
  ): Promise<void> {
    const targetUrl = await this.linksService.recordClick(shortCode);
    res.redirect(HttpStatus.FOUND, targetUrl);
  }
}
