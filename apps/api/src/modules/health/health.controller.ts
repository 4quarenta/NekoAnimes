import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  getHealth() {
    return this.health.liveness();
  }

  @Get('ready')
  async getReadiness() {
    const result = await this.health.readiness();

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
