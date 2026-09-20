import { AppManifestSchema, normalizeAnimeTitle, sameAnimeTitle, type AppManifest, type ProviderRecovery, type ReleaseLabel } from '@neko/contracts';
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

async function publicJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: 'no-store', signal: init.signal ?? AbortSignal.timeout(30000) });
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

type AndroidUpdate = {
  platform: 'android';
  channel: string;
  updateMode: 'direct' | 'play_store';
  versionCode: number;
  versionName: string;
  apkUrl: string;
  sha256: string;
  storeUrl: string;
  required: boolean;
};

export function fetchAndroidUpdate() {
  return publicJson<AndroidUpdate>('/v1/app-update/android');
}

type CatalogAnime = { id: string; slug: string; title: string; year: number | null; type: string; status: string; genres: string[]; scoreBasisPoints: number | null; imageUrl?: string | null; releaseLabel?: ReleaseLabel | null };
type AnimeSeason = { id: string; animeId: string; number: number; title: string | null; episodesCount: number };
export type Episode = { id: string; seasonId: string; number: number; title: string | null; durationSeconds: number | null; airedAt: string | null };
export type AnimeDetail = CatalogAnime & { titleEnglish: string | null; titleRomaji: string | null; titleNative: string | null; synopsis: string | null; externalIds: Array<{ provider: string; externalId: string }>; seasons: AnimeSeason[] };
type NewsArticle = { id: string; slug: string; title: string; summary: string | null; category: string; sourceName: string; sourceUrl: string; imageUrl: string | null; imageAllowed: boolean; publishedAt: string };

type ServerCapabilities = { search: boolean; anime: boolean; episodes: boolean; playback: boolean };
type ServerDescriptor = { id: string; name: string; baseUrl: string; capabilities: ServerCapabilities };
type ProviderPostType = 'anime' | 'filme' | 'manga';
export type ServerAnimeMatch = { serverId: string; serverName: string; title: string; reference: string; url: string; confidence: number; postType: ProviderPostType; workSlug?: string; imageUrl?: string | null; scoreBasisPoints?: number | null; genres?: string[]; releaseLabel?: ReleaseLabel | null };
type ServerPlaybackSource = { id: string; url: string; playbackUrl?: string; mimeType?: string; label: string; headers: Record<string, string>; isDefault: boolean; kind: 'direct' | 'embed' };
export type ServerEpisode = { id: string; title: string; number: number; seasonNumber: number; reference: string; url: string; releasedAt?: string; available: boolean; sources?: ServerPlaybackSource[] };
type ServerSeason = { id: string; number: number; title: string; episodes: ServerEpisode[] };
type ProviderIdentity = { canonicalId: string; canonicalTitle: string; malId: number | null; anilistId: number | null; postType: ProviderPostType; status?: string | null; synopsis: string | null; titleEnglish: string | null; titleRomaji: string | null; titleNative: string | null; year: number | null; genres: string[]; scoreBasisPoints: number | null; imageUrl: string | null; backdropUrl: string | null; source: 'myanimelist' | 'anilist' | 'mapping' | 'none' };
export type RemoteAnimeMetadata = Pick<ProviderIdentity, 'canonicalTitle' | 'malId' | 'anilistId' | 'postType' | 'synopsis' | 'titleEnglish' | 'titleRomaji' | 'titleNative' | 'year' | 'genres' | 'scoreBasisPoints' | 'imageUrl' | 'backdropUrl'>;
type ServerAnimeDetail = { workSlug?: string; server: ServerDescriptor; anime: { title: string; reference: string; url: string; year?: number; imageUrl?: string | null; releaseLabel?: ReleaseLabel | null }; seasons: ServerSeason[]; postType: ProviderPostType; identity?: ProviderIdentity; fetchedAt: string };
type ServerProviderResolution = { query: string; season: number; episodeNumber: number; server: ServerDescriptor; anime: ServerAnimeMatch; episode: ServerEpisode; sources: ServerPlaybackSource[]; fetchedAt: string };
export type ProviderCatalogResponse = { server: ServerDescriptor; items: ServerAnimeMatch[]; count: number; page: number; pageSize: number; hasNextPage: boolean; source: 'provider'; fetchedAt: string };

