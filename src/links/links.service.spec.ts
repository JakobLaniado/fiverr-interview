import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { LinksService } from './links.service';
import { Link } from './links.entity';
import { Click } from './clicks.entity';
import { validateClick } from './fraud-validation.util';

jest.mock('./fraud-validation.util');
const mockValidateClick = validateClick as jest.MockedFunction<
  typeof validateClick
>;

describe('LinksService', () => {
  let service: LinksService;

  const mockQueryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    execute: jest.fn(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockLinkRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    increment: jest.fn(),
  };

  const mockClickRepository = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:3000'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinksService,
        { provide: getRepositoryToken(Link), useValue: mockLinkRepository },
        { provide: getRepositoryToken(Click), useValue: mockClickRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LinksService>(LinksService);
  });

  describe('createLink', () => {
    const targetUrl = 'https://fiverr.com/some-gig';
    const mockLink: Partial<Link> = {
      id: 'uuid-1',
      shortCode: 'abc12345',
      targetUrl,
      totalClicks: 0,
      validClicks: 0,
      rewardAmountCents: 0,
    };

    it('should create and return a new link', async () => {
      mockLinkRepository.create.mockReturnValue(mockLink);
      mockLinkRepository.save.mockResolvedValue(mockLink);

      const result = await service.createLink(targetUrl);

      expect(result).toEqual(mockLink);
      expect(mockLinkRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetUrl }),
      );
      expect(mockLinkRepository.save).toHaveBeenCalled();
    });

    it('should trim whitespace from targetUrl', async () => {
      mockLinkRepository.create.mockReturnValue(mockLink);
      mockLinkRepository.save.mockResolvedValue(mockLink);

      await service.createLink('  https://fiverr.com/some-gig  ');

      expect(mockLinkRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ targetUrl }),
      );
    });

    it('should return existing link on duplicate targetUrl', async () => {
      const queryError = new QueryFailedError('INSERT', [], new Error());
      (queryError as QueryFailedError & { code?: string }).code = '23505';

      mockLinkRepository.create.mockReturnValue(mockLink);
      mockLinkRepository.save.mockRejectedValue(queryError);
      mockLinkRepository.findOneBy.mockResolvedValue(mockLink);

      const result = await service.createLink(targetUrl);

      expect(result).toEqual(mockLink);
      expect(mockLinkRepository.findOneBy).toHaveBeenCalledWith({ targetUrl });
    });

    it('should rethrow non-duplicate errors', async () => {
      const error = new Error('connection failed');
      mockLinkRepository.create.mockReturnValue(mockLink);
      mockLinkRepository.save.mockRejectedValue(error);

      await expect(service.createLink(targetUrl)).rejects.toThrow(
        'connection failed',
      );
    });
  });

  describe('findByShortCode', () => {
    it('should return the link when found', async () => {
      const mockLink = { id: 'uuid-1', shortCode: 'abc12345' };
      mockLinkRepository.findOneBy.mockResolvedValue(mockLink);

      const result = await service.findByShortCode('abc12345');

      expect(result).toEqual(mockLink);
    });

    it('should throw NotFoundException when not found', async () => {
      mockLinkRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findByShortCode('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('recordClick', () => {
    const mockLink: Partial<Link> = {
      id: 'uuid-1',
      shortCode: 'abc12345',
      targetUrl: 'https://fiverr.com/gig',
    };
    const mockClick: Partial<Click> = { id: 'click-1', linkId: 'uuid-1' };

    beforeEach(() => {
      mockLinkRepository.findOneBy.mockResolvedValue(mockLink);
      mockClickRepository.create.mockReturnValue(mockClick);
      mockClickRepository.save.mockResolvedValue(mockClick);
      mockLinkRepository.increment.mockResolvedValue(undefined);
      mockValidateClick.mockResolvedValue(false);
    });

    it('should create a click, increment totalClicks, and return targetUrl', async () => {
      const result = await service.recordClick('abc12345');

      expect(result).toBe('https://fiverr.com/gig');
      expect(mockClickRepository.create).toHaveBeenCalledWith({
        linkId: 'uuid-1',
      });
      expect(mockClickRepository.save).toHaveBeenCalledWith(mockClick);
      expect(mockLinkRepository.increment).toHaveBeenCalledWith(
        { id: 'uuid-1' },
        'totalClicks',
        1,
      );
    });

    it('should throw NotFoundException for unknown shortCode', async () => {
      mockLinkRepository.findOneBy.mockResolvedValue(null);

      await expect(service.recordClick('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('processClickReward', () => {
    it('should update click and increment link counters when valid', async () => {
      mockValidateClick.mockResolvedValue(true);
      mockQueryBuilder.execute.mockResolvedValue({ affected: 1 });
      mockLinkRepository.increment.mockResolvedValue(undefined);

      await service.processClickReward('click-1', 'link-1');

      expect(mockQueryBuilder.set).toHaveBeenCalledWith({
        isValid: true,
        rewarded: true,
        rewardAmountCents: 5,
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'id = :id AND rewarded = false',
        { id: 'click-1' },
      );
      expect(mockLinkRepository.increment).toHaveBeenCalledWith(
        { id: 'link-1' },
        'validClicks',
        1,
      );
      expect(mockLinkRepository.increment).toHaveBeenCalledWith(
        { id: 'link-1' },
        'rewardAmountCents',
        5,
      );
    });

    it('should skip link increment when atomic guard returns no rows (double-call)', async () => {
      mockValidateClick.mockResolvedValue(true);
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      await service.processClickReward('click-1', 'link-1');

      expect(mockLinkRepository.increment).not.toHaveBeenCalled();
    });

    it('should mark click as invalid when fraud check fails', async () => {
      mockValidateClick.mockResolvedValue(false);

      await service.processClickReward('click-1', 'link-1');

      expect(mockClickRepository.update).toHaveBeenCalledWith('click-1', {
        isValid: false,
      });
      expect(mockLinkRepository.increment).not.toHaveBeenCalled();
    });

    it('should not throw when an internal error occurs', async () => {
      mockValidateClick.mockRejectedValue(new Error('network error'));

      await expect(
        service.processClickReward('click-1', 'link-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return paginated links with monthly breakdown', async () => {
      const mockLinks: Partial<Link>[] = [
        {
          id: 'uuid-1',
          shortCode: 'abc12345',
          targetUrl: 'https://fiverr.com/gig',
          totalClicks: 10,
          validClicks: 5,
          rewardAmountCents: 25,
          createdAt: new Date('2026-02-01'),
        },
      ];

      mockLinkRepository.count.mockResolvedValue(1);
      mockLinkRepository.find.mockResolvedValue(mockLinks);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { linkId: 'uuid-1', month: '02/2026', earning_cents: '25' },
      ]);

      const result = await service.getStats(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        url: 'https://fiverr.com/gig',
        total_clicks: 10,
        total_earning: 0.25,
        monthly_breakdown: [{ month: '02/2026', earning: 0.25 }],
      });
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        totalLinks: 1,
        totalPages: 1,
      });
    });

    it('should return empty data when no links exist', async () => {
      mockLinkRepository.count.mockResolvedValue(0);
      mockLinkRepository.find.mockResolvedValue([]);

      const result = await service.getStats(1, 10);

      expect(result.data).toEqual([]);
      expect(result.meta.totalLinks).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('buildShortUrl', () => {
    it('should construct a full URL from shortCode', () => {
      expect(service.buildShortUrl('abc12345')).toBe(
        'http://localhost:3000/abc12345',
      );
    });
  });
});
