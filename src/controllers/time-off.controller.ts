import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TimeOffRequest } from '../database/entities/time-off-request.entity';
import {
  ApproveTimeOffDto,
  CancelTimeOffDto,
  CreateTimeOffRequestDto,
  ListTimeOffQueryDto,
  RejectTimeOffDto,
} from '../dtos/time-off.dto';
import { TimeOffService } from '../services/time-off.service';

@ApiTags('time-off')
@Controller('time-off-requests')
export class TimeOffController {
  constructor(private readonly service: TimeOffService) {}

  @Post()
  @ApiOperation({
    summary: 'File a time-off request. HCM (source of truth) must accept before it is confirmed.',
  })
  create(@Body() dto: CreateTimeOffRequestDto): Promise<TimeOffRequest> {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List time-off requests, optionally filtered.' })
  list(@Query() query: ListTimeOffQueryDto): Promise<TimeOffRequest[]> {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single time-off request by id.' })
  get(@Param('id') id: string): Promise<TimeOffRequest> {
    return this.service.get(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a PENDING request (manager).' })
  approve(@Param('id') id: string, @Body() dto: ApproveTimeOffDto): Promise<TimeOffRequest> {
    return this.service.approve(id, dto.managerId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a PENDING request and release the reservation.' })
  reject(@Param('id') id: string, @Body() dto: RejectTimeOffDto): Promise<TimeOffRequest> {
    return this.service.reject(id, dto.managerId, dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a PENDING or APPROVED request and restore the balance.' })
  cancel(@Param('id') id: string, @Body() dto: CancelTimeOffDto): Promise<TimeOffRequest> {
    return this.service.cancel(id, dto.reason);
  }
}
