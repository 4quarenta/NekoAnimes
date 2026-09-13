import type { ProviderMetadata } from './provider-identity';
import { HTTPException } from 'hono/http-exception';

type Row = Record<string, unknown>;
export const canonicalReference = (ref: string) => ref.replace(/\/$/, '');

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
