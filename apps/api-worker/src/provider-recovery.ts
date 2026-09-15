import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import type { ConfirmProviderLinkSchema, ProviderRecovery, ProviderWorkOption } from '@neko/contracts';
import { canonicalReference, identityFromRow } from './catalog-store';
import { getProviderAnime, listServerDescriptors, searchProvider } from './server-providers';

async function storedWork(db: D1Database, slug: string) {
  const row = await db.prepare('SELECT * FROM anime WHERE slug=?').bind(slug).first<Record<string, unknown>>();
  if (!row) throw new HTTPException(404, { message: 'Esta obra não está mais no catálogo salvo.' });
  return { row, identity: await identityFromRow(db, row) };
}

// Discovery is read-only. Similarity is a suggestion, never proof of identity.
export async function discoverProviderRecovery(db: D1Database, serverId: string, slug: string): Promise<ProviderRecovery> {
  const { row, identity } = await storedWork(db, slug);
  const server = listServerDescriptors().find(item => item.id === serverId);
  if (!server) throw new HTTPException(400, { message: 'Servidor inválido.' });
  const links = (await db.prepare('SELECT provider,external_id FROM anime_external_ids WHERE anime_id=? ORDER BY provider,external_id')
    .bind(row.id).all<{ provider: string; external_id: string }>()).results;
  const known = links.filter(link => link.provider !== serverId && listServerDescriptors().some(item => item.id === link.provider)).slice(0, 6);
  const titles = [...new Set([identity.canonicalTitle, identity.titleRomaji, identity.titleEnglish].filter((title): title is string => Boolean(title)))].slice(0, 2);
  const [availability, searches] = await Promise.all([
    Promise.allSettled(known.map(async link => {
      const detail = await getProviderAnime(link.provider, link.external_id);
      if (canonicalReference(detail.anime.reference) !== canonicalReference(link.external_id)) throw new Error('Provider redirected to another item');
      return { serverId: detail.server.id, serverName: detail.server.name, reference: detail.anime.reference,
        title: detail.anime.title, imageUrl: identity.imageUrl ?? detail.anime.imageUrl ?? null,
        releaseLabel: detail.anime.releaseLabel ?? null,
        postType: identity.postType, year: identity.year } satisfies ProviderWorkOption;
    })),
    Promise.allSettled(titles.map(title => searchProvider(serverId, title)))
  ]);
  const matches = new Map<string, ProviderWorkOption>();
  for (const result of searches) {
    if (result.status !== 'fulfilled') continue;
    for (const match of result.value) matches.set(canonicalReference(match.reference), {
      serverId, serverName: server.name, reference: match.reference, title: match.title,
      imageUrl: match.imageUrl ?? null, releaseLabel: match.releaseLabel ?? null,
      postType: match.postType, year: null
    });
  }
  const available = new Map<string, ProviderWorkOption>();
  for (const result of availability) if (result.status === 'fulfilled' && !available.has(result.value.serverId)) available.set(result.value.serverId, result.value);
  return {
    work: { slug, title: identity.canonicalTitle, imageUrl: identity.imageUrl, malId: identity.malId, year: identity.year, postType: identity.postType },
    server: { id: server.id, name: server.name }, available: [...available.values()], matches: [...matches.values()].slice(0, 12),
    searchFailed: searches.some(result => result.status === 'rejected'),
    availabilityFailed: availability.some(result => result.status === 'rejected')
  };
}

export async function confirmProviderLink(db: D1Database, userId: string, data: z.infer<typeof ConfirmProviderLinkSchema>) {
  const { row, identity } = await storedWork(db, data.workSlug);
  const owned = await db.prepare(`SELECT 1 FROM user_library WHERE user_id=? AND anime_id=?
    UNION ALL SELECT 1 FROM user_episode_progress p JOIN episodes e ON e.id=p.episode_id
    JOIN anime_seasons s ON s.id=e.season_id WHERE p.user_id=? AND s.anime_id=? LIMIT 1`)
    .bind(userId, row.id, userId, row.id).first();
  if (!owned) throw new HTTPException(403, { message: 'Salve esta obra na sua lista antes de confirmar o vínculo.' });
  const detail = await getProviderAnime(data.serverId, data.reference);
  const reference = canonicalReference(data.reference);
  if (canonicalReference(detail.anime.reference) !== reference || detail.anime.title !== data.expectedTitle) {
    throw new HTTPException(409, { message: 'O item do servidor mudou. Feche esta comparação e confira novamente antes de vincular.' });
  }
  if (identity.postType !== detail.postType) throw new HTTPException(409, { message: 'Os tipos de obra são diferentes. Um filme, anime ou mangá não pode substituir outro tipo.' });
  const owner = () => db.prepare("SELECT DISTINCT anime_id FROM anime_external_ids WHERE provider=? AND RTRIM(external_id,'/')=?")
    .bind(data.serverId, reference).all<{ anime_id: string }>();
  const assertOwner = (rows: { anime_id: string }[]) => {
    if (rows.some(value => value.anime_id !== identity.canonicalId)) throw new HTTPException(409, {
      message: 'Este item já está vinculado a outra obra. É necessária uma revisão dos vínculos; seus favoritos e progresso foram preservados.'
    });
  };
  assertOwner((await owner()).results);
  // One atomic conditional insert, including slash-normalized legacy mappings.
  // Never move an existing link or overwrite canonical metadata supplied by a client.
  await db.prepare(`INSERT INTO anime_external_ids(id,anime_id,provider,external_id)
    SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM anime_external_ids WHERE provider=? AND RTRIM(external_id,'/')=?)
    ON CONFLICT(provider,external_id) DO NOTHING`)
    .bind(crypto.randomUUID(), identity.canonicalId, data.serverId, reference, data.serverId, reference).run();
  const owners = (await owner()).results;
  assertOwner(owners);
  if (!owners.length) throw new HTTPException(503, { message: 'Não foi possível salvar o vínculo. Tente novamente.' });
  return { ...detail, workSlug: data.workSlug, postType: identity.postType, identity };
}
