import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { AppConfigRepository } from './app-config.repository';
import { type AppConfigUpdate } from './app-config.types';

const MANIFEST_CACHE_KEY = 'neko:app-manifest:v1';
const MANIFEST_CACHE_TTL_SECONDS = 30;

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    private readonly repository: AppConfigRepository,
    private readonly redis: RedisService,
    private readonly config: ConfigService
  ) {}

  async getSettings() { return this.repository.get(); }

  async updateSettings(input: AppConfigUpdate) {
    const updated = await this.repository.update(input);
    await this.invalidateManifestCache();
    return updated;
  }

  async getManifest() {
    try {
      const cached = await this.redis.getJson<Record<string, unknown>>(MANIFEST_CACHE_KEY);
      if (cached) return cached;
    } catch (error) {
      this.logger.debug(`Cache do manifest indisponível: ${this.message(error)}`);
    }

    const settings = await this.repository.get();
    const manifest = this.buildManifest(settings);
    try { await this.redis.setJson(MANIFEST_CACHE_KEY, manifest, MANIFEST_CACHE_TTL_SECONDS); }
    catch (error) { this.logger.debug(`Não foi possível gravar cache do manifest: ${this.message(error)}`); }
    return manifest;
  }

  private buildManifest(settings: Awaited<ReturnType<AppConfigRepository['get']>>) {
    const account = { id: 'account', label: 'Conta', icon: 'account', route: '/conta' };
    const modeOneNavigation = [
      { id: 'home', label: 'Início', icon: 'home', route: '/' },
      { id: 'catalog', label: 'A–Z', icon: 'catalog', route: '/catalogo' },
      { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' },
      { id: 'library', label: 'Lista', icon: 'library', route: '/lista' },
      account
    ];
    const modeTwoNavigation = [
      { id: 'home', label: 'Início', icon: 'home', route: '/' },
      { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' },
      { id: 'saved', label: 'Salvos', icon: 'bookmark', route: '/salvos' },
      account
    ];

    return {
      schemaVersion: 1 as const,
      configVersion: settings.version,
      mode: settings.mode,
      webAppUrl: this.config.getOrThrow<string>('WEB_APP_URL'),
      navigation: settings.mode === 2 ? modeTwoNavigation : modeOneNavigation,
      features: {
        player: settings.mode === 1,
        downloads: false,
        notifications: true,
        news: settings.mode === 2
      },
      ads: settings.ads
    };
  }

  private async invalidateManifestCache() {
    try { await this.redis.del(MANIFEST_CACHE_KEY); }
    catch (error) { this.logger.debug(`Não foi possível invalidar cache do manifest: ${this.message(error)}`); }
  }

  private message(error: unknown) { return error instanceof Error ? error.message : String(error); }
}
