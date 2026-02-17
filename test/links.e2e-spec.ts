import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { validateClick } from './../src/links/fraud-validation.util';

jest.mock('./../src/links/fraud-validation.util');
const mockValidateClick = validateClick as jest.MockedFunction<
  typeof validateClick
>;

describe('Links (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    mockValidateClick.mockResolvedValue(true);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await dataSource.query('DELETE FROM clicks');
    await dataSource.query('DELETE FROM links');
    await app.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM clicks');
    await dataSource.query('DELETE FROM links');
    mockValidateClick.mockResolvedValue(true);
  });

  describe('POST /links', () => {
    it('should create a new short link (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-1' })
        .expect(201);

      const body = res.body as {
        shortUrl: string;
        shortCode: string;
        targetUrl: string;
      };
      expect(body.targetUrl).toBe('https://www.fiverr.com/gig-1');
      expect(body.shortCode).toBeDefined();
      expect(body.shortCode).toHaveLength(8);
      expect(body.shortUrl).toContain(body.shortCode);
    });

    it('should return the same link for duplicate targetUrl (idempotent)', async () => {
      const res1 = await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-dup' })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-dup' })
        .expect(201);

      const body1 = res1.body as { shortCode: string };
      const body2 = res2.body as { shortCode: string };
      expect(body1.shortCode).toBe(body2.shortCode);
    });

    it('should return 400 for invalid URL', async () => {
      await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'not-a-url' })
        .expect(400);
    });

    it('should return 400 for missing targetUrl', async () => {
      await request(app.getHttpServer()).post('/links').send({}).expect(400);
    });
  });

  describe('GET /:shortCode', () => {
    it('should 302 redirect to the target URL', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-redirect' })
        .expect(201);

      const { shortCode } = createRes.body as { shortCode: string };

      const res = await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302);

      expect(res.headers['location']).toBe(
        'https://www.fiverr.com/gig-redirect',
      );
    });

    it('should return 404 for unknown shortCode', async () => {
      await request(app.getHttpServer()).get('/unknownXY').expect(404);
    });
  });

  describe('GET /stats', () => {
    it('should return empty stats when no links exist', async () => {
      const res = await request(app.getHttpServer()).get('/stats').expect(200);

      const body = res.body as {
        data: unknown[];
        meta: { page: number; limit: number; totalLinks: number };
      };
      expect(body.data).toEqual([]);
      expect(body.meta.totalLinks).toBe(0);
    });

    it('should return paginated stats with defaults', async () => {
      await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-stats' })
        .expect(201);

      const res = await request(app.getHttpServer()).get('/stats').expect(200);

      const body = res.body as {
        data: { url: string; total_clicks: number }[];
        meta: { page: number; limit: number; totalLinks: number };
      };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].url).toBe('https://www.fiverr.com/gig-stats');
      expect(body.data[0].total_clicks).toBe(0);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
    });

    it('should respect page and limit params', async () => {
      await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-page' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/stats?page=1&limit=5')
        .expect(200);

      const body = res.body as { meta: { page: number; limit: number } };
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(5);
    });

    it('should return 400 for invalid pagination params', async () => {
      await request(app.getHttpServer()).get('/stats?page=0').expect(400);

      await request(app.getHttpServer()).get('/stats?limit=101').expect(400);
    });
  });

  describe('Integration: create → click → stats', () => {
    it('should track clicks and earnings end-to-end', async () => {
      mockValidateClick.mockResolvedValue(true);

      const createRes = await request(app.getHttpServer())
        .post('/links')
        .send({ targetUrl: 'https://www.fiverr.com/gig-integration' })
        .expect(201);

      const { shortCode } = createRes.body as { shortCode: string };

      // Click the link twice
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);
      await request(app.getHttpServer()).get(`/${shortCode}`).expect(302);

      // Wait for async reward processing to complete
      await new Promise((resolve) => setTimeout(resolve, 800));

      const statsRes = await request(app.getHttpServer())
        .get('/stats')
        .expect(200);

      const body = statsRes.body as {
        data: {
          url: string;
          total_clicks: number;
          total_earning: number;
          monthly_breakdown: { month: string; earning: number }[];
        }[];
      };

      expect(body.data).toHaveLength(1);
      expect(body.data[0].total_clicks).toBe(2);
      expect(body.data[0].total_earning).toBe(0.1);
      expect(body.data[0].monthly_breakdown).toHaveLength(1);
      expect(body.data[0].monthly_breakdown[0].earning).toBe(0.1);
    });
  });
});
