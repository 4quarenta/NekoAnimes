import type { ProviderMetadata } from './provider-identity';
import { HTTPException } from 'hono/http-exception';
import type { ServerAnimeMatch } from './server-providers';

type Row = Record<string, unknown>;
export const canonicalReference = (ref: string) => ref.replace(/\/$/, '');

// Stay below D1's 100 bound-parameter limit, including the provider parameter.
export const CATALOG_METADATA_BATCH_SIZE = 80;

export async function enrichProviderCatalog(db: D1Database, serverId: string, items: ServerAnimeMatch[]): Promise<ServerAnimeMatch[]> {
  const references = [...new Set(items.filter(item => item.serverId === serverId).map(item => canonicalReference(item.reference)))];
  const stored = new Map<string, Row>();
  const ambiguous = new Set<string>();
  for (let start = 0; start < references.length; start += CATALOG_METADATA_BATCH_SIZE) {
    const batch = references.slice(start, start + CATALOG_METADATA_BATCH_SIZE);
    const rows = (await db.prepare(`SELECT a.id,a.slug,a.image_url,a.score_basis_points,a.genres,a.type,
      RTRIM(x.external_id,'/') AS reference FROM anime_external_ids x JOIN anime a ON a.id=x.anime_id
      WHERE x.provider=? AND RTRIM(x.external_id,'/') IN (${batch.map(() => '?').join(',')})`)
      .bind(serverId, ...batch).all<Row>()).results;
    for (const row of rows) {
      const reference = String(row.reference);
      if (stored.has(reference) && stored.get(reference)!.id !== row.id) ambiguous.add(reference);
      stored.set(reference, row);
    }
  }
  return items.map(item => {
    const reference = canonicalReference(item.reference);
    const row = item.serverId === serverId && !ambiguous.has(reference) ? stored.get(reference) : undefined;
    if (!row) return item;
    let genres: unknown;
    try { genres = JSON.parse(String(row.genres)); } catch { /* Ignore malformed legacy metadata. */ }
    const postType = row.type === 'movie' || row.type === 'filme' ? 'filme' : row.type === 'manga' ? 'manga'
      : ['tv', 'anime', 'ova', 'ona', 'special', 'music'].includes(String(row.type)) ? 'anime' : undefined;
    return {
      ...item,
      workSlug: String(row.slug),
      ...(typeof row.image_url === 'string' && row.image_url ? { imageUrl: row.image_url } : {}),
      ...(typeof row.score_basis_points === 'number' ? { scoreBasisPoints: row.score_basis_points } : {}),
      ...(Array.isArray(genres) && genres.every(value => typeof value === 'string') ? { genres } : {}),
      ...(postType ? { postType } : {})
    };
  });
}

export async function readStoredIdentity(db: D1Database, serverId: string, reference: string) {
  const row = await db.prepare(`SELECT a.* FROM anime a JOIN anime_external_ids x ON x.anime_id=a.id
    WHERE x.provider=? AND RTRIM(x.external_id,'/')=?`).bind(serverId, canonicalReference(reference)).first<Row>();
  return row ? identityFromRow(db, row) : null;
}

export async function identityFromRow(db: D1Database, row: Row): Promise<ProviderMetadata> {
  const ids = (await db.prepare('SELECT provider,external_id FROM anime_external_ids WHERE anime_id=?').bind(row.id).all<Row>()).results;
  const external = (provider: string) => Number(ids.find(x => x.provider === provider)?.external_id) || null;
  return {
    canonicalId: String(row.id), canonicalTitle: String(row.title), malId: external('myanimelist'), anilistId: external('anilist'),
    postType: row.type === 'movie' || row.type === 'filme' ? 'filme' : row.type === 'manga' ? 'manga' : 'anime',
    status: String(row.status), synopsis: row.synopsis as string | null, titleEnglish: row.title_english as string | null,
    titleRomaji: row.title_romaji as string | null, titleNative: row.title_native as string | null,
    year: row.year as number | null, scoreBasisPoints: row.score_basis_points as number | null,
    genres: JSON.parse(String(row.genres ?? '[]')), imageUrl: row.image_url as string | null, backdropUrl: row.backdrop_url as string | null,
    source: external('anilist') ? 'anilist' : external('myanimelist') ? 'myanimelist' : 'mapping'
  };
}

