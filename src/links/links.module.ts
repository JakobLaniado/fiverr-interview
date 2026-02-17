import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from './links.entity';
import { Click } from './clicks.entity';
import { LinksService } from './links.service';

@Module({
  imports: [TypeOrmModule.forFeature([Link, Click])],
  providers: [LinksService],
})
export class LinksModule {}
