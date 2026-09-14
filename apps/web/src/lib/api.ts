import { AppManifestSchema, sameAnimeTitle, type AppManifest } from '@neko/contracts';
import { getAccessToken, clearSession } from './auth';
import { API_URL } from './config';

const PROVIDER_IMAGE_HOSTS = new Set(['goyabu.io', 'animesonlinecc.to', 'animesdigital.org']);

export function providerImageProxyUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const image = new URL(value);
    if (image.protocol !== 'https:' || !PROVIDER_IMAGE_HOSTS.has(image.hostname)) return null;
    return `${API_URL}/v1/media/proxy?url=${encodeURIComponent(image.toString())}`;
  } catch {
    return null;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(30000);
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

async function authJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    signal: init.signal ?? AbortSignal.timeout(30000),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });
  if (response.status === 401) { if (getAccessToken() === token) clearSession(); throw new Error('AUTH_REQUIRED'); }
  if (!response.ok) throw await responseError(response);
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
export type LibraryItem = { animeId: string; slug: string; title: string; year: number | null; type?: string | null; genres: string[]; scoreBasisPoints?: number | null; status: string; imageUrl?: string | null; updatedAt: string };
export type ContinueWatchingItem = { animeId: string; slug: string; title: string; seasonNumber: number; episodeId: string; episodeNumber: number; episodeTitle: string | null; positionSeconds: number; durationSeconds: number; completed: boolean; type?: string | null; genres?: string[]; scoreBasisPoints?: number | null; imageUrl?: string | null; updatedAt: string };
export type SavedNewsItem = { id: string; slug: string; title: string; category: string; sourceName: string; publishedAt: string };
export type CatalogGenre = { id: number; name: string; count: number };

export type ServerCapabilities = { search: boolean; anime: boolean; episodes: boolean; playback: boolean };
export type ServerDescriptor = { id: string; name: string; baseUrl: string; capabilities: ServerCapabilities };
export type ProviderPostType = 'anime' | 'filme' | 'manga';
export type ServerAnimeMatch = { serverId: string; serverName: string; title: string; reference: string; url: string; confidence: number; postType: ProviderPostType; workSlug?: string; imageUrl?: string | null; scoreBasisPoints?: number | null; genres?: string[] };
export type ServerSearchProviderResult = { server: ServerDescriptor; status: 'ok' | 'unavailable' | 'timeout' | 'error'; matches: ServerAnimeMatch[]; error?: 'provider_unavailable' | 'provider_timeout' };
export type ServerSearchResponse = { query: string; servers: ServerSearchProviderResult[]; fetchedAt: string };
export type ServerPlaybackSource = { id: string; url: string; playbackUrl?: string; mimeType?: string; label: string; headers: Record<string, string>; isDefault: boolean; kind: 'direct' | 'embed' };
export type ServerEpisode = { id: string; title: string; number: number; seasonNumber: number; reference: string; url: string; releasedAt?: string; available: boolean; sources?: ServerPlaybackSource[] };
export type ServerSeason = { id: string; number: number; title: string; episodes: ServerEpisode[] };
export type ProviderIdentity = { canonicalId: string; canonicalTitle: string; malId: number | null; anilistId: number | null; postType: ProviderPostType; status?: string | null; synopsis: string | null; titleEnglish: string | null; titleRomaji: string | null; titleNative: string | null; year: number | null; genres: string[]; scoreBasisPoints: number | null; imageUrl: string | null; backdropUrl: string | null; source: 'myanimelist' | 'anilist' | 'mapping' | 'none' };
export type RemoteAnimeMetadata = Pick<ProviderIdentity, 'canonicalTitle' | 'malId' | 'anilistId' | 'postType' | 'synopsis' | 'titleEnglish' | 'titleRomaji' | 'titleNative' | 'year' | 'genres' | 'scoreBasisPoints' | 'imageUrl' | 'backdropUrl'>;
export type ServerAnimeDetail = { workSlug?: string; server: ServerDescriptor; anime: { title: string; reference: string; url: string; year?: number; imageUrl?: string | null }; seasons: ServerSeason[]; postType: ProviderPostType; identity?: ProviderIdentity; fetchedAt: string };
export type ServerResolution = { query: string; season: number; episode: number; servers: Array<{ server: ServerDescriptor; status: 'ok' | 'unavailable' | 'timeout' | 'error'; available: boolean; anime?: ServerAnimeMatch; episode?: ServerEpisode; sources?: ServerPlaybackSource[]; error?: 'provider_unavailable' | 'provider_timeout' }>; fetchedAt: string };
export type ServerProviderResolution = { query: string; season: number; episodeNumber: number; server: ServerDescriptor; anime: ServerAnimeMatch; episode: ServerEpisode; sources: ServerPlaybackSource[]; fetchedAt: string };
export type ProviderCatalogResponse = { server: ServerDescriptor; items: ServerAnimeMatch[]; count: number; page: number; pageSize: number; hasNextPage: boolean; source: 'provider'; fetchedAt: string };

