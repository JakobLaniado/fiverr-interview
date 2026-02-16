import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DataSource } from 'typeorm';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: { query: jest.Mock };

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('should return ok with db connected', async () => {
      const result = await controller.check();
      expect(result).toEqual({ status: 'ok', db: 'connected' });
    });

    it('should return ok with db disconnected when query fails', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('connection refused'),
      );
      const result = await controller.check();
      expect(result).toEqual({ status: 'ok', db: 'disconnected' });
    });
  });
});
