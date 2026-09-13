import { AppManifestSchema, type AppManifest } from '@neko/contracts';
import { getAccessToken } from './auth';
import { API_URL } from './config';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`API respondeu ${response.status}`);
  return response.json() as Promise<T>;
}

async function authJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`API respondeu ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchManifest(): Promise<AppManifest> {
  return AppManifestSchema.parse(await getJson<unknown>('/v1/app-manifest'));
}

export type CatalogAnime = { id: string; slug: string; title: string; year: number | null; type: string; status: string; genres: string[]; scoreBasisPoints: number | null; imageUrl?: string | null };
export type AnimeSeason = { id: string; animeId: string; number: number; title: string | null; episodesCount: number };
export type Episode = { id: string; seasonId: string; number: number; title: string | null; durationSeconds: number | null; airedAt: string | null };
export type AnimeDetail = CatalogAnime & { titleEnglish: string | null; titleRomaji: string | null; titleNative: string | null; synopsis: string | null; externalIds: Array<{ provider: string; externalId: string }>; seasons: AnimeSeason[] };
export type NewsArticle = { id: string; slug: string; title: string; summary: string | null; category: string; sourceName: string; sourceUrl: string; imageUrl: string | null; imageAllowed: boolean; publishedAt: string };
export type LibraryItem = { animeId: string; slug: string; title: string; year: number | null; genres: string[]; status: string; updatedAt: string };
export type ContinueWatchingItem = { animeId: string; slug: string; title: string; seasonNumber: number; episodeId: string; episodeNumber: number; episodeTitle: string | null; positionSeconds: number; durationSeconds: number; completed: boolean; updatedAt: string };
export type SavedNewsItem = { id: string; slug: string; title: string; category: string; sourceName: string; publishedAt: string };
export type CatalogGenre = { id: number; name: string; count: number };

export type ServerCapabilities = { search: boolean; anime: boolean; episodes: boolean; playback: boolean };
export type ServerDescriptor = { id: string; name: string; baseUrl: string; capabilities: ServerCapabilities };
export type ServerAnimeMatch = { serverId: string; serverName: string; title: string; reference: string; url: string; confidence: number };
export type ServerSearchProviderResult = { server: ServerDescriptor; status: 'ok' | 'unavailable' | 'timeout' | 'error'; matches: ServerAnimeMatch[]; error?: 'provider_unavailable' | 'provider_timeout' };
export type ServerSearchResponse = { query: string; servers: ServerSearchProviderResult[]; fetchedAt: string };
export type ServerPlaybackSource = { id: string; url: string; playbackUrl?: string; mimeType?: string; label: string; headers: Record<string, string>; isDefault: boolean; kind: 'direct' | 'embed' };
export type ServerEpisode = { id: string; title: string; number: number; seasonNumber: number; reference: string; url: string; releasedAt?: string; available: boolean; sources?: ServerPlaybackSource[] };
export type ServerSeason = { id: string; number: number; title: string; episodes: ServerEpisode[] };
export type ServerAnimeDetail = { server: ServerDescriptor; anime: { title: string; reference: string; url: string; year?: number }; seasons: ServerSeason[]; fetchedAt: string };
export type ServerResolution = { query: string; season: number; episode: number; servers: Array<{ server: ServerDescriptor; status: 'ok' | 'unavailable' | 'timeout' | 'error'; available: boolean; anime?: ServerAnimeMatch; episode?: ServerEpisode; sources?: ServerPlaybackSource[]; error?: 'provider_unavailable' | 'provider_timeout' }>; fetchedAt: string };
export type ServerProviderResolution = { query: string; season: number; episodeNumber: number; server: ServerDescriptor; anime: ServerAnimeMatch; episode: ServerEpisode; sources: ServerPlaybackSource[]; fetchedAt: string };

export function fetchCatalog(params: { letter?: string; query?: string; genreId?: number; limit?: number } = {}) { const search = new URLSearchParams(); if (params.letter) search.set('letter', params.letter); if (params.query) search.set('q', params.query); if (params.genreId) search.set('genreId', String(params.genreId)); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<{ items: CatalogAnime[]; count: number; source?: string; degraded?: boolean }>(`/v1/catalog/anime${suffix}`); }
export function fetchGenres() { return getJson<{ items: CatalogGenre[]; source?: string }>('/v1/catalog/genres'); }
export function fetchAnime(slug: string) { return getJson<AnimeDetail>(`/v1/catalog/anime/${encodeURIComponent(slug)}`); }
export function fetchEpisodes(seasonId: string, offset = 0, limit = 10) { return getJson<{ season: AnimeSeason; items: Episode[]; offset: number; limit: number; total: number }>(`/v1/catalog/seasons/${encodeURIComponent(seasonId)}/episodes?offset=${offset}&limit=${limit}`); }
export function fetchNews(params: { query?: string; category?: string; limit?: number } = {}) { const search = new URLSearchParams(); if (params.query) search.set('q', params.query); if (params.category) search.set('category', params.category); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<{ items: NewsArticle[]; count: number }>(`/v1/news${suffix}`); }
export function fetchNewsArticle(slug: string) { return getJson<NewsArticle>(`/v1/news/${encodeURIComponent(slug)}`); }
export function fetchServerSearch(query: string) { return getJson<ServerSearchResponse>(`/v1/servers/search?q=${encodeURIComponent(query)}`); }
export function fetchServerAnime(serverId: string, reference: string) { const search = new URLSearchParams({ ref: reference }); return getJson<ServerAnimeDetail>(`/v1/servers/${encodeURIComponent(serverId)}/anime?${search}`); }
export function fetchServerResolution(query: string, season: number, episode: number) { return getJson<ServerResolution>(`/v1/servers/resolve/${encodeURIComponent(query)}/${season}/${episode}`); }
export function fetchServerProviderResolution(serverId: string, query: string, season: number, episode: number, reference?: string) { const suffix = reference ? `?ref=${encodeURIComponent(reference)}` : ''; return getJson<ServerProviderResolution>(`/v1/servers/${encodeURIComponent(serverId)}/resolve/${encodeURIComponent(query)}/${season}/${episode}${suffix}`); }

export function fetchMe() { return authJson<{ id: string; email: string | null }>('/v1/me'); }
export function fetchLibrary() { return authJson<LibraryItem[]>('/v1/me/library'); }
export function setLibraryItem(animeId: string, status = 'watchlist') { return authJson(`/v1/me/library/${encodeURIComponent(animeId)}`, { method: 'PUT', body: JSON.stringify({ status }) }); }
export function removeLibraryItem(animeId: string) { return authJson(`/v1/me/library/${encodeURIComponent(animeId)}`, { method: 'DELETE' }); }
export function fetchContinueWatching() { return authJson<ContinueWatchingItem[]>('/v1/me/continue-watching'); }
export function saveEpisodeProgress(episodeId: string, positionSeconds: number, durationSeconds: number) { return authJson(`/v1/me/progress/${encodeURIComponent(episodeId)}`, { method: 'PUT', body: JSON.stringify({ positionSeconds, durationSeconds }) }); }
export function fetchSavedNews() { return authJson<SavedNewsItem[]>('/v1/me/saved-news'); }
export function saveNewsForUser(articleId: string) { return authJson(`/v1/me/saved-news/${encodeURIComponent(articleId)}`, { method: 'PUT', body: '{}' }); }
export function removeSavedNewsForUser(articleId: string) { return authJson(`/v1/me/saved-news/${encodeURIComponent(articleId)}`, { method: 'DELETE' }); }
