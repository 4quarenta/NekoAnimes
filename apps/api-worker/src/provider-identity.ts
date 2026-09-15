import type { Context } from 'hono';
import mappings from '../data/provider-mappings.json';
import { fetchMalAnime, fetchMalCatalog, type MalAnimeSummary } from './mal-client';
import { readStoredIdentity } from './catalog-store';

export type ProviderPostType = 'anime' | 'filme' | 'manga';

export type ProviderMetadata = {
  canonicalId: string;
  canonicalTitle: string;
  malId: number | null;
  anilistId: number | null;
  postType: ProviderPostType;
  status: string | null;
  synopsis: string | null;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  year: number | null;
  genres: string[];
  scoreBasisPoints: number | null;
  imageUrl: string | null;
  backdropUrl: string | null;
  source: 'myanimelist' | 'anilist' | 'mapping' | 'none';
};

export type LoadedProviderMetadata = Partial<Omit<ProviderMetadata, 'canonicalId' | 'source'>>;

type MappingEntry = {
  canonicalId?: string;
  canonicalTitle: string;
  malId: number | null;
  anilistId: number | null;
  providers: Array<{ id: string; animeReference: string }>;
  backdropUrl?: string | null;
};

type AniListAnimeSummary = {
  id: number;
  malId: number | null;
  title: string;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  synopsis: string | null;
  format: string | null;
  status: string | null;
  year: number | null;
  scoreBasisPoints: number | null;
  genres: string[];
  imageUrl: string | null;
  bannerImage: string | null;
};

const entries = (mappings.entries as MappingEntry[]) ?? [];
const ANILIST_URL = 'https://graphql.anilist.co';
const ANILIST_CACHE_ORIGIN = 'https://nekoanimes-anilist-cache.invalid';

export function parseLoadedProviderMetadata(value: unknown): LoadedProviderMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number) => typeof input[key] === 'string' && input[key].trim().length <= max ? input[key].trim() : undefined;
  const url = (key: string) => {
    const value = text(key, 2048);
    try { return value && new URL(value).protocol === 'https:' ? value : undefined; } catch { return undefined; }
  };
  const id = (key: string) => typeof input[key] === 'number' && Number.isInteger(input[key]) && input[key] > 0 && input[key] <= 100_000_000 ? input[key] : undefined;
  const year = typeof input.year === 'number' && Number.isInteger(input.year) && input.year >= 1900 && input.year <= 3000 ? input.year : undefined;
  const score = typeof input.scoreBasisPoints === 'number' && Number.isInteger(input.scoreBasisPoints) && input.scoreBasisPoints >= 0 && input.scoreBasisPoints <= 1000 ? input.scoreBasisPoints : undefined;
  const genres = Array.isArray(input.genres) ? input.genres.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.trim().length <= 80).map(item => item.trim()).slice(0, 40) : undefined;
  const postType = input.postType === 'anime' || input.postType === 'filme' || input.postType === 'manga' ? input.postType : undefined;
  return {
    ...(text('canonicalTitle', 256) ? { canonicalTitle: text('canonicalTitle', 256) } : {}),
    ...(id('malId') ? { malId: id('malId') } : {}),
    ...(id('anilistId') ? { anilistId: id('anilistId') } : {}),
    ...(postType ? { postType } : {}),
    ...(text('status', 80) ? { status: text('status', 80) } : {}),
    ...(text('synopsis', 20_000) ? { synopsis: text('synopsis', 20_000) } : {}),
    ...(text('titleEnglish', 256) ? { titleEnglish: text('titleEnglish', 256) } : {}),
    ...(text('titleRomaji', 256) ? { titleRomaji: text('titleRomaji', 256) } : {}),
    ...(text('titleNative', 256) ? { titleNative: text('titleNative', 256) } : {}),
    ...(year !== undefined ? { year } : {}),
    ...(genres?.length ? { genres } : {}),
    ...(score !== undefined ? { scoreBasisPoints: score } : {}),
    ...(url('imageUrl') ? { imageUrl: url('imageUrl') } : {}),
    ...(url('backdropUrl') ? { backdropUrl: url('backdropUrl') } : {})
  };
}

export function mergeLoadedMetadata(base: ProviderMetadata, extra: LoadedProviderMetadata): ProviderMetadata {
  const next = { ...base };
  for (const key of ['canonicalTitle', 'malId', 'anilistId', 'postType', 'status', 'synopsis', 'titleEnglish', 'titleRomaji', 'titleNative', 'year', 'scoreBasisPoints', 'imageUrl', 'backdropUrl'] as const) {
    const value = extra[key];
    if (value !== undefined && value !== null && value !== '') next[key] = value as never;
  }
  if (extra.genres?.length) next.genres = extra.genres;
  return next;
}

