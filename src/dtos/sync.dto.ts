import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
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
