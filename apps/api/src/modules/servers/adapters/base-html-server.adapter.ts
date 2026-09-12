import { ServerAdapter } from '../contracts/server-adapter';
import {
  ServerAnimeDetail,
  ServerAnimeMatch,
  ServerDescriptor,
  ServerEpisode,
  ServerEpisodeDetail,
  ServerHealth,
  ServerSeason
} from '../contracts/server.types';
import { ServerHttpClient } from '../server-http.client';
import {
  HtmlAnchor,
  pageText,
  parseAnchors,
  parseEpisodeNumber,
  parseH1,
  parseSeasonNumber,
  parseYear,
  scoreTitleMatch,
  slugify
} from '../server-html';

interface EpisodeCandidate {
  episode: ServerEpisode;
  sourcePriority: number;
}

export abstract class BaseHtmlServerAdapter implements ServerAdapter {
  abstract readonly descriptor: ServerDescriptor;

  protected constructor(protected readonly http: ServerHttpClient) {}

  protected searchPath(query: string): string {
    return `/?s=${encodeURIComponent(query)}`;
  }

  protected cleanAnimeTitle(title: string): string {
    return title
      .replace(/^assistir\s+/i, '')
      .replace(/\s+(?:todos\s+os\s+epis[oó]dios|anime\s+completo).*$/i, '')
      .replace(/\s+-\s+[^-]+$/i, '')
      .trim();
  }

  protected isAnimeReference(reference: string): boolean {
    return reference.startsWith('/anime/');
  }

  protected isEpisodeReference(reference: string): boolean {
    return reference.includes('/episodio/');
  }

  protected isSeasonReference(reference: string): boolean {
    return reference.includes('/temporada/');
  }

  async searchAnime(query: string): Promise<ServerAnimeMatch[]> {
    const response = await this.http.getHtml(this.descriptor.baseUrl, this.searchPath(query));
    const matches = this.extractAnimeMatches(query, parseAnchors(response.html));
    if (matches.length > 0) return matches.slice(0, 10);

    const fallback = `/anime/${slugify(query)}`;
    try {
      const detail = await this.http.getHtml(this.descriptor.baseUrl, fallback);
      const title = this.cleanAnimeTitle(parseH1(detail.html) ?? query);
      const confidence = scoreTitleMatch(query, title);
      if (confidence < 0.45) return [];
      return [this.toAnimeMatch(title, detail.url, confidence)];
    } catch {
      return [];
    }
  }

  async getAnime(reference: string): Promise<ServerAnimeDetail> {
    const safeReference = this.assertReference(reference, 'anime');
    const response = await this.http.getHtml(this.descriptor.baseUrl, safeReference);
    const title = this.cleanAnimeTitle(parseH1(response.html) ?? safeReference.split('/').filter(Boolean).pop() ?? 'Anime');
    const anchors = parseAnchors(response.html);
    const candidates: EpisodeCandidate[] = this.extractEpisodeCandidates(anchors, 2);

    const seasonReferences = this.extractSeasonReferences(anchors).slice(0, 12);
    const seasonPages = await Promise.allSettled(
      seasonReferences.map(async ({ reference: seasonReference, number }) => {
        const seasonPage = await this.http.getHtml(this.descriptor.baseUrl, seasonReference);
        return this.extractEpisodeCandidates(parseAnchors(seasonPage.html), 3, number);
      })
    );

    for (const result of seasonPages) {
      if (result.status === 'fulfilled') candidates.push(...result.value);
    }

    const seasons = this.groupEpisodes(candidates.map((item) => item.episode));
    return {
      server: this.descriptor,
      anime: {
        title,
        reference: this.referenceFromUrl(response.url),
        url: response.url,
        year: parseYear(pageText(response.html))
      },
      seasons,
      fetchedAt: new Date().toISOString()
    };
  }

  async getEpisode(reference: string): Promise<ServerEpisodeDetail> {
    const safeReference = this.assertReference(reference, 'episode');
    const response = await this.http.getHtml(this.descriptor.baseUrl, safeReference);
    const title = parseH1(response.html) ?? 'Episódio';
    const number = parseEpisodeNumber(title, safeReference);
    if (!number) throw new Error('Episode number could not be identified');
    const seasonNumber = parseSeasonNumber(title, safeReference) ?? 1;

    return {
      server: this.descriptor,
      id: `${this.descriptor.id}:${seasonNumber}:${number}`,
      title,
      number,
      seasonNumber,
      reference: this.referenceFromUrl(response.url),
      url: response.url,
      available: true,
      playback: {
        available: false,
        sources: [],
        reason: 'not-configured'
      },
      fetchedAt: new Date().toISOString()
    };
  }

