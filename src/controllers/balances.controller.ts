import { Controller, Get, Param, ParseEnumPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LeaveType } from '../common/enums/leave-type.enum';
import { Balance } from '../database/entities/balance.entity';
import { ListBalancesQueryDto } from '../dtos/balance.dto';
import { BalancesService } from '../services/balances.service';

@ApiTags('balances')
@Controller('balances')
export class BalancesController {
  constructor(private readonly balances: BalancesService) {}

  @Get()
  @ApiOperation({ summary: 'List leave balances, optionally filtered by employee/location/type.' })
  list(@Query() query: ListBalancesQueryDto): Promise<Balance[]> {
    return this.balances.list(query);
  }

  @Get(':employeeId/:locationId/:leaveType')
  @ApiOperation({ summary: 'Get a single balance for an employee/location/leave-type.' })
  get(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Param('leaveType', new ParseEnumPipe(LeaveType)) leaveType: LeaveType,
  ): Promise<Balance> {
    return this.balances.findOrFail({ employeeId, locationId, leaveType });
  }
}