export function fetchCatalog(params: { letter?: string; query?: string; genreId?: number; limit?: number } = {}) { const search = new URLSearchParams(); if (params.letter) search.set('letter', params.letter); if (params.query) search.set('q', params.query); if (params.genreId) search.set('genreId', String(params.genreId)); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<{ items: CatalogAnime[]; count: number; source?: string; degraded?: boolean }>(`/v1/catalog/anime${suffix}`); }
export function fetchGenres() { return getJson<{ items: CatalogGenre[]; source?: string }>('/v1/catalog/genres'); }
export function fetchAnime(slug: string) { return getJson<AnimeDetail>(`/v1/catalog/anime/${encodeURIComponent(slug)}`); }
export function fetchEpisodes(seasonId: string, offset = 0, limit = 10) { return getJson<{ season: AnimeSeason; items: Episode[]; offset: number; limit: number; total: number }>(`/v1/catalog/seasons/${encodeURIComponent(seasonId)}/episodes?offset=${offset}&limit=${limit}`); }
export function fetchNews(params: { query?: string; category?: string; limit?: number } = {}) { const search = new URLSearchParams(); if (params.query) search.set('q', params.query); if (params.category) search.set('category', params.category); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<{ items: NewsArticle[]; count: number }>(`/v1/news${suffix}`); }
export function fetchNewsArticle(slug: string) { return getJson<NewsArticle>(`/v1/news/${encodeURIComponent(slug)}`); }
export function fetchServers() { return getJson<{ servers: ServerDescriptor[] }>('/v1/servers'); }
export function fetchProviderCatalog(serverId: string, params: { letter?: string; query?: string; genre?: string; page?: number; limit?: number } = {}, signal?: AbortSignal) { const search = new URLSearchParams(); if (params.letter) search.set('letter', params.letter); if (params.query) search.set('q', params.query); if (params.genre) search.set('genre', params.genre); if (params.page) search.set('page', String(params.page)); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<ProviderCatalogResponse>(`/v1/servers/${encodeURIComponent(serverId)}/catalog${suffix}`,signal); }
export function fetchServerSearch(query: string) { return getJson<ServerSearchResponse>(`/v1/servers/search?q=${encodeURIComponent(query)}`); }
export function fetchServerAnime(serverId: string, reference: string) { const search = new URLSearchParams({ ref: reference }); return getJson<ServerAnimeDetail>(`/v1/servers/${encodeURIComponent(serverId)}/anime?${search}`); }
export async function fetchAniListMetadata(title: string): Promise<RemoteAnimeMetadata | null> {
  const query = `query($search:String){ Page(perPage:5){ media(search:$search,type:ANIME,sort:SEARCH_MATCH){ id idMal title { romaji english native } description format status seasonYear averageScore genres coverImage { large extraLarge } bannerImage } } }`;
  const searchTitles = [title];
  let media: Record<string, unknown> | undefined;
  for (const searchTitle of searchTitles) {
    const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { search: searchTitle } }), cache: 'force-cache' });
    if (!response.ok) throw new Error(`AniList respondeu ${response.status}`);
    const body = await response.json() as { data?: { Page?: { media?: Array<Record<string, unknown>> } } };
    const matches = body.data?.Page?.media?.filter(candidate => Object.values(candidate.title as Record<string, string> ?? {}).some(alias => alias && sameAnimeTitle(alias, title))) ?? [];
    media = matches.length === 1 ? matches[0] : undefined;
    if (media) break;
  }
  if (!media) return null;
  const titles = media.title as Record<string, unknown> | undefined;
  const cover = media.coverImage as Record<string, unknown> | undefined;
  const description = typeof media.description === 'string' ? media.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;
  const averageScore = typeof media.averageScore === 'number' ? media.averageScore : null;
  const format = typeof media.format === 'string' ? media.format : null;
  return {
    canonicalTitle: String(titles?.romaji ?? titles?.english ?? titles?.native ?? title),
    malId: typeof media.idMal === 'number' ? media.idMal : null,
    anilistId: typeof media.id === 'number' ? media.id : null,
    postType: format === 'MOVIE' ? 'filme' : 'anime',
    synopsis: description || null,
    titleEnglish: typeof titles?.english === 'string' ? titles.english : null,
    titleRomaji: typeof titles?.romaji === 'string' ? titles.romaji : null,
    titleNative: typeof titles?.native === 'string' ? titles.native : null,
    year: typeof media.seasonYear === 'number' ? media.seasonYear : null,
    genres: Array.isArray(media.genres) ? media.genres.map(String) : [],
    scoreBasisPoints: averageScore === null ? null : Math.round(averageScore * 10),
    imageUrl: typeof cover?.extraLarge === 'string' ? cover.extraLarge : typeof cover?.large === 'string' ? cover.large : null,
    backdropUrl: typeof media.bannerImage === 'string' ? media.bannerImage : null
  };
}
export function fetchServerResolution(query: string, season: number, episode: number) { return getJson<ServerResolution>(`/v1/servers/resolve/${encodeURIComponent(query)}/${season}/${episode}`); }
export function fetchServerProviderResolution(serverId: string, query: string, season: number, episode: number, animeReference?: string, episodeReference?: string) { const search = new URLSearchParams(); if (animeReference) search.set('ref', animeReference); if (episodeReference) search.set('episodeRef', episodeReference); const suffix = search.size ? `?${search}` : ''; return getJson<ServerProviderResolution>(`/v1/servers/${encodeURIComponent(serverId)}/resolve/${encodeURIComponent(query)}/${season}/${episode}${suffix}`); }
export type SaveProviderAnimeDataResponse = { ok: true; saved: true; anime: { id: string; slug: string; title: string; imageUrl: string | null; backdropUrl: string | null }; identity: RemoteAnimeMetadata; sources: { myanimelist: boolean; anilist: boolean; anidb: boolean }; savedAt: string };
export function saveProviderAnimeData(serverId: string, reference: string, metadata?: RemoteAnimeMetadata | null) { return authJson<SaveProviderAnimeDataResponse>('/v1/catalog/provider-data', { method: 'POST', body: JSON.stringify({ serverId, reference, metadata: metadata ?? undefined }) }); }

