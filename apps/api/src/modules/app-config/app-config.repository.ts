import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { appConfig, type AppConfigRow } from '../../database/schema';
import {
  AdConfigSchema,
  type AppConfigState,
  type AppConfigUpdate,
  DEFAULT_AD_CONFIG
} from './app-config.types';

@Injectable()
export class AppConfigRepository {
  private readonly logger = new Logger(AppConfigRepository.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService
  ) {}

  async get(): Promise<AppConfigState> {
    let row = await this.findSingleton();

    if (!row) {
      await this.database.db
        .insert(appConfig)
        .values({
          id: 1,
          version: 1,
          mode: this.config.get<number>('APP_MODE') === 2 ? 2 : 1,
          payload: { ads: DEFAULT_AD_CONFIG }
        })
        .onConflictDoNothing();

      row = await this.findSingleton();
    }

    if (!row) throw new Error('Não foi possível inicializar app_config');
    return this.toState(row);
  }

  async update(input: AppConfigUpdate): Promise<AppConfigState> {
    await this.get();

    const [updated] = await this.database.db
      .update(appConfig)
      .set({
        mode: input.mode,
        payload: { ads: input.ads },
        version: sql`${appConfig.version} + 1`,
        updatedAt: new Date()
      })
      .where(eq(appConfig.id, 1))
      .returning();

    if (!updated) throw new Error('Configuração do aplicativo não encontrada');
    return this.toState(updated);
  }

  private async findSingleton(): Promise<AppConfigRow | undefined> {
    const [row] = await this.database.db
      .select()
      .from(appConfig)
      .where(eq(appConfig.id, 1))
      .limit(1);

    return row;
  }

  private toState(row: AppConfigRow): AppConfigState {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const adsResult = AdConfigSchema.safeParse(payload.ads);

    if (!adsResult.success) {
      this.logger.warn('app_config.ads inválido; usando configuração segura padrão');
    }

    return {
      version: row.version,
      mode: row.mode === 2 ? 2 : 1,
      ads: adsResult.success ? adsResult.data : DEFAULT_AD_CONFIG,
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