  async healthCheck(): Promise<ServerHealth> {
    const startedAt = Date.now();
    try {
      await this.http.getHtml(this.descriptor.baseUrl, '/', 5_000);
      return {
        server: this.descriptor,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
      };
    } catch {
      return {
        server: this.descriptor,
        status: 'unavailable',
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString()
      };
    }
  }

  private extractAnimeMatches(query: string, anchors: HtmlAnchor[]): ServerAnimeMatch[] {
    const deduped = new Map<string, ServerAnimeMatch>();

    for (const anchor of anchors) {
      const reference = this.referenceFromHref(anchor.href);
      if (!reference || !this.isAnimeReference(reference)) continue;
      const title = this.cleanAnimeTitle(anchor.text);
      if (!title || title.length < 2) continue;
      const confidence = scoreTitleMatch(query, title);
      if (confidence < 0.45) continue;

      const match = this.toAnimeMatch(title, new URL(reference, this.descriptor.baseUrl).toString(), confidence);
      const existing = deduped.get(reference);
      if (!existing || match.confidence > existing.confidence) deduped.set(reference, match);
    }

    return [...deduped.values()].sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
  }

  private toAnimeMatch(title: string, url: string, confidence: number): ServerAnimeMatch {
    return {
      serverId: this.descriptor.id,
      serverName: this.descriptor.name,
      title,
      reference: this.referenceFromUrl(url),
      url,
      confidence
    };
  }

  private extractEpisodeCandidates(anchors: HtmlAnchor[], sourcePriority: number, forcedSeason?: number): EpisodeCandidate[] {
    const candidates: EpisodeCandidate[] = [];

    for (const anchor of anchors) {
      const reference = this.referenceFromHref(anchor.href);
      if (!reference) continue;
      const episodeNumber = parseEpisodeNumber(anchor.text, reference);
      if (!episodeNumber) continue;
      if (!this.isEpisodeReference(reference) && !/epis[oó]dio/i.test(anchor.text)) continue;

      const seasonNumber = forcedSeason ?? parseSeasonNumber(anchor.text, reference) ?? 1;
      candidates.push({
        sourcePriority,
        episode: {
          id: `${this.descriptor.id}:${seasonNumber}:${episodeNumber}`,
          title: anchor.text || `Episódio ${episodeNumber}`,
          number: episodeNumber,
          seasonNumber,
          reference,
          url: new URL(reference, this.descriptor.baseUrl).toString(),
          available: true
        }
      });
    }

    return candidates;
  }

  private extractSeasonReferences(anchors: HtmlAnchor[]): Array<{ reference: string; number: number }> {
    const seen = new Set<string>();
    const result: Array<{ reference: string; number: number }> = [];

    for (const anchor of anchors) {
      const reference = this.referenceFromHref(anchor.href);
      if (!reference || !this.isSeasonReference(reference) || seen.has(reference)) continue;
      const number = parseSeasonNumber(anchor.text, reference) ?? 1;
      seen.add(reference);
      result.push({ reference, number });
    }

    return result.sort((a, b) => a.number - b.number);
  }

  private groupEpisodes(episodes: ServerEpisode[]): ServerSeason[] {
    const byKey = new Map<string, ServerEpisode>();
    for (const episode of episodes) {
      const key = `${episode.seasonNumber}:${episode.number}`;
      if (!byKey.has(key)) byKey.set(key, episode);
    }

    const seasons = new Map<number, ServerEpisode[]>();
    for (const episode of byKey.values()) {
      const current = seasons.get(episode.seasonNumber) ?? [];
      current.push(episode);
      seasons.set(episode.seasonNumber, current);
    }

    return [...seasons.entries()]
      .sort(([a], [b]) => a - b)
      .map(([number, seasonEpisodes]) => ({
        id: `${this.descriptor.id}:season:${number}`,
        number,
        title: `Temporada ${number}`,
        episodes: seasonEpisodes.sort((a, b) => a.number - b.number)
      }));
  }

  private assertReference(reference: string, kind: 'anime' | 'episode'): string {
    const normalized = this.referenceFromHref(reference);
    if (!normalized) throw new Error('Invalid provider reference');
    const allowed = kind === 'anime' ? this.isAnimeReference(normalized) : this.isEpisodeReference(normalized);
    if (!allowed) throw new Error(`Invalid ${kind} provider reference`);
    return normalized;
  }

  protected referenceFromHref(href: string): string | null {
    try {
      const base = new URL(this.descriptor.baseUrl);
      const url = new URL(href, base);
      if (url.protocol !== 'https:' || url.hostname !== base.hostname) return null;
      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }

  protected referenceFromUrl(url: string): string {
    const reference = this.referenceFromHref(url);
    if (!reference) throw new Error('Provider URL outside allowed origin');
    return reference;
  }
}
