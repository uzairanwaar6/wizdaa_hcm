import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Service is up and able to serve requests.' })
  check(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'timeoff-microservice',
      timestamp: new Date().toISOString(),
    };
  }
}
