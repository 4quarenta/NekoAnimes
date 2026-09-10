import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService
  ) {}

  liveness() {
    return {
      status: 'ok',
      service: 'neko-api',
      timestamp: new Date().toISOString()
    };
  }

  async readiness() {
    const [database, redis] = await Promise.allSettled([
      this.database.ping(),
      this.redis.ping()
    ]);

    const dependencies = {
      postgres: database.status === 'fulfilled' ? 'ok' : 'error',
      redis: redis.status === 'fulfilled' ? 'ok' : 'error'
    } as const;

    return {
      status: dependencies.postgres === 'ok' && dependencies.redis === 'ok' ? 'ok' : 'degraded',
      service: 'neko-api',
      dependencies,
      timestamp: new Date().toISOString()
    };
  }
}
