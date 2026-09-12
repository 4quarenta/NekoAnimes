import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ServerAnimeDetail,
  ServerEpisodeDetail,
  ServerEpisodeResolution,
  ServerHealth,
  ServerSearchProviderResult,
  ServerSearchResponse
} from './contracts/server.types';
import { normalizeForMatch } from './server-html';
import { ServerRegistry } from './server-registry';
import { ServersCacheService } from './servers-cache.service';

@Injectable()
export class ServersService {
  constructor(
    private readonly registry: ServerRegistry,
    private readonly cache: ServersCacheService
  ) {}

  listServers() {
    return {
      servers: this.registry.list().map((adapter) => adapter.descriptor)
    };
  }

  async health(): Promise<{ servers: ServerHealth[]; checkedAt: string }> {
    const servers = await Promise.all(this.registry.list().map((adapter) => adapter.healthCheck()));
    return { servers, checkedAt: new Date().toISOString() };
  }

  async search(query: string): Promise<ServerSearchResponse> {
    const cacheKey = `servers:v1:search:${normalizeForMatch(query)}`;
    const cached = await this.cache.get<ServerSearchResponse>(cacheKey);
    if (cached) return cached;

    const results = await Promise.all(
      this.registry.list().map(async (adapter): Promise<ServerSearchProviderResult> => {
        try {
          const matches = await adapter.searchAnime(query);
          return {
            server: adapter.descriptor,
            status: matches.length > 0 ? 'ok' : 'unavailable',
            matches
          };
        } catch (error) {
          const timeout = this.isTimeout(error);
          return {
            server: adapter.descriptor,
            status: timeout ? 'timeout' : 'error',
            matches: [],
            error: timeout ? 'provider_timeout' : 'provider_unavailable'
          };
        }
      })
    );

    const response: ServerSearchResponse = {
      query,
      servers: results,
      fetchedAt: new Date().toISOString()
    };
    await this.cache.set(cacheKey, response, 15 * 60);
    return response;
  }

  async getAnime(serverId: string, reference: string): Promise<ServerAnimeDetail> {
    const adapter = this.getAdapter(serverId);
    const cacheKey = `servers:v1:anime:${serverId}:${this.cachePart(reference)}`;
    const cached = await this.cache.get<ServerAnimeDetail>(cacheKey);
    if (cached) return cached;

    const detail = await adapter.getAnime(reference);
    await this.cache.set(cacheKey, detail, 30 * 60);
    return detail;
  }

  async getEpisode(serverId: string, reference: string): Promise<ServerEpisodeDetail> {
    const adapter = this.getAdapter(serverId);
    const cacheKey = `servers:v1:episode:${serverId}:${this.cachePart(reference)}`;
    const cached = await this.cache.get<ServerEpisodeDetail>(cacheKey);
    if (cached) return cached;

    const detail = await adapter.getEpisode(reference);
    await this.cache.set(cacheKey, detail, 20 * 60);
    return detail;
  }

  async resolveEpisode(query: string, season: number, episode: number): Promise<ServerEpisodeResolution> {
    const cacheKey = `servers:v1:resolve:${normalizeForMatch(query)}:${season}:${episode}`;
    const cached = await this.cache.get<ServerEpisodeResolution>(cacheKey);
    if (cached) return cached;

    const search = await this.search(query);
    const results = await Promise.all(
      search.servers.map(async (providerResult) => {
        const best = providerResult.matches[0];
        if (!best || providerResult.status !== 'ok') {
          return {
            server: providerResult.server,
            status: providerResult.status,
            available: false,
            error: providerResult.error
          };
        }

        try {
          const detail = await this.getAnime(providerResult.server.id, best.reference);
          const targetSeason = detail.seasons.find((item) => item.number === season);
          const targetEpisode = targetSeason?.episodes.find((item) => item.number === episode);
          return {
            server: providerResult.server,
            status: 'ok' as const,
            available: Boolean(targetEpisode),
            anime: best,
            episode: targetEpisode
          };
        } catch (error) {
          const timeout = this.isTimeout(error);
          return {
            server: providerResult.server,
            status: timeout ? ('timeout' as const) : ('error' as const),
            available: false,
            anime: best,
            error: timeout ? ('provider_timeout' as const) : ('provider_unavailable' as const)
          };
        }
      })
    );

    const response: ServerEpisodeResolution = {
      query,
      season,
      episode,
      servers: results,
      fetchedAt: new Date().toISOString()
    };
    await this.cache.set(cacheKey, response, 10 * 60);
    return response;
  }

  private getAdapter(serverId: string) {
    const adapter = this.registry.get(serverId);
    if (!adapter) throw new NotFoundException('Servidor não encontrado');
    return adapter;
  }

  private cachePart(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url').slice(0, 512);
  }

  private isTimeout(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.name === 'TimeoutError' || error.name === 'AbortError' || /timeout/i.test(error.message);
  }
}