export function fetchMe() { return authJson<{ id: string; email: string | null }>('/v1/me'); }
export function fetchLibrary() { return authJson<LibraryItem[]>('/v1/me/library'); }
export function setLibraryItem(animeId: string, status = 'watchlist') { return authJson(`/v1/me/library/${encodeURIComponent(animeId)}`, { method: 'PUT', body: JSON.stringify({ status }) }); }
export function removeLibraryItem(animeId: string) { return authJson(`/v1/me/library/${encodeURIComponent(animeId)}`, { method: 'DELETE' }); }
export function fetchContinueWatching() { return authJson<ContinueWatchingItem[]>('/v1/me/continue-watching'); }
export function saveEpisodeProgress(episodeId: string, positionSeconds: number, durationSeconds: number) { return authJson(`/v1/me/progress/${encodeURIComponent(episodeId)}`, { method: 'PUT', body: JSON.stringify({ positionSeconds, durationSeconds }) }); }
export function fetchSavedNews() { return authJson<SavedNewsItem[]>('/v1/me/saved-news'); }
export function saveNewsForUser(articleId: string) { return authJson(`/v1/me/saved-news/${encodeURIComponent(articleId)}`, { method: 'PUT', body: '{}' }); }
export function removeSavedNewsForUser(articleId: string) { return authJson(`/v1/me/saved-news/${encodeURIComponent(articleId)}`, { method: 'DELETE' }); }

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return new Error(body?.message ?? `API respondeu ${response.status}`);
}
export type ProviderCategory = { id: string; name: string; reference: string };
export function fetchProviderCategories(serverId: string) { return getJson<{items:ProviderCategory[]}>(`/v1/servers/${encodeURIComponent(serverId)}/categories`); }
export function fetchSavedServerAnime(serverId: string, slug: string) { return getJson<ServerAnimeDetail>(`/v1/servers/${encodeURIComponent(serverId)}/anime?${new URLSearchParams({slug})}`); }
export function saveProviderLibrary(serverId: string, reference: string, workSlug?: string) { return authJson<{animeId:string;slug:string}>('/v1/me/provider-library',{method:'PUT',body:JSON.stringify({serverId,reference,workSlug})}); }
export function saveProviderProgress(data: {serverId:string;reference:string;workSlug?:string;episodeReference:string;seasonNumber:number;episodeNumber:number;positionSeconds:number;durationSeconds:number}) { return authJson<{animeId:string;slug:string;episodeId:string}>('/v1/me/provider-progress',{method:'PUT',body:JSON.stringify(data)}); }
