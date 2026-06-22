import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Balance } from '../database/entities/balance.entity';
import { RefreshBalanceDto } from '../dtos/sync.dto';
import { SyncService, SyncSummary } from '../services/sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import the full balance corpus from HCM and reconcile the cache.' })
  importBatch(): Promise<SyncSummary> {
    return this.sync.importBatch();
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Realtime refresh of a single balance from HCM.' })
  refresh(@Body() dto: RefreshBalanceDto): Promise<Balance> {
    return this.sync.refreshOne(dto);
  }
}
