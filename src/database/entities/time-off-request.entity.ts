import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeaveType } from '../../common/enums/leave-type.enum';
import { numericTransformer } from '../../common/transformers/numeric.transformer';
import { TimeOffStatus } from '../../common/enums/time-off-status.enum';

@Entity('time_off_request')
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'text' })
  employeeId: string;

  @Column({ type: 'text' })
  locationId: string;

  @Column({ type: 'text' })
  leaveType: LeaveType;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, transformer: numericTransformer })
  numberOfDays: number;

  @Index()
  @Column({ type: 'text', default: TimeOffStatus.PENDING })
  status: TimeOffStatus;

  @Column({ type: 'text', nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'text', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'datetime', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
