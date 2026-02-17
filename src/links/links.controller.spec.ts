import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';
import type { StatsResponse } from './links.service';
import type { Link } from './links.entity';

describe('LinksController', () => {
  let controller: LinksController;

  const mockLinksService = {
    createLink: jest.fn(),
    recordClick: jest.fn(),
    getStats: jest.fn(),
    buildShortUrl: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinksService, useValue: mockLinksService }],
    }).compile();

    controller = module.get<LinksController>(LinksController);
  });

  describe('POST /links', () => {
    it('should create a link and return formatted response', async () => {
      const mockLink: Partial<Link> = {
        id: 'uuid-1',
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
      };
      mockLinksService.createLink.mockResolvedValue(mockLink);
      mockLinksService.buildShortUrl.mockReturnValue(
        'http://localhost:3000/abc12345',
      );

      const result = await controller.createLink({
        targetUrl: 'https://fiverr.com/gig',
      });

      expect(result).toEqual({
        shortUrl: 'http://localhost:3000/abc12345',
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
      });
      expect(mockLinksService.createLink).toHaveBeenCalledWith(
        'https://fiverr.com/gig',
      );
    });
  });

  describe('GET /stats', () => {
    it('should delegate to service with page and limit', async () => {
      const mockResponse: StatsResponse = {
        data: [],
        meta: { page: 2, limit: 5, totalLinks: 0, totalPages: 0 },
      };
      mockLinksService.getStats.mockResolvedValue(mockResponse);

      const result = await controller.getStats({ page: 2, limit: 5 });

      expect(result).toEqual(mockResponse);
      expect(mockLinksService.getStats).toHaveBeenCalledWith(2, 5);
    });
  });

  describe('GET /:shortCode', () => {
    it('should redirect with 302 to the target URL', async () => {
      mockLinksService.recordClick.mockResolvedValue('https://fiverr.com/gig');
      const mockRes = { redirect: jest.fn() };

      await controller.redirect(
        'abc12345',
        mockRes as unknown as import('express').Response,
      );

      expect(mockLinksService.recordClick).toHaveBeenCalledWith('abc12345');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        302,
        'https://fiverr.com/gig',
      );
    });

    it('should propagate NotFoundException for unknown shortCode', async () => {
      mockLinksService.recordClick.mockRejectedValue(
        new NotFoundException('Link not found'),
      );
      const mockRes = { redirect: jest.fn() };

      await expect(
        controller.redirect(
          'unknown',
          mockRes as unknown as import('express').Response,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
