import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Link } from './links.entity';
import { Click } from './clicks.entity';
import { validateClick } from './fraud-validation.util';

const REWARD_CENTS = 5;
const SHORT_CODE_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 3;

export interface MonthlyBreakdown {
  month: string;
  earning: number;
}

export interface LinkStats {
  url: string;
  total_clicks: number;
  total_earning: number;
  monthly_breakdown: MonthlyBreakdown[];
}

export interface StatsResponse {
  data: LinkStats[];
  meta: {
    page: number;
    limit: number;
    totalLinks: number;
    totalPages: number;
  };
}

function generateShortCode(): string {
  return randomBytes(6).toString('base64url').slice(0, SHORT_CODE_LENGTH);
}

@Injectable()
export class LinksService {
  private readonly baseUrl: string;

  constructor(
    @InjectRepository(Link)
    private readonly linkRepository: Repository<Link>,
    @InjectRepository(Click)
    private readonly clickRepository: Repository<Click>,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('BASE_URL') ?? 'http://localhost:3000';
  }

  async createLink(targetUrl: string): Promise<Link> {
    const normalizedUrl = targetUrl.trim();

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const link = this.linkRepository.create({
        targetUrl: normalizedUrl,
        shortCode: generateShortCode(),
      });

      try {
        return await this.linkRepository.save(link);
      } catch (error: unknown) {
        if (
          error instanceof QueryFailedError &&
          (error as QueryFailedError & { code?: string }).code === '23505'
        ) {
          const existing = await this.linkRepository.findOneBy({
            targetUrl: normalizedUrl,
          });
          if (existing) return existing;
          // Collision on shortCode — retry with a new one
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate unique short code after max attempts');
  }

  async findByShortCode(shortCode: string): Promise<Link> {
    const link = await this.linkRepository.findOneBy({ shortCode });
    if (!link) {
      throw new NotFoundException('Link not found');
    }
    return link;
  }

  async recordClick(shortCode: string): Promise<string> {
    const link = await this.findByShortCode(shortCode);

    const click = this.clickRepository.create({ linkId: link.id });
    await this.clickRepository.save(click);

    await this.linkRepository.increment({ id: link.id }, 'totalClicks', 1);

    void this.processClickReward(click.id, link.id);

    return link.targetUrl;
  }

  async processClickReward(clickId: string, linkId: string): Promise<void> {
    try {
      const isValid = await validateClick();

      if (isValid) {
        const result = await this.clickRepository
          .createQueryBuilder()
          .update(Click)
          .set({
            isValid: true,
            rewarded: true,
            rewardAmountCents: REWARD_CENTS,
          })
          .where('id = :id AND rewarded = false', { id: clickId })
          .returning('id')
          .execute();

        if (result.affected && result.affected > 0) {
          await this.linkRepository.increment({ id: linkId }, 'validClicks', 1);
          await this.linkRepository.increment(
            { id: linkId },
            'rewardAmountCents',
            REWARD_CENTS,
          );
        }
      } else {
        await this.clickRepository.update(clickId, { isValid: false });
      }
    } catch {
      // Fire-and-forget: swallow errors to prevent unhandled rejections.
      // In production, this would log to an error tracking service.
    }
  }

  async getStats(page: number, limit: number): Promise<StatsResponse> {
    const totalLinks = await this.linkRepository.count();
    const totalPages = Math.ceil(totalLinks / limit);

    const links = await this.linkRepository.find({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    if (links.length === 0) {
      return {
        data: [],
        meta: { page, limit, totalLinks, totalPages },
      };
    }

    const linkIds = links.map((l) => l.id);
    const monthlyRaw: {
      linkId: string;
      month: string;
      earning_cents: string;
    }[] = await this.clickRepository
      .createQueryBuilder('click')
      .select('click.linkId', 'linkId')
      .addSelect(
        "TO_CHAR(DATE_TRUNC('month', click.clickedAt), 'MM/YYYY')",
        'month',
      )
      .addSelect(
        'COALESCE(SUM(click.rewardAmountCents) FILTER (WHERE click.isValid = true), 0)::int',
        'earning_cents',
      )
      .where('click.linkId IN (:...linkIds)', { linkIds })
      .groupBy('click.linkId')
      .addGroupBy("DATE_TRUNC('month', click.clickedAt)")
      .orderBy('month', 'DESC')
      .getRawMany();

    const monthlyByLink = new Map<string, MonthlyBreakdown[]>();
    for (const row of monthlyRaw) {
      const breakdowns = monthlyByLink.get(row.linkId) ?? [];
      breakdowns.push({
        month: row.month,
        earning: Number(row.earning_cents) / 100,
      });
      monthlyByLink.set(row.linkId, breakdowns);
    }

    const data: LinkStats[] = links.map((link) => ({
      url: link.targetUrl,
      total_clicks: link.totalClicks,
      total_earning: link.rewardAmountCents / 100,
      monthly_breakdown: monthlyByLink.get(link.id) ?? [],
    }));

    return {
      data,
      meta: { page, limit, totalLinks, totalPages },
    };
  }

  buildShortUrl(shortCode: string): string {
    return `${this.baseUrl}/${shortCode}`;
  }
}
