import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { sameAnimeTitle } from '@neko/contracts';
import { getProviderAnime, searchProvider } from './server-providers';
import { canonicalReference, identityFromRow, persistIdentity } from './catalog-store';
import { resolveProviderIdentity } from './provider-identity';

export async function providerWork(c: Context, serverId: string, reference: string) {
  const detail = await getProviderAnime(serverId, reference);
  const identity = await resolveProviderIdentity(c, { serverId, reference: detail.anime.reference, title: detail.anime.title, fallbackPostType: detail.postType });
  return { detail, identity };
}

// Favorites carry a work slug, never a reference belonging to another server.
export async function resolveLibraryWork(c: Context, serverId: string, slug: string) {
  const db = c.env.DB as D1Database;
  const row = await db.prepare('SELECT * FROM anime WHERE slug=?').bind(slug).first<Record<string, unknown>>();
  if (!row) throw new HTTPException(404, { message: 'Obra salva não encontrada.' });
  const identity = await identityFromRow(db, row);
  const mappings = (await db.prepare('SELECT external_id FROM anime_external_ids WHERE anime_id=? AND provider=? ORDER BY rowid DESC LIMIT 6').bind(row.id, serverId).all<{external_id:string}>()).results;
  // A confirmed alias is identified by its exact provider reference, not by its
  // display title (which can differ from MAL or another provider's localization).
  if (mappings.length) {
    let lastError: unknown;
    for (const mapping of mappings) {
      try {
        const detail = await getProviderAnime(serverId, mapping.external_id);
        if (canonicalReference(mapping.external_id) !== canonicalReference(detail.anime.reference)) throw new HTTPException(409, { message: 'O servidor redirecionou para outra obra. Confira o vínculo antes de continuar.' });
        return { ...detail, identity, workSlug: slug, postType: identity.postType };
      } catch (error) { lastError = error; }
    }
    throw lastError;
  }
  let reference: string;
  {
    const titles = [...new Set([identity.canonicalTitle, identity.titleRomaji, identity.titleEnglish].filter((x): x is string => Boolean(x)))];
    const matches = new Map<string, Awaited<ReturnType<typeof searchProvider>>[number]>();
    for (const title of titles.slice(0, 3)) {
      for (const match of await searchProvider(serverId, title)) {
        if (titles.some(alias => sameAnimeTitle(alias, match.title))) matches.set(canonicalReference(match.reference), match);
      }
      if (matches.size) break;
    }
    if (matches.size !== 1) throw new HTTPException(matches.size ? 409 : 404, { message: matches.size ? 'Há mais de uma edição desta obra neste servidor. Selecione a edição pela busca.' : 'Esta obra não foi encontrada no servidor selecionado. Tente outro servidor ou procure pelo título.' });
    reference = [...matches.values()][0]!.reference;
  }
  const detail = await getProviderAnime(serverId, reference);
  // A redirected provider page must not silently become a different work.
  if (![identity.canonicalTitle, identity.titleEnglish, identity.titleRomaji].some(title => title && sameAnimeTitle(title, detail.anime.title))) {
    throw new HTTPException(409, { message: 'O servidor retornou outra edição. Abra a obra pela busca para conferir.' });
  }
  return { ...detail, identity, workSlug: slug, postType: identity.postType };
}

export async function saveProviderWork(c: Context, serverId: string, reference: string, workSlug?: string) {
  const work = workSlug ? await resolveLibraryWork(c, serverId, workSlug) : null;
  if (work && canonicalReference(work.anime.reference) !== canonicalReference(reference)) throw new HTTPException(409, { message: 'A referência não corresponde à obra salva.' });
  const { detail, identity } = work ? { detail: work, identity: work.identity } : await providerWork(c, serverId, reference);
  const saved = await persistIdentity(c.env.DB, identity, serverId, detail.anime.reference);
  return { detail, ...saved };
}
