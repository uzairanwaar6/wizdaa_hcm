import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { LeaveType } from '../../common/enums/leave-type.enum';
import { numericTransformer } from '../../common/transformers/numeric.transformer';

@Entity('balance')
@Unique('UQ_balance_employee_location_leave_type', ['employeeId', 'locationId', 'leaveType'])
export class Balance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'text' })
  employeeId: string;

  @Index()
  @Column({ type: 'text' })
  locationId: string;

  @Column({ type: 'text' })
  leaveType: LeaveType;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0, transformer: numericTransformer })
  entitledDays: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0, transformer: numericTransformer })
  availableDays: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0, transformer: numericTransformer })
  pendingDays: number;

  @VersionColumn()
  version: number;

  @Column({ type: 'datetime', nullable: true })
  sourceUpdatedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastSyncedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
