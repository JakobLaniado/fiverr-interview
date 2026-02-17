import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from './links.entity';
import { Click } from './clicks.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Link, Click])],
})
export class LinksModule {}
