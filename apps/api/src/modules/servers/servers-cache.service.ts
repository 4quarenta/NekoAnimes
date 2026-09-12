import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

interface MemoryEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class ServersCacheService {
  private readonly logger = new Logger(ServersCacheService.name);
  private readonly memory = new Map<string, MemoryEntry<unknown>>();

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.getJson<T>(key);
      if (cached !== null) return cached;
    } catch (error) {
      this.logger.debug(`Redis cache miss/failure: ${error instanceof Error ? error.message : String(error)}`);
    }

    const fallback = this.memory.get(key);
    if (!fallback) return null;
    if (fallback.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }

    return fallback.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const safeTtl = Math.max(1, Math.min(ttlSeconds, 86_400));
    this.memory.set(key, { value, expiresAt: Date.now() + safeTtl * 1_000 });

    try {
      await this.redis.setJson(key, value, safeTtl);
    } catch (error) {
      this.logger.debug(`Redis cache write failure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
