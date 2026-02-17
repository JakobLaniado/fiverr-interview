import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Click } from './clicks.entity';

@Entity('links')
export class Link {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, unique: true })
  shortCode: string;

  @Column({ type: 'text', unique: true })
  targetUrl: string;

  @Column({ type: 'int', default: 0 })
  totalClicks: number;

  @Column({ type: 'int', default: 0 })
  validClicks: number;

  @Column({ type: 'int', default: 0 })
  rewardAmountCents: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Click, (click) => click.link)
  clicks: Click[];
}
