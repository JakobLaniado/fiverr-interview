import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Link } from './links.entity';
import { Click } from './clicks.entity';
import { LinksService } from './links.service';
import { LinksController } from './links.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Link, Click])],
  controllers: [LinksController],
  providers: [LinksService],
})
export class LinksModule {}
