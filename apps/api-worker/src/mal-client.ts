import type { Context } from 'hono';

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const JIKAN_CACHE_ORIGIN = 'https://nekoanimes-jikan-cache.invalid';
const FALLBACK_MAL_IDS = [5114, 52991, 9253, 21, 269, 11061];

export type MalAnimeSummary = {
  malId: number;
  slug: string;
  title: string;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  synopsis: string | null;
  type: string;
  status: string;
  year: number | null;
  scoreBasisPoints: number | null;
  genres: string[];
  imageUrl: string | null;
  episodes: number | null;
};

export type MalGenre = { id: number; name: string; count: number };

type MalAnimePayload = {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[];
  synopsis?: string | null;
  type?: string | null;
  status?: string | null;
  year?: number | null;
  score?: number | null;
  episodes?: number | null;
  genres?: Array<{ name?: string | null }>;
  images?: { jpg?: { image_url?: string | null; large_image_url?: string | null } };
};

type MalEpisodesPayload = {
  mal_id: number;
  title?: string | null;
  episode: string;
  aired?: string | null;
};

export type MalEpisode = {
  number: number;
  title: string | null;
  airedAt: string | null;
};

type MalResponse<T> = {
  data: T;
  pagination?: {
    last_visible_page?: number;
    has_next_page?: boolean;
    items?: { count?: number; total?: number; per_page?: number };
  };
};

export class MalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'MalApiError';
  }
}

export async function fetchMalCatalog(c: Context, options: { query?: string; genreId?: number; limit: number; letter?: string }) {
  const params = new URLSearchParams({ limit: String(Math.min(options.limit, 25)), sfw: 'true' });
  if (options.query) {
    params.set('q', options.query);
    params.set('order_by', 'popularity');
    params.set('sort', 'asc');
  } else {
    params.set('filter', 'bypopularity');
  }
  if (options.genreId) params.set('genres', String(options.genreId));

  let items: MalAnimeSummary[];
  try {
    const response = await fetchJikan<MalAnimePayload[]>(c, `/anime?${params}`, 300);
    items = response.data.map(toMalSummary);
  } catch (error) {
    if (options.query || options.genreId || options.letter) throw error;
    const fallback = await Promise.allSettled(FALLBACK_MAL_IDS.slice(0, options.limit).map((malId) => fetchMalAnime(c, malId)));
    items = fallback.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    if (!items.length) throw error;
  }
  if (options.letter) {
    const normalized = options.letter.toLocaleLowerCase('pt-BR');
    items = items.filter((item) => item.title.toLocaleLowerCase('pt-BR').startsWith(normalized));
  }
  return { items, count: items.length };
}

export async function fetchMalAnime(c: Context, malId: number): Promise<MalAnimeSummary> {
  const response = await fetchJikan<MalAnimePayload>(c, `/anime/${malId}/full`, 3600);
  return toMalSummary(response.data);
}

export async function fetchMalGenres(c: Context): Promise<MalGenre[]> {
  const response = await fetchJikan<Array<{ mal_id: number; name: string; count?: number }>>(c, '/genres/anime', 86400);
  return response.data
    .filter((genre) => Number.isInteger(genre.mal_id) && genre.name.trim())
    .map((genre) => ({ id: genre.mal_id, name: genre.name.trim(), count: Number(genre.count ?? 0) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchMalEpisodes(c: Context, malId: number, page: number) {
  const response = await fetchJikan<MalEpisodesPayload[]>(c, `/anime/${malId}/episodes?page=${page}`, 900);
  const items = response.data
    .map((episode) => ({ number: Number(episode.episode), title: episode.title?.trim() || null, airedAt: episode.aired ?? null }))
    .filter((episode) => Number.isInteger(episode.number) && episode.number > 0);
  return {
    items,
    total: Number(response.pagination?.items?.total ?? items.length),
    hasNextPage: Boolean(response.pagination?.has_next_page)
  };
}

export function malSlug(malId: number) {
  return `mal-${malId}`;
}

export function malSeasonSlug(malId: number) {
  return `mal-${malId}-season-1`;
}

export function parseMalSeasonSlug(slug: string): number | null {
  const match = /^mal-(\d+)-season-1$/.exec(slug);
  if (!match) return null;
  const malId = Number(match[1]);
  return Number.isSafeInteger(malId) && malId > 0 ? malId : null;
}

export function parseMalSlug(slug: string): number | null {
  const match = /^mal-(\d+)$/.exec(slug);
  if (!match) return null;
  const malId = Number(match[1]);
  return Number.isSafeInteger(malId) && malId > 0 ? malId : null;
}

function toMalSummary(item: MalAnimePayload): MalAnimeSummary {
  const title = item.title?.trim() || `Anime MAL ${item.mal_id}`;
  return {
    malId: item.mal_id,
    slug: malSlug(item.mal_id),
    title,
    titleEnglish: item.title_english?.trim() || null,
    titleRomaji: item.title_synonyms?.[0]?.trim() || null,
    titleNative: item.title_japanese?.trim() || null,
    synopsis: item.synopsis?.trim() || null,
    type: normalizeType(item.type),
    status: normalizeStatus(item.status),
    year: Number.isInteger(item.year) ? item.year ?? null : null,
    scoreBasisPoints: typeof item.score === 'number' ? Math.round(item.score * 100) : null,
    genres: (item.genres ?? []).map((genre) => genre.name?.trim()).filter((name): name is string => Boolean(name)),
    imageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
    episodes: Number.isInteger(item.episodes) ? item.episodes ?? null : null
  };
}

async function fetchJikan<T>(c: Context, path: string, cacheSeconds: number): Promise<MalResponse<T>> {
  const upstreamUrl = `${JIKAN_BASE_URL}${path}`;
  const cacheKey = new Request(`${JIKAN_CACHE_ORIGIN}${path}`, { method: 'GET' });
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return await cached.json<MalResponse<T>>();

  const response = await fetch(upstreamUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new MalApiError(response.status, `MyAnimeList indisponível no momento (Jikan HTTP ${response.status})`);
  }

  const body = await response.text();
  const cachedResponse = new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${cacheSeconds}`
    }
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cachedResponse.clone()));
  return JSON.parse(body) as MalResponse<T>;
}

function normalizeType(value: string | null | undefined) {
  return value?.toLowerCase() || 'tv';
}

function normalizeStatus(value: string | null | undefined) {
  if (value === 'Finished Airing') return 'finished';
  if (value === 'Currently Airing') return 'releasing';
  if (value === 'Not yet aired') return 'upcoming';
  return 'unknown';
}
