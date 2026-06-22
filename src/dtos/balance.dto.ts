import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaveType } from '../common/enums/leave-type.enum';

export class ListBalancesQueryDto {
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
}