export async function resolveProviderIdentity(
  c: Context,
  input: { serverId: string; reference: string; title: string; fallbackPostType: ProviderPostType; refresh?: boolean }
): Promise<ProviderMetadata> {
  const stored = await readStoredIdentity(c.env.DB, input.serverId, input.reference);
  if (stored && !input.refresh) return stored;
  const mapping = entries.find((entry) => entry.providers.some((provider) => provider.id === input.serverId && normalizeReference(provider.animeReference) === normalizeReference(input.reference)))
    ?? entries.find((entry) => sameTitle(entry.canonicalTitle, input.title));
  let mal: MalAnimeSummary | null = null;
  const malId = mapping?.malId ?? null;

  try {
    if (malId) {
      mal = await fetchMalAnime(c, malId);
    } else {
      const candidates = await fetchMalCatalog(c, { query: input.title, limit: 5, letter: undefined });
      mal = candidates.items.find((candidate) => sameTitle(candidate.title, input.title) || sameTitle(candidate.titleEnglish, input.title) || sameTitle(candidate.titleRomaji, input.title)) ?? null;
    }
  } catch {
    // Provider detail remains usable when MAL/Jikan is unavailable.
  }

  if (!mal && mapping?.malId) {
    try { mal = await fetchMalAnime(c, mapping.malId); } catch { /* AniList fallback below */ }
  }

  let anilistId = mapping?.anilistId ?? null;
  let backdropUrl: string | null = mapping?.backdropUrl ?? null;
  let anilist: AniListAnimeSummary | null = null;
  if (mal?.malId) {
    try {
      anilist = await fetchAniListByMalId(c, mal.malId);
      anilistId = anilist?.id ?? anilistId;
      backdropUrl = anilist?.bannerImage ?? backdropUrl;
    } catch {
      // AniList is enrichment only and must not block playback.
    }
  }
  if (!mal && !anilist) {
    try {
      anilist = await fetchAniListByTitle(c, input.title);
      anilistId = anilist?.id ?? anilistId;
      backdropUrl = anilist?.bannerImage ?? backdropUrl;
    } catch {
      // Title metadata is enrichment only and must not block playback.
    }
  }
  if (!backdropUrl && anilistId) {
    try {
      anilist = anilist ?? await fetchAniListById(c, anilistId);
      backdropUrl = anilist?.bannerImage ?? null;
    } catch { /* enrichment only */ }
  }

  const postType = mal ? malType(mal.type) : anilist ? anilistType(anilist.format) : input.fallbackPostType;
  const metadata = mal ?? anilist;
  const result: ProviderMetadata = {
    canonicalId: mapping?.canonicalId ?? (mal ? `mal:${mal.malId}` : anilist?.malId ? `mal:${anilist.malId}` : anilist?.id ? `anilist:${anilist.id}` : `provider:${input.serverId}:${normalizeReference(input.reference)}`),
    canonicalTitle: mapping?.canonicalTitle ?? metadata?.title ?? input.title,
    malId: mal?.malId ?? anilist?.malId ?? mapping?.malId ?? null,
    anilistId,
    postType,
    status: mal?.status ?? anilist?.status ?? null,
    synopsis: mal?.synopsis ?? anilist?.synopsis ?? null,
    titleEnglish: mal?.titleEnglish ?? anilist?.titleEnglish ?? null,
    titleRomaji: mal?.titleRomaji ?? anilist?.titleRomaji ?? null,
    titleNative: mal?.titleNative ?? anilist?.titleNative ?? null,
    year: mal?.year ?? anilist?.year ?? null,
    genres: mal?.genres ?? anilist?.genres ?? [],
    scoreBasisPoints: mal?.scoreBasisPoints ?? anilist?.scoreBasisPoints ?? null,
    imageUrl: mal?.imageUrl ?? anilist?.imageUrl ?? null,
    backdropUrl,
    source: mal ? (anilistId ? 'anilist' : 'myanimelist') : anilist ? 'anilist' : mapping ? 'mapping' : 'none'
  };
  return stored ? mergeLoadedMetadata(stored, result) : result;
}

const ANILIST_MEDIA_FIELDS = `id idMal title { romaji english native } description format status seasonYear averageScore genres coverImage { large extraLarge } bannerImage`;

