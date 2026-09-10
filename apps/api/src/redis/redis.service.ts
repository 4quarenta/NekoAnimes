import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType;

  constructor(config: ConfigService) {
    this.client = createClient({
      url: config.getOrThrow<string>('REDIS_URL')
    });

    this.client.on('error', (error) => {
      this.logger.warn(`Redis: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureConnected();
    } catch (error) {
      this.logger.warn(
        `Redis indisponível na inicialização: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async ping(): Promise<void> {
    await this.ensureConnected();
    const response = await this.client.ping();
    if (response !== 'PONG') throw new Error('Resposta Redis inesperada');
  }

  async getJson<T>(key: string): Promise<T | null> {
    await this.ensureConnected();
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    await this.ensureConnected();
    const serialized = JSON.stringify(value);

    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, serialized, { EX: ttlSeconds });
      return;
    }

    await this.client.set(key, serialized);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) await this.client.close();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
  }
}
