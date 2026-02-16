import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async check(): Promise<{ status: string; db: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', db: 'connected' };
    } catch {
      return { status: 'ok', db: 'disconnected' };
    }
  }
}
