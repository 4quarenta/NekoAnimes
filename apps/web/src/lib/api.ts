import { AppManifestSchema, type AppManifest } from '@neko/contracts';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`API respondeu ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchManifest(): Promise<AppManifest> {
  return AppManifestSchema.parse(await getJson<unknown>('/v1/app-manifest'));
}

export type CatalogAnime = { id: string; slug: string; title: string; year: number | null; type: string; status: string; genres: string[]; scoreBasisPoints: number | null };
export type AnimeSeason = { id: string; animeId: string; number: number; title: string | null; episodesCount: number };
export type Episode = { id: string; seasonId: string; number: number; title: string | null; durationSeconds: number | null; airedAt: string | null };
export type AnimeDetail = CatalogAnime & { titleEnglish: string | null; titleRomaji: string | null; titleNative: string | null; synopsis: string | null; externalIds: Array<{ provider: string; externalId: string }>; seasons: AnimeSeason[] };

export type NewsArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  sourceName: string;
  sourceUrl: string;
  imageUrl: string | null;
  imageAllowed: boolean;
  publishedAt: string;
};

export function fetchCatalog(params: { letter?: string; query?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.letter) search.set('letter', params.letter);
  if (params.query) search.set('q', params.query);
  if (params.limit) search.set('limit', String(params.limit));
  const suffix = search.size ? `?${search}` : '';
  return getJson<{ items: CatalogAnime[]; count: number }>(`/v1/catalog/anime${suffix}`);
}

export function fetchAnime(slug: string) { return getJson<AnimeDetail>(`/v1/catalog/anime/${encodeURIComponent(slug)}`); }
export function fetchEpisodes(seasonId: string, offset = 0, limit = 10) {
  return getJson<{ season: AnimeSeason; items: Episode[]; offset: number; limit: number; total: number }>(`/v1/catalog/seasons/${encodeURIComponent(seasonId)}/episodes?offset=${offset}&limit=${limit}`);
}

export function fetchNews(params: { query?: string; category?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.query) search.set('q', params.query);
  if (params.category) search.set('category', params.category);
  if (params.limit) search.set('limit', String(params.limit));
  const suffix = search.size ? `?${search}` : '';
  return getJson<{ items: NewsArticle[]; count: number }>(`/v1/news${suffix}`);
}

export function fetchNewsArticle(slug: string) {
  return getJson<NewsArticle>(`/v1/news/${encodeURIComponent(slug)}`);
}
