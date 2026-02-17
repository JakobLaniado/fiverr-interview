import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Link } from './links.entity';

@Index(['linkId', 'clickedAt'])
@Entity('clicks')
export class Click {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Link, (link) => link.clicks, { onDelete: 'CASCADE' })
  link: Link;

  @Column({ type: 'uuid' })
  linkId: string;

  @Column({ type: 'boolean', nullable: true })
  isValid: boolean | null;

  @Column({ type: 'boolean', default: false })
  rewarded: boolean;

  @Column({ type: 'int', default: 0 })
  rewardAmountCents: number;

  @CreateDateColumn()
  clickedAt: Date;
}
