import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { DataSource } from 'typeorm';

describe('HealthService', () => {
  let service: HealthService;
  let mockDataSource: { query: jest.Mock };

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('check', () => {
    it('should query the database with SELECT 1', async () => {
      await service.check();
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should return connected when db responds', async () => {
      const result = await service.check();
      expect(result).toEqual({ status: 'ok', db: 'connected' });
    });

    it('should return disconnected when db throws', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('fail'));
      const result = await service.check();
      expect(result).toEqual({ status: 'ok', db: 'disconnected' });
    });
  });
});
