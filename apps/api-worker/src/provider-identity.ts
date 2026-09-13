import type { Context } from 'hono';
import mappings from '../data/provider-mappings.json';
import { fetchMalAnime, fetchMalCatalog, type MalAnimeSummary } from './mal-client';

export type ProviderPostType = 'anime' | 'filme' | 'manga';

export type ProviderMetadata = {
  canonicalId: string;
  canonicalTitle: string;
  malId: number | null;
  anilistId: number | null;
  postType: ProviderPostType;
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

type MappingEntry = {
  canonicalId?: string;
  canonicalTitle: string;
  malId: number | null;
  anilistId: number | null;
  providers: Array<{ id: string; animeReference: string }>;
};

const entries = (mappings.entries as MappingEntry[]) ?? [];
const ANILIST_URL = 'https://graphql.anilist.co';
const ANILIST_CACHE_ORIGIN = 'https://nekoanimes-anilist-cache.invalid';

export async function resolveProviderIdentity(
  c: Context,
  input: { serverId: string; reference: string; title: string; fallbackPostType: ProviderPostType }
): Promise<ProviderMetadata> {
  const mapping = entries.find((entry) => entry.providers.some((provider) => provider.id === input.serverId && normalizeReference(provider.animeReference) === normalizeReference(input.reference)));
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

  let anilistId = mapping?.anilistId ?? null;
  let backdropUrl: string | null = null;
  if (mal?.malId) {
    try {
      const anilist = await fetchAniListByMalId(c, mal.malId);
      anilistId = anilist?.id ?? anilistId;
      backdropUrl = anilist?.bannerImage ?? null;
    } catch {
      // AniList is enrichment only and must not block playback.
    }
  }
  if (!backdropUrl && anilistId) {
    try { backdropUrl = (await fetchAniListById(c, anilistId))?.bannerImage ?? null; } catch { /* enrichment only */ }
  }

  const postType = mal ? malType(mal.type) : input.fallbackPostType;
  return {
    canonicalId: mapping?.canonicalId ?? (mal ? `mal:${mal.malId}` : `title:${normalizeTitle(input.title)}`),
    canonicalTitle: mapping?.canonicalTitle ?? mal?.title ?? input.title,
    malId: mal?.malId ?? mapping?.malId ?? null,
    anilistId,
    postType,
    synopsis: mal?.synopsis ?? null,
    titleEnglish: mal?.titleEnglish ?? null,
    titleRomaji: mal?.titleRomaji ?? null,
    titleNative: mal?.titleNative ?? null,
    year: mal?.year ?? null,
    genres: mal?.genres ?? [],
    scoreBasisPoints: mal?.scoreBasisPoints ?? null,
    imageUrl: mal?.imageUrl ?? null,
    backdropUrl,
    source: mal ? (anilistId ? 'anilist' : 'myanimelist') : mapping ? 'mapping' : 'none'
  };
}

async function fetchAniListByMalId(c: Context, malId: number): Promise<{ id: number; bannerImage: string | null } | null> {
  const query = `query($malId:Int){ Media(idMal:$malId,type:ANIME){ id bannerImage } }`;
  const cacheKey = new Request(`${ANILIST_CACHE_ORIGIN}/v2/mal/${malId}`);
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return await cached.json<{ id: number; bannerImage: string | null } | null>();
  const response = await fetch(ANILIST_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'NekoAnimes-Staging/1.0' }, body: JSON.stringify({ query, variables: { malId } }) });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const body = await response.json<{ data?: { Media?: { id?: number; bannerImage?: string | null } | null } }>();
  const result = body.data?.Media?.id ? { id: body.data.Media.id, bannerImage: body.data.Media.bannerImage ?? null } : null;
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })));
  return result;
}

async function fetchAniListById(c: Context, id: number): Promise<{ id: number; bannerImage: string | null } | null> {
  const query = `query($id:Int){ Media(id:$id,type:ANIME){ id bannerImage } }`;
  const cacheKey = new Request(`${ANILIST_CACHE_ORIGIN}/v2/id/${id}`);
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cached = await edgeCache.match(cacheKey);
  if (cached) return await cached.json<{ id: number; bannerImage: string | null } | null>();
  const response = await fetch(ANILIST_URL, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'NekoAnimes-Staging/1.0' }, body: JSON.stringify({ query, variables: { id } }) });
  if (!response.ok) throw new Error(`AniList HTTP ${response.status}`);
  const body = await response.json<{ data?: { Media?: { id?: number; bannerImage?: string | null } | null } }>();
  const result = body.data?.Media?.id ? { id: body.data.Media.id, bannerImage: body.data.Media.bannerImage ?? null } : null;
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
