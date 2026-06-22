import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LeaveType } from '../common/enums/leave-type.enum';

export class RefreshBalanceDto {
  @ApiProperty({ example: 'emp-001' })
  @IsString()
  employeeId: string;

  @ApiProperty({ example: 'loc-nyc' })
  @IsString()
  locationId: string;

  @ApiProperty({ enum: LeaveType, example: LeaveType.VACATION })
  @IsEnum(LeaveType)
  leaveType: LeaveType;
}

export class BalanceSnapshotDto {
  @ApiProperty({ example: 'emp-001' })
  @IsString()
  employeeId: string;

  @ApiProperty({ example: 'loc-nyc' })
  @IsString()
  locationId: string;

  @ApiProperty({ enum: LeaveType, example: LeaveType.VACATION })
  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0)
  entitledDays: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(0)
  availableDays: number;

  @ApiProperty({ required: false, example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  sourceUpdatedAt?: string;
}

export class ImportBalancesDto {
  @ApiProperty({ type: [BalanceSnapshotDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BalanceSnapshotDto)
  balances: BalanceSnapshotDto[];
}