// Null/empty enrichment never erases already saved metadata.
export function fillMetadata(base: ProviderMetadata, extra: Partial<ProviderMetadata>): ProviderMetadata {
  const next = { ...base };
  for (const key of ['synopsis', 'titleEnglish', 'titleRomaji', 'titleNative', 'year', 'scoreBasisPoints', 'imageUrl', 'backdropUrl', 'malId', 'anilistId'] as const) {
    if (!next[key] && extra[key]) (next as Record<string, unknown>)[key] = extra[key];
  }
  if (!next.genres.length && extra.genres?.length) next.genres = extra.genres;
  return next;
}

export async function persistIdentity(db: D1Database, metadata: ProviderMetadata, serverId: string, reference: string) {
  const pairs = [{ provider: serverId, id: canonicalReference(reference) },
    ...(metadata.malId ? [{ provider: 'myanimelist', id: String(metadata.malId) }] : []),
    ...(metadata.anilistId ? [{ provider: 'anilist', id: String(metadata.anilistId) }] : [])];
  const owners = await Promise.all(pairs.map(p => db.prepare("SELECT anime_id FROM anime_external_ids WHERE provider=? AND RTRIM(external_id,'/')=?").bind(p.provider, p.id).first<{ anime_id: string }>()));
  const existingIds = [...new Set(owners.flatMap(x => x ? [x.anime_id] : []))];
  if (existingIds.length > 1) throw new HTTPException(409, { message: 'Vínculos conflitantes para esta obra. Nenhum favorito foi alterado.' });
  const id = existingIds[0] ?? metadata.canonicalId;
  const existing = await db.prepare('SELECT * FROM anime WHERE id=?').bind(id).first<Row>();
  const identity = existing ? fillMetadata(await identityFromRow(db, existing), metadata) : { ...metadata, canonicalId: id };
  const slug = existing ? String(existing.slug) : `work-${encodeURIComponent(id)}`;
  const statements = [db.prepare(`INSERT INTO anime(id,slug,title,title_english,title_romaji,title_native,synopsis,type,status,year,score_basis_points,genres,image_url,backdrop_url)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    title=excluded.title,title_english=COALESCE(excluded.title_english,anime.title_english),title_romaji=COALESCE(excluded.title_romaji,anime.title_romaji),
    title_native=COALESCE(excluded.title_native,anime.title_native),synopsis=COALESCE(excluded.synopsis,anime.synopsis),
    year=COALESCE(excluded.year,anime.year),score_basis_points=COALESCE(excluded.score_basis_points,anime.score_basis_points),
    genres=CASE WHEN excluded.genres='[]' THEN anime.genres ELSE excluded.genres END,
    image_url=COALESCE(excluded.image_url,anime.image_url),backdrop_url=COALESCE(excluded.backdrop_url,anime.backdrop_url),updated_at=CURRENT_TIMESTAMP`)
    .bind(id,slug,identity.canonicalTitle,identity.titleEnglish,identity.titleRomaji,identity.titleNative,identity.synopsis,
      identity.postType === 'filme' ? 'movie' : identity.postType === 'manga' ? 'manga' : 'tv',identity.status ?? 'unknown',identity.year,identity.scoreBasisPoints,JSON.stringify(identity.genres),identity.imageUrl,identity.backdropUrl)];
  for (const p of pairs) {
    if (!owners[pairs.indexOf(p)]) statements.push(db.prepare('INSERT INTO anime_external_ids(id,anime_id,provider,external_id) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,p.provider,p.id));
  }
  await db.batch(statements);
  return { identity: { ...identity, canonicalId: id }, slug };
}
