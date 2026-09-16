import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { appConfig, type AppConfigRow } from '../../database/schema';
import { type AppConfigState, type AppConfigUpdate } from './app-config.types';

@Injectable()
export class AppConfigRepository {
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
          payload: {}
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
        payload: {},
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
    return {
      version: row.version,
      mode: row.mode === 2 ? 2 : 1,
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