async function fetchAniListByMalId(c: Context, malId: number): Promise<AniListAnimeSummary | null> {
  const query = `query($malId:Int){ Media(idMal:$malId,type:ANIME){ ${ANILIST_MEDIA_FIELDS} } }`;
  const cacheKey = new Request(`${ANILIST_CACHE_ORIGIN}/v2/mal/${malId}`);
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return await cached.json<AniListAnimeSummary | null>();
  const response = await fetch(ANILIST_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'NekoAnimes-Staging/1.0' }, body: JSON.stringify({ query, variables: { malId } }) });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const body = await response.json<{ data?: { Media?: Record<string, unknown> | null } }>();
  const result = body.data?.Media ? toAniListSummary(body.data.Media) : null;
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })));
  return result;
}

async function fetchAniListByTitle(c: Context, title: string): Promise<AniListAnimeSummary | null> {
  const query = `query($search:String){ Page(perPage:5){ media(search:$search,type:ANIME,sort:SEARCH_MATCH){ ${ANILIST_MEDIA_FIELDS} } } }`;
  const cacheKey = new Request(`${ANILIST_CACHE_ORIGIN}/v4/title/${encodeURIComponent(normalizeTitle(title))}`);
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return await cached.json<AniListAnimeSummary | null>();
  const response = await fetch(ANILIST_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'NekoAnimes-Staging/1.0' }, body: JSON.stringify({ query, variables: { search: title } }) });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const body = await response.json<{ data?: { Page?: { media?: Array<Record<string, unknown>> } } }>();
  const candidates = (body.data?.Page?.media ?? []).map(toAniListSummary);
  const exact = candidates.filter((candidate) => [candidate.title, candidate.titleEnglish, candidate.titleRomaji, candidate.titleNative].filter(Boolean).some((value) => sameTitle(String(value), title)));
  const result = exact.length === 1 ? exact[0]! : null;
  if (result) c.executionCtx.waitUntil(edgeCache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })));
  return result;
}

async function fetchAniListById(c: Context, id: number): Promise<AniListAnimeSummary | null> {
  const query = `query($id:Int){ Media(id:$id,type:ANIME){ ${ANILIST_MEDIA_FIELDS} } }`;
  const cacheKey = new Request(`${ANILIST_CACHE_ORIGIN}/v2/id/${id}`);
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return await cached.json<AniListAnimeSummary | null>();
  const response = await fetch(ANILIST_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'NekoAnimes-Staging/1.0' }, body: JSON.stringify({ query, variables: { id } }) });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const body = await response.json<{ data?: { Media?: Record<string, unknown> | null } }>();
  const result = body.data?.Media ? toAniListSummary(body.data.Media) : null;
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })));
  return result;
}

function sameTitle(left: string | null, right: string): boolean {
  return Boolean(left && normalizeTitle(left) === normalizeTitle(right));
}

function normalizeTitle(value: string): string {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(dublado|legendado|online|todos os episodios)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeReference(value: string): string { return value.replace(/\/$/, ''); }

function malType(value: string): ProviderPostType {
  if (value === 'movie') return 'filme';
  if (value === 'manga') return 'manga';
  return 'anime';
}

function anilistType(value: string | null): ProviderPostType {
  if (value === 'MOVIE') return 'filme';
  return 'anime';
}

function toAniListSummary(media: Record<string, unknown>): AniListAnimeSummary {
  const title = media.title as Record<string, unknown> | undefined;
  const cover = media.coverImage as Record<string, unknown> | undefined;
  const rawDescription = typeof media.description === 'string' ? media.description : null;
  const averageScore = typeof media.averageScore === 'number' ? media.averageScore : null;
  return {
    id: Number(media.id),
    malId: typeof media.idMal === 'number' ? media.idMal : null,
    title: String(title?.romaji ?? title?.english ?? title?.native ?? 'Anime'),
    titleEnglish: typeof title?.english === 'string' ? title.english : null,
    titleRomaji: typeof title?.romaji === 'string' ? title.romaji : null,
    titleNative: typeof title?.native === 'string' ? title.native : null,
    synopsis: rawDescription?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null,
    format: typeof media.format === 'string' ? media.format : null,
    status: typeof media.status === 'string' ? media.status.toLowerCase() : null,
    year: typeof media.seasonYear === 'number' ? media.seasonYear : null,
    scoreBasisPoints: averageScore === null ? null : Math.round(averageScore * 10),
    genres: Array.isArray(media.genres) ? media.genres.map(String) : [],
    imageUrl: typeof cover?.extraLarge === 'string' ? cover.extraLarge : typeof cover?.large === 'string' ? cover.large : null,
    bannerImage: typeof media.bannerImage === 'string' ? media.bannerImage : null
  };
}