export function fetchAnime(slug: string) { return getJson<AnimeDetail>(`/v1/catalog/anime/${encodeURIComponent(slug)}`); }
export function fetchEpisodes(seasonId: string, offset = 0, limit = 10) { return getJson<{ season: AnimeSeason; items: Episode[]; offset: number; limit: number; total: number }>(`/v1/catalog/seasons/${encodeURIComponent(seasonId)}/episodes?offset=${offset}&limit=${limit}`); }
export function fetchNews(params: { query?: string; category?: string; limit?: number } = {}) { const search = new URLSearchParams(); if (params.query) search.set('q', params.query); if (params.category) search.set('category', params.category); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<{ items: NewsArticle[]; count: number }>(`/v1/news${suffix}`); }
export function fetchNewsArticle(slug: string) { return getJson<NewsArticle>(`/v1/news/${encodeURIComponent(slug)}`); }
export function fetchServers() { return getJson<{ servers: ServerDescriptor[] }>('/v1/servers'); }
type ServerHealth = { server: ServerDescriptor; status: 'ok' | 'unavailable'; latencyMs: number; checkedAt: string };
export function fetchServerHealth() { return getJson<{ servers: ServerHealth[]; checkedAt: string }>('/v1/servers/health'); }
export function fetchProviderCatalog(serverId: string, params: { letter?: string; query?: string; genre?: string; page?: number; limit?: number } = {}, signal?: AbortSignal) { const search = new URLSearchParams(); if (params.letter) search.set('letter', params.letter); if (params.query) search.set('q', params.query); if (params.genre) search.set('genre', params.genre); if (params.page) search.set('page', String(params.page)); if (params.limit) search.set('limit', String(params.limit)); const suffix = search.size ? `?${search}` : ''; return getJson<ProviderCatalogResponse>(`/v1/servers/${encodeURIComponent(serverId)}/catalog${suffix}`,signal); }
export function fetchServerAnime(serverId: string, reference: string) { const search = new URLSearchParams({ ref: reference }); return getJson<ServerAnimeDetail>(`/v1/servers/${encodeURIComponent(serverId)}/anime?${search}`); }
export async function fetchAniListMetadata(title: string): Promise<RemoteAnimeMetadata | null> {
  const query = `query($search:String){ Page(perPage:5){ media(search:$search,type:ANIME,sort:SEARCH_MATCH){ id idMal title { romaji english native } description format status seasonYear averageScore genres coverImage { large extraLarge } bannerImage } } }`;
  // Provider labels ("Dublado", "Legendado", etc.) are release variants and
  // must not narrow the external database search.
  const searchTitles = [normalizeAnimeTitle(title)];
  let media: Record<string, unknown> | undefined;
  for (const searchTitle of searchTitles) {
    const response = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { search: searchTitle } }), cache: 'force-cache', signal: AbortSignal.timeout(30000) });
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
export function fetchServerProviderResolution(serverId: string, query: string, season: number, episode: number, animeReference?: string, episodeReference?: string) { const search = new URLSearchParams(); if (animeReference) search.set('ref', animeReference); if (episodeReference) search.set('episodeRef', episodeReference); const suffix = search.size ? `?${search}` : ''; return getJson<ServerProviderResolution>(`/v1/servers/${encodeURIComponent(serverId)}/resolve/${encodeURIComponent(query)}/${season}/${episode}${suffix}`); }
type SaveProviderAnimeDataResponse = { ok: true; saved: true; anime: { id: string; slug: string; title: string; imageUrl: string | null; backdropUrl: string | null }; identity: RemoteAnimeMetadata; sources: { myanimelist: boolean; anilist: boolean; anidb: boolean }; savedAt: string };
export function saveProviderAnimeData(serverId: string, reference: string, metadata?: RemoteAnimeMetadata | null) { return authJson<SaveProviderAnimeDataResponse>('/v1/catalog/provider-data', { method: 'POST', body: JSON.stringify({ serverId, reference, metadata: metadata ?? undefined }) }); }

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return new Error(body?.message ?? `API respondeu ${response.status}`);
}
type ProviderCategory = { id: string; name: string; reference: string };
export function fetchProviderCategories(serverId: string) { return getJson<{items:ProviderCategory[]}>(`/v1/servers/${encodeURIComponent(serverId)}/categories`); }
export function fetchSavedServerAnime(serverId: string, slug: string) { return getJson<ServerAnimeDetail>(`/v1/servers/${encodeURIComponent(serverId)}/anime?${new URLSearchParams({slug})}`); }
export function fetchProviderRecovery(serverId: string, slug: string, signal?: AbortSignal) { return getJson<ProviderRecovery>(`/v1/servers/${encodeURIComponent(serverId)}/recovery?${new URLSearchParams({slug})}`, signal); }
export function confirmProviderMatch(workSlug: string, serverId: string, reference: string, expectedTitle: string) {
  return authJson<ServerAnimeDetail>('/v1/me/provider-links', { method: 'POST', body: JSON.stringify({ workSlug, serverId, reference, expectedTitle, confirmed: true }) });
}
export function submitReport(data: { category: 'bug' | 'playback' | 'account' | 'content' | 'other'; message: string; email?: string; route?: string; appVersion?: string }) { return publicJson<{ ok: true }>('/v1/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }); }
