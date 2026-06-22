import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { LeaveType } from '../common/enums/leave-type.enum';
import { TimeOffStatus } from '../common/enums/time-off-status.enum';

export class CreateTimeOffRequestDto {
  @ApiProperty({ example: 'emp-001' })
  @IsString()
  employeeId: string;

  @ApiProperty({ example: 'loc-nyc' })
  @IsString()
  locationId: string;

  @ApiProperty({ enum: LeaveType, example: LeaveType.VACATION })
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @ApiProperty({ example: '2026-07-01', description: 'Inclusive ISO date (YYYY-MM-DD).' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-03', description: 'Inclusive ISO date (YYYY-MM-DD).' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Override day count; computed from the date range when omitted.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  numberOfDays?: number;

  @ApiPropertyOptional({ description: 'Caller-supplied key for safe retries.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class ApproveTimeOffDto {
  @ApiProperty({ example: 'mgr-007', description: 'Approving manager id.' })
  @IsString()
  managerId: string;
}

export class RejectTimeOffDto {
  @ApiProperty({ example: 'mgr-007', description: 'Rejecting manager id.' })
  @IsString()
  managerId: string;

  @ApiPropertyOptional({ example: 'Insufficient coverage that week.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancelTimeOffDto {
  @ApiPropertyOptional({ example: 'Plans changed.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListTimeOffQueryDto {
  @ApiPropertyOptional({ example: 'emp-001' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'loc-nyc' })
  @IsOptional()
  @IsString()
  locationId?: string;

  @ApiPropertyOptional({ enum: LeaveType })
  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @ApiPropertyOptional({ enum: TimeOffStatus })
  @IsOptional()
  @IsEnum(TimeOffStatus)
  status?: TimeOffStatus;
}
