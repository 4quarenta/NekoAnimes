import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import {
  BloggerVideoResolutionError,
  parseBloggerVideoUrl,
  resolveBloggerVideoSource
} from './blogger-video-resolver';
import {
  ProviderError,
  checkProviderHealth,
  browseProvider,
  getProviderCategories,
  getProviderAnime,
  getProviderEpisode,
  hasProvider,
  listServerDescriptors,
  searchProvider
} from './server-providers';
import {
  MalApiError,
  fetchMalAnime,
  fetchMalCatalog,
  fetchMalEpisodes,
  fetchMalGenres,
  KNOWN_MAL_GENRES,
  malSeasonSlug,
  parseMalSeasonSlug,
  parseMalSlug
} from './mal-client';
import { mergeLoadedMetadata, parseLoadedProviderMetadata, resolveProviderIdentity } from './provider-identity';
import { ProviderSelectionSchema, ProviderProgressSchema, ConfirmProviderLinkSchema, episodeOrdinal, seasonEpisodeAtOrdinal } from '@neko/contracts';
import { confirmProviderLink, discoverProviderRecovery } from './provider-recovery';
import { persistIdentity, canonicalReference, enrichProviderCatalog } from './catalog-store';
import { resolveLibraryWork, saveProviderWork } from './provider-library';

type Variables = { userId: string; userEmail?: string; tokenHash?: string };
type App = Hono<{ Bindings: Env; Variables: Variables }>;
type Row = Record<string, unknown>;
type WorkerServerConfig = { id: string; enabled: boolean; recommended: boolean };
type WorkerUpdateConfig = { enabled: boolean; mode: 'direct' | 'play_store'; versionCode: number; versionName: string; apkUrl: string; sha256: string; required: boolean; storeUrl: string };
type WorkerAppConfig = { mode: 1 | 2; servers: WorkerServerConfig[]; updates: WorkerUpdateConfig };
const MEDIA_PROXY_HOSTS = new Set(['cdn.imagesskill.com', 'goyabu.io', 'animesonlinecc.to', 'animesdigital.org']);

const app: App = new Hono();

app.use('*', async (c, next) => {
  const configuredUrl = c.env?.WEB_APP_URL;
  const allowed = configuredUrl ? new URL(configuredUrl).origin : '';
  return cors({
    origin: allowed,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
    maxAge: 600
  })(c, next);
});

app.get('/health', (c) => c.json({ status: 'ok', service: 'neko-api', timestamp: new Date().toISOString() }));

app.get('/health/ready', async (c) => {
  try {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    return c.json({ status: 'ok', service: 'neko-api', dependencies: { d1: 'ok', auth: 'local-worker' }, timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'degraded', service: 'neko-api', dependencies: { d1: 'error', auth: 'local-worker' }, timestamp: new Date().toISOString() }, 503);
  }
});

app.get('/v1/app-manifest', async (c) => {
  const row = await first<Row>(c.env.DB, 'SELECT version, mode, payload FROM app_config WHERE id = 1');
  const payload = parseObject(row?.payload);
  const mode = normalizeAppMode(row?.mode);
  return c.json({
    schemaVersion: 1,
    configVersion: Number(row?.version ?? 1),
    mode,
    webAppUrl: c.env.WEB_APP_URL,
    navigation: mode === 2 ? secondaryNavigation() : primaryNavigation(),
    features: { player: mode === 1, downloads: false, notifications: true, news: mode === 2 },
    servers: await enabledServerDescriptors(c.env.DB)
  }, 200, { 'Cache-Control': 'no-store' });
});

app.get('/v1/admin/app-config', requireAdmin, async (c) => {
  const row = await first<Row>(c.env.DB, 'SELECT version, mode, payload, updated_at FROM app_config WHERE id = 1');
  if (!row) throw new HTTPException(404, { message: 'Configuração do aplicativo não encontrada' });
  return c.json(appConfigState(row));
});

app.put('/v1/admin/app-config', requireAdmin, async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  const input = parseAdminAppConfig(body);
  if (!input) throw new HTTPException(400, { message: 'Configuração inválida' });

  await c.env.DB.prepare(
    `UPDATE app_config SET mode = ?, payload = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
  ).bind(input.mode, JSON.stringify({ servers: input.servers, updates: input.updates })).run();

  const row = await first<Row>(c.env.DB, 'SELECT version, mode, payload, updated_at FROM app_config WHERE id = 1');
  if (!row) throw new HTTPException(404, { message: 'Configuração do aplicativo não encontrada' });
  return c.json(appConfigState(row));
});

app.get('/v1/app-update/android', (c) => {
  const row = c.env.DB.prepare('SELECT payload FROM app_config WHERE id = 1').first<Row>();
  return row.then((configRow) => {
    const payload = parseObject(configRow?.payload);
    const configured = parseUpdateConfig(payload.updates);
    const versionCode = configured?.enabled ? configured.versionCode : Number(c.env.ANDROID_LATEST_VERSION_CODE);
    const versionName = configured?.enabled ? configured.versionName : c.env.ANDROID_LATEST_VERSION_NAME;
    const apkUrl = configured?.enabled && configured.mode === 'direct' ? configured.apkUrl : c.env.ANDROID_APK_URL;
    const sha256 = configured?.enabled && configured.mode === 'direct' ? configured.sha256.toLowerCase() : c.env.ANDROID_APK_SHA256?.toLowerCase();
    const mode = configured?.enabled ? configured.mode : 'direct';
    const storeUrl = configured?.enabled ? configured.storeUrl : '';
    if (mode === 'play_store' && (!Number.isInteger(versionCode) || versionCode < 1 || !versionName || !storeUrl.startsWith('https://play.google.com/'))) {
      return c.json({ message: 'Canal de atualização da Play Store ainda não configurado' }, 503);
    }
    if (mode === 'direct' && (!Number.isInteger(versionCode) || versionCode < 1 || !versionName || !apkUrl || !sha256 || !/^[a-f0-9]{64}$/.test(sha256))) {
      return c.json({ message: 'Canal de atualização Android ainda não publicado' }, 503);
    }
    return c.json({ platform: 'android', channel: 'direct', updateMode: mode, versionCode, versionName, apkUrl: mode === 'direct' ? apkUrl : '', sha256: mode === 'direct' ? sha256 : '', storeUrl, required: configured?.enabled ? configured.required : c.env.ANDROID_UPDATE_REQUIRED === 'true' }, 200, { 'Cache-Control': 'no-store' });
  });
});

app.get('/v1/media/proxy', async (c) => {
  const target = parseMediaProxyTarget(c.req.query('url'));
  const response = await fetch(target, {
    redirect: 'follow',
    headers: { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*' }
  });
  if (!response.ok || !response.body) throw new HTTPException(502, { message: `Media upstream respondeu HTTP ${response.status}` });

  const contentType = response.headers.get('content-type') ?? '';
  const isPlaylist = /\.m3u8$/i.test(new URL(response.url || target).pathname) || /mpegurl/i.test(contentType);
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': isPlaylist ? 'application/vnd.apple.mpegurl' : contentType || 'application/octet-stream'
  });
  if (!isPlaylist) return new Response(response.body, { status: 200, headers });

  const playlist = await response.text();
  const baseUrl = response.url || target;
  const rewritten = rewriteMediaPlaylist(playlist, baseUrl, c.req.url);
  return new Response(rewritten, { status: 200, headers });
});

app.get('/v1/media/blogger/source', async (c) => {
  let sourceUrl: string;
  try {
    sourceUrl = parseBloggerVideoUrl(c.req.query('url'));
  } catch (error) {
    if (error instanceof BloggerVideoResolutionError && error.kind === 'invalid') {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
  if (!c.env.BROWSER) {
    throw new HTTPException(503, { message: 'Resolver Blogger não configurado neste ambiente' });
  }

  try {
    const source = await resolveBloggerVideoSource(c.env.BROWSER, sourceUrl);
    return c.json(
      {
        provider: 'blogger',
        requestedUrl: sourceUrl,
        source,
        resolvedAt: new Date().toISOString(),
        cache: 'no-store'
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (error) {
    if (error instanceof BloggerVideoResolutionError) {
      throw new HTTPException(error.kind === 'timeout' ? 504 : 503, { message: error.message });
    }
    throw error;
  }
});

app.get('/v1/catalog/anime', async (c) => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const letter = c.req.query('letter');
  const query = c.req.query('q')?.trim();
  const limit = clampInt(c.req.query('limit'), 50, 1, 100);
  const genreId = parsePositiveOptionalInt(c.req.query('genreId'));
  try {
    const result = await fetchMalCatalog(c, { query, genreId, limit, letter: letter && /^[A-Z]$/i.test(letter) ? letter : undefined });
    return c.json({ source: 'myanimelist', ...result }, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (error) {
    console.error('MAL catalog unavailable, using staging catalog fallback', error);
    if (letter && /^[A-Z]$/i.test(letter)) { conditions.push('title LIKE ? COLLATE NOCASE'); bindings.push(`${letter}%`); }
    if (query) { conditions.push('(title LIKE ? COLLATE NOCASE OR title_english LIKE ? COLLATE NOCASE OR title_romaji LIKE ? COLLATE NOCASE)'); bindings.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    const rows = await all<Row>(c.env.DB, `SELECT id, slug, title, year, type, status, genres, score_basis_points, image_url FROM anime${whereClause(conditions)} ORDER BY title COLLATE NOCASE LIMIT ?`, ...bindings, limit);
    return c.json({ source: 'staging-db-fallback', items: rows.map(animeSummary), count: rows.length, degraded: true });
  }
});

app.get('/v1/catalog/genres', async (c) => {
  try {
    return c.json({ source: 'myanimelist', items: await fetchMalGenres(c) }, 200, { 'Cache-Control': 'public, max-age=86400' });
  } catch (error) {
    console.error('MAL genres unavailable, using staging catalog fallback', error);
    return c.json({ source: 'myanimelist-known-fallback', items: KNOWN_MAL_GENRES });
  }
});

app.get('/v1/catalog/anime/:slug', async (c) => {
  const slug = c.req.param('slug');
  const item = await first<Row>(c.env.DB, 'SELECT * FROM anime WHERE slug = ?', slug);
  if (!item) {
    const malId = parseMalSlug(slug);
    if (!malId) throw new HTTPException(404, { message: 'Anime não encontrado' });
    const mal = await fetchMalAnime(c, malId);
    const seasons = mal.episodes && mal.episodes > 0 ? [{ id: malSeasonSlug(malId), animeId: mal.slug, number: 1, title: mal.type === 'movie' ? 'Filme' : 'Temporada única', episodesCount: mal.episodes }] : [];
    return c.json({
      id: mal.slug,
      slug: mal.slug,
      title: mal.title,
      titleEnglish: mal.titleEnglish,
      titleRomaji: mal.titleRomaji,
      titleNative: mal.titleNative,
      synopsis: mal.synopsis,
      type: mal.type,
      status: mal.status,
      year: mal.year,
      scoreBasisPoints: mal.scoreBasisPoints,
      genres: mal.genres,
      imageUrl: mal.imageUrl,
      externalIds: [{ provider: 'myanimelist', externalId: String(mal.malId) }],
      seasons
    });
  }
  const [externalIds, seasons] = await Promise.all([
    all<Row>(c.env.DB, 'SELECT provider, external_id FROM anime_external_ids WHERE anime_id = ?', item.id),
    all<Row>(c.env.DB, 'SELECT * FROM anime_seasons WHERE anime_id = ? ORDER BY number', item.id)
  ]);
  return c.json({ ...animeDetail(item), externalIds: externalIds.map((row) => ({ provider: String(row.provider), externalId: String(row.external_id) })), seasons: seasons.map(season) });
});

app.get('/v1/catalog/seasons/:seasonId/episodes', async (c) => {
  const seasonId = c.req.param('seasonId');
  const offset = clampInt(c.req.query('offset'), 0, 0, 1_000_000);
  const limit = clampInt(c.req.query('limit'), 10, 1, 50);
  const malId = parseMalSeasonSlug(seasonId);
  if (malId) {
    const page = Math.floor(offset / 100) + 1;
    const result = await fetchMalEpisodes(c, malId, page);
    const pageOffset = (page - 1) * 100;
    const items = result.items.slice(Math.max(0, offset - pageOffset), Math.max(0, offset - pageOffset) + limit).map((item) => ({
      id: `mal-${malId}-season-1-episode-${item.number}`,
      seasonId,
      number: item.number,
      title: item.title,
      durationSeconds: null,
      airedAt: item.airedAt
    }));
    return c.json({ season: { id: seasonId, animeId: `mal-${malId}`, number: 1, title: 'Temporada única', episodesCount: result.total }, items, offset, limit, total: result.total });
  }
  const seasonRow = await first<Row>(c.env.DB, 'SELECT * FROM anime_seasons WHERE id = ?', seasonId);
  if (!seasonRow) throw new HTTPException(404, { message: 'Temporada não encontrada' });
  const [rows, count] = await Promise.all([
    all<Row>(c.env.DB, 'SELECT * FROM episodes WHERE season_id = ? ORDER BY number LIMIT ? OFFSET ?', seasonId, limit, offset),
    first<Row>(c.env.DB, 'SELECT COUNT(*) AS count FROM episodes WHERE season_id = ?', seasonId)
  ]);
  return c.json({ season: season(seasonRow), items: rows.map(episode), offset, limit, total: Number(count?.count ?? 0) });
});

app.get('/v1/catalog/episodes/:episodeId/playback', async (c) => {
  const item = await first<Row>(c.env.DB, 'SELECT * FROM episodes WHERE id = ?', c.req.param('episodeId'));
  if (!item) throw new HTTPException(404, { message: 'Episódio não encontrado' });
  const rows = await all<Row>(c.env.DB, 'SELECT id, url, mime_type, label, headers, is_default FROM episode_sources WHERE episode_id = ? ORDER BY is_default DESC, label COLLATE NOCASE', item.id);
  if (!rows.length) throw new HTTPException(404, { message: 'Fonte de reprodução indisponível' });
  return c.json({ episode: { id: item.id, number: item.number, title: item.title, durationSeconds: item.duration_seconds }, sources: rows.map(source) });
});

app.get('/v1/servers', async (c) => c.json({ servers: await enabledServerDescriptors(c.env.DB) }));

app.post('/v1/reports', async (c) => {
  const body = await c.req.json<{ email?: string; category?: string; message?: string; route?: string; appVersion?: string }>().catch(() => ({} as { email?: string; category?: string; message?: string; route?: string; appVersion?: string }));
  const message = body.message?.trim() ?? '';
  if (message.length < 10 || message.length > 5_000) throw new HTTPException(400, { message: 'O relato deve ter entre 10 e 5.000 caracteres' });
  const category = body.category && ['bug', 'playback', 'account', 'content', 'other'].includes(body.category) ? body.category : 'bug';
  const email = body.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HTTPException(400, { message: 'E-mail inválido' });
  await c.env.DB.prepare('INSERT INTO reports(id, email, category, message, route, app_version) VALUES(?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), email, category, message, body.route?.trim().slice(0, 200) || null, body.appVersion?.trim().slice(0, 40) || null).run();
  return c.json({ ok: true }, 201);
});

app.get('/v1/admin/reports', requireAdmin, async (c) => {
  const status = c.req.query('status');
  const rows = status && ['open', 'in_progress', 'resolved', 'dismissed'].includes(status)
    ? await all<Row>(c.env.DB, 'SELECT id, user_id, email, category, message, route, app_version, status, created_at, updated_at FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 200', status)
    : await all<Row>(c.env.DB, 'SELECT id, user_id, email, category, message, route, app_version, status, created_at, updated_at FROM reports ORDER BY created_at DESC LIMIT 200');
  return c.json(rows.map(report));
});

app.put('/v1/admin/reports/:id', requireAdmin, async (c) => {
  const body = await c.req.json<{ status?: string }>().catch(() => ({} as { status?: string }));
  if (!body.status || !['open', 'in_progress', 'resolved', 'dismissed'].includes(body.status)) throw new HTTPException(400, { message: 'Status de report inválido' });
  const result = await c.env.DB.prepare("UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, c.req.param('id')).run();
  if (!result.meta.changes) throw new HTTPException(404, { message: 'Report não encontrado' });
  const row = await first<Row>(c.env.DB, 'SELECT id, user_id, email, category, message, route, app_version, status, created_at, updated_at FROM reports WHERE id = ?', c.req.param('id'));
  return c.json(row ? report(row) : { ok: true });
});

app.get('/v1/servers/health', async (c) => c.json({ servers: await Promise.all((await enabledServerDescriptors(c.env.DB)).map((server) => checkProviderHealth(server.id))), checkedAt: new Date().toISOString() }));

app.get('/v1/servers/search', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  validateProviderQuery(query);
  try {
    const servers = await Promise.all((await enabledServerDescriptors(c.env.DB)).map(async (server) => {
      try {
        const matches = await searchProvider(server.id, query);
        return { server, status: matches.length ? 'ok' as const : 'unavailable' as const, matches };
      } catch (error) {
        return { server, status: providerStatus(error), matches: [], error: providerErrorCode(error) };
      }
    }));
    return c.json({ query, servers, fetchedAt: new Date().toISOString() });
  } catch (error) {
    throw error;
  }
});

// Catalog browsing is provider-scoped. The selected provider is the only
// source consulted for this request; results are never merged with MAL or
// another provider.
app.get('/v1/servers/:serverId/categories', async (c) => {
  await assertEnabledServer(c.env.DB, c.req.param('serverId'));
  try { return c.json({ items: await getProviderCategories(c.req.param('serverId')), source: 'provider' }, 200, { 'Cache-Control': 'public, max-age=900' }); }
  catch (error) { throw providerHttpException(error); }
});

app.get('/v1/servers/:serverId/catalog', async (c) => {
  const serverId = c.req.param('serverId');
  await assertEnabledServer(c.env.DB, serverId);
  const query = c.req.query('q')?.trim();
  const letter = c.req.query('letter')?.trim();
  const genre = c.req.query('genre')?.trim();
  const page = clampInt(c.req.query('page'), 1, 1, 100);
  const limit = clampInt(c.req.query('limit'), 50, 1, 100);
  if (letter && !/^[A-Z]$/i.test(letter)) throw new HTTPException(400, { message: 'Letra inválida' });
  if (query) validateProviderQuery(query);
  if (genre && (genre.length < 2 || genre.length > 80)) throw new HTTPException(400, { message: 'Gênero inválido' });
  try {
    const browse = query ? { items: await searchProvider(serverId, query), hasNextPage: false } : await browseProvider(serverId, { letter: letter?.toUpperCase(), genre, page, limit });
    const server = (await enabledServerDescriptors(c.env.DB)).find((item) => item.id === serverId)!;
    const items = await enrichProviderCatalog(c.env.DB, serverId, genre ? browse.items : browse.items.slice(0, limit));
    return c.json({ server, items, count: items.length, page, pageSize: items.length, hasNextPage: browse.hasNextPage, source: 'provider', fetchedAt: new Date().toISOString() }, 200, { 'Cache-Control': 'public, max-age=120' });
  } catch (error) {
    throw providerHttpException(error);
  }
});

// Discovery is intentionally separate from playback resolution. This route
// expands the search matches into seasons and episodes, but never visits an
// episode page or extracts playback sources.
app.get('/v1/servers/resolve/:query', async (c) => {
  const query = decodeURIComponent(c.req.param('query')).trim();
  validateProviderQuery(query);
  const search = await Promise.all((await enabledServerDescriptors(c.env.DB)).map(async (server) => {
    try {
      const matches = await searchProvider(server.id, query);
      return { server, status: matches.length ? 'ok' as const : 'unavailable' as const, matches };
    } catch (error) {
      return { server, status: providerStatus(error), matches: [], error: providerErrorCode(error) };
    }
  }));
  const servers = await Promise.all(search.map(async (result) => {
    const match = result.matches[0];
    if (!match || result.status !== 'ok') return { server: result.server, status: result.status, available: false, error: result.error };
    try {
      const detail = await getProviderAnime(result.server.id, match.reference);
      return { server: result.server, status: 'ok' as const, available: true, anime: match, seasons: detail.seasons };
    } catch (error) {
      return { server: result.server, status: providerStatus(error), available: false, anime: match, error: providerErrorCode(error) };
    }
  }));
  return c.json({ query, servers, fetchedAt: new Date().toISOString() });
});

app.get('/v1/servers/resolve/:query/:season/:episode', async (c) => {
  const query = decodeURIComponent(c.req.param('query')).trim();
  validateProviderQuery(query);
  const seasonNumber = positiveProviderInt(c.req.param('season'), 'Temporada inválida');
  const episodeNumber = positiveProviderInt(c.req.param('episode'), 'Episódio inválido');
  let search;
  try {
    search = await Promise.all((await enabledServerDescriptors(c.env.DB)).map(async (server) => {
      try {
        const matches = await searchProvider(server.id, query);
        return { server, status: matches.length ? 'ok' as const : 'unavailable' as const, matches };
      } catch (error) {
        return { server, status: providerStatus(error), matches: [], error: providerErrorCode(error) };
      }
    }));
  } catch (error) {
    throw error;
  }

  const servers = await Promise.all(search.map(async (result) => {
    const match = result.matches[0];
    if (!match || result.status !== 'ok') return { server: result.server, status: result.status, available: false, error: result.error };
    try {
      const detail = await getProviderAnime(result.server.id, match.reference);
      const episode = detail.seasons.find((item) => item.number === seasonNumber)?.episodes.find((item) => item.number === episodeNumber);
      return { server: result.server, status: 'ok' as const, available: Boolean(episode), anime: match, ...(episode ? { episode } : {}) };
    } catch (error) {
      return { server: result.server, status: providerStatus(error), available: false, anime: match, error: providerErrorCode(error) };
    }
  }));
  return c.json({ query, season: seasonNumber, episode: episodeNumber, servers, fetchedAt: new Date().toISOString() }, 200);
});

// Once a provider is selected, this is the provider-scoped catalog step. The
// optional ref comes directly from /servers/search and avoids searching again.
app.get('/v1/servers/:serverId/resolve/:query', async (c) => {
  const serverId = c.req.param('serverId');
  await assertEnabledServer(c.env.DB, serverId);
  const query = decodeURIComponent(c.req.param('query')).trim();
  validateProviderQuery(query);
  const requestedReference = c.req.query('ref')?.trim();
  try {
    const match = requestedReference ? undefined : (await searchProvider(serverId, query))[0];
    if (!requestedReference && !match) throw new HTTPException(404, { message: 'Anime não encontrado neste provider' });
    const detail = await getProviderAnime(serverId, requestedReference ?? match!.reference);
    return c.json({
      query,
      server: detail.server,
      anime: detail.anime,
      match: match ?? { serverId, serverName: detail.server.name, title: detail.anime.title, reference: detail.anime.reference, url: detail.anime.url, confidence: 1, postType: detail.postType },
      seasons: detail.seasons,
      postType: detail.postType,
      fetchedAt: detail.fetchedAt
    });
  } catch (error) {
    throw error instanceof HTTPException ? error : providerHttpException(error);
  }
});

app.get('/v1/servers/:serverId/resolve/:query/:season/:episode', async (c) => {
  const serverId = c.req.param('serverId');
  await assertEnabledServer(c.env.DB, serverId);
  const query = decodeURIComponent(c.req.param('query')).trim();
  validateProviderQuery(query);
  const seasonNumber = positiveProviderInt(c.req.param('season'), 'Temporada inválida');
  const episodeNumber = positiveProviderInt(c.req.param('episode'), 'Episódio inválido');

  try {
    const requestedReference = c.req.query('ref')?.trim();
    const requestedEpisodeReference = c.req.query('episodeRef')?.trim();
    const match = requestedReference ? undefined : (await searchProvider(serverId, query))[0];
    if (!requestedReference && !match) throw new HTTPException(404, { message: 'Anime não encontrado neste provider' });
    const detail = await getProviderAnime(serverId, requestedReference ?? match!.reference);
    const anime = {
      serverId,
      serverName: detail.server.name,
      title: detail.anime.title,
      reference: detail.anime.reference,
      url: detail.anime.url,
      confidence: 1,
      postType: detail.postType
    };
    const episode = requestedEpisodeReference
      ? detail.seasons.flatMap((season) => season.episodes).find((item) => item.reference === requestedEpisodeReference)
      : detail.seasons.find((item) => item.number === seasonNumber)?.episodes.find((item) => item.number === episodeNumber);
    if (!episode) throw new HTTPException(404, { message: 'Episódio não encontrado neste provider' });
    const providerEpisode = await getProviderEpisode(serverId, episode.reference);
    const sources = providerEpisode.playback.sources.map((source) => ({
      ...source,
      ...(isMediaProxyTarget(source.url) ? { playbackUrl: mediaProxyUrl(c.req.url, source.url) } : {})
    }));
    return c.json({
      query,
      season: seasonNumber,
      episodeNumber,
      server: detail.server,
      anime,
      episode,
      sources,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    throw error instanceof HTTPException ? error : providerHttpException(error);
  }
});

app.get('/v1/servers/:serverId/recovery', async (c) => {
  await assertEnabledServer(c.env.DB, c.req.param('serverId'));
  const slug = c.req.query('slug');
  if (!slug || slug.length > 1500) throw new HTTPException(400, { message: 'Obra inválida.' });
  c.header('Cache-Control', 'no-store');
  return c.json(await discoverProviderRecovery(c.env.DB, c.req.param('serverId'), slug));
});

app.get('/v1/servers/:serverId/anime', async (c) => {
  await assertEnabledServer(c.env.DB, c.req.param('serverId'));
  const slug = c.req.query('slug');
  if (slug) {
    if (slug.length > 1500) throw new HTTPException(400, { message: 'Obra inválida' });
    try { return c.json(await resolveLibraryWork(c, c.req.param('serverId'), slug)); }
    catch (error) { throw error instanceof HTTPException ? error : providerHttpException(error); }
  }
  const reference = c.req.query('ref')?.trim() ?? '';
  if (!reference || reference.length > 1000 || !reference.startsWith('/')) throw new HTTPException(400, { message: 'Referência inválida' });
  try {
    const detail = await getProviderAnime(c.req.param('serverId'), reference);
    const identity = await resolveProviderIdentity(c, {
      serverId: c.req.param('serverId'),
      reference: detail.anime.reference,
      title: detail.anime.title,
      fallbackPostType: detail.postType
    });
    return c.json({ ...detail, postType: identity.postType, identity });
  } catch (error) {
    throw providerHttpException(error);
  }
});

app.get('/v1/servers/:serverId/episode', async (c) => {
  await assertEnabledServer(c.env.DB, c.req.param('serverId'));
  const reference = c.req.query('ref')?.trim() ?? '';
  if (!reference || reference.length > 1000 || !reference.startsWith('/')) throw new HTTPException(400, { message: 'Referência inválida' });
  try {
    return c.json(await getProviderEpisode(c.req.param('serverId'), reference));
  } catch (error) {
    throw providerHttpException(error);
  }
});

app.get('/v1/news', async (c) => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const query = c.req.query('q')?.trim();
  const category = c.req.query('category')?.trim();
  const limit = clampInt(c.req.query('limit'), 30, 1, 100);
  if (query) { conditions.push('(title LIKE ? COLLATE NOCASE OR summary LIKE ? COLLATE NOCASE OR source_name LIKE ? COLLATE NOCASE)'); bindings.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  if (category) { conditions.push('category = ?'); bindings.push(category); }
  const rows = await all<Row>(c.env.DB, `SELECT id, slug, title, summary, category, source_name, source_url, image_url, image_allowed, published_at FROM news_articles${whereClause(conditions)} ORDER BY published_at DESC LIMIT ?`, ...bindings, limit);
  return c.json({ items: rows.map(newsArticle), count: rows.length });
});

app.get('/v1/news/:slug', async (c) => {
  const row = await first<Row>(c.env.DB, 'SELECT * FROM news_articles WHERE slug = ?', c.req.param('slug'));
  if (!row) throw new HTTPException(404, { message: 'Notícia não encontrada' });
  return c.json(newsArticle(row));
});

app.post('/v1/auth/register', async (c) => {
  const body = await readCredentials(c);
  const existing = await first<Row>(c.env.DB, 'SELECT id FROM users WHERE email = ? COLLATE NOCASE', body.email);
  if (existing) throw new HTTPException(409, { message: 'E-mail já cadastrado' });
  const salt = randomToken(16);
  const passwordHash = await hashPassword(body.password, salt);
  const userId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO users (id, email, password_salt, password_hash) VALUES (?, ?, ?, ?)').bind(userId, body.email, salt, passwordHash).run();
  return c.json(await createSession(c.env.DB, userId, body.email), 201);
});

app.post('/v1/auth/login', async (c) => {
  const body = await readCredentials(c);
  const user = await first<Row>(c.env.DB, 'SELECT id, email, password_salt, password_hash FROM users WHERE email = ? COLLATE NOCASE', body.email);
  if (!user || !(await verifyPassword(body.password, String(user.password_salt), String(user.password_hash)))) throw new HTTPException(401, { message: 'E-mail ou senha inválidos' });
  return c.json(await createSession(c.env.DB, String(user.id), String(user.email)));
});

const requireAuth = async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
  c.header('Cache-Control', 'private, no-store');
  const match = /^Bearer\s+([^\s]+)$/i.exec(c.req.header('Authorization') ?? '');
  const token = match?.[1] ?? '';
  if (!token || token.length > 512) throw new HTTPException(401, { message: 'Autenticação necessária' });
  const tokenHash = await digest(token);
  const user = await first<Row>(c.env.DB, `SELECT users.id, users.email FROM sessions INNER JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND julianday(sessions.expires_at) > julianday('now')`, tokenHash);
  if (!user) throw new HTTPException(401, { message: 'Sessão inválida ou expirada' });
  c.set('userId', String(user.id)); c.set('userEmail', String(user.email)); c.set('tokenHash', tokenHash); await next();
};

app.use('/v1/auth/logout', requireAuth);
app.post('/v1/auth/logout', async (c) => { await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.get('tokenHash')).run(); return c.json({ ok: true }); });
app.use('/v1/me', requireAuth);
app.use('/v1/me/*', requireAuth);

app.post('/v1/me/provider-links', async (c) => {
  const parsed = ConfirmProviderLinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: 'Confirmação ou referência inválida.' });
  try { return c.json(await confirmProviderLink(c.env.DB, c.get('userId'), parsed.data)); }
  catch (error) { throw error instanceof HTTPException ? error : providerHttpException(error); }
});

app.use('/v1/catalog/provider-data', requireAuth);
app.post('/v1/catalog/provider-data', async (c) => {
  const body = await c.req.json<{ serverId?: string; reference?: string; metadata?: unknown }>();
  const serverId = body.serverId?.trim() ?? '';
  const reference = body.reference?.trim() ?? '';
  await assertEnabledServer(c.env.DB, serverId);
  if (!reference || reference.length > 1000 || !reference.startsWith('/')) throw new HTTPException(400, { message: 'Referência do anime inválida' });
  try {
    const detail = await getProviderAnime(serverId, reference);
    const refreshedIdentity = await resolveProviderIdentity(c, {
      serverId,
      reference: detail.anime.reference,
      title: detail.anime.title,
      fallbackPostType: detail.postType,
      refresh: true
    });
    // The button explicitly requests a definitive synchronization. The
    // browser-provided result is validated and may fill/replace display data,
    // while persistIdentity still rejects conflicting canonical links.
    const identity = mergeLoadedMetadata(refreshedIdentity, parseLoadedProviderMetadata(body.metadata));
    if (!identity.imageUrl && !identity.synopsis) throw new HTTPException(503, { message: 'As fontes não retornaram capa ou sinopse. Nenhum dado foi aplicado.' });
    const saved = await persistIdentity(c.env.DB, identity, serverId, detail.anime.reference);
    const enrichedIdentity = saved.identity;
    const animeId = enrichedIdentity.canonicalId;
    const slug = saved.slug;
    return c.json({ ok: true, saved: true, anime: { id: animeId, slug, title: enrichedIdentity.canonicalTitle, imageUrl: enrichedIdentity.imageUrl, backdropUrl: enrichedIdentity.backdropUrl }, identity: enrichedIdentity, sources: { myanimelist: Boolean(enrichedIdentity.malId), anilist: Boolean(enrichedIdentity.anilistId), anidb: false }, savedAt: new Date().toISOString() });
  } catch (error) {
    throw error instanceof HTTPException ? error : providerHttpException(error);
  }
});

app.get('/v1/me', (c) => c.json({ id: c.get('userId'), email: c.get('userEmail') ?? null }));
app.put('/v1/me/provider-library', async (c) => {
  const parsed = ProviderSelectionSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: 'Referência do servidor inválida' });
  try {
    const saved = await saveProviderWork(c, parsed.data.serverId, parsed.data.reference, parsed.data.workSlug);
    await c.env.DB.prepare(`INSERT INTO user_library(id,user_id,anime_id,status) VALUES(?,?,?,'watchlist') ON CONFLICT(user_id,anime_id) DO NOTHING`).bind(crypto.randomUUID(), c.get('userId'), saved.identity.canonicalId).run();
    return c.json({ ok: true, animeId: saved.identity.canonicalId, slug: saved.slug });
  } catch (error) { throw error instanceof HTTPException ? error : providerHttpException(error); }
});
app.put('/v1/me/provider-progress', async (c) => {
  const parsed = ProviderProgressSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: 'Progresso ou referência inválidos' });
  const data = parsed.data;
  try {
    const saved = await saveProviderWork(c, data.serverId, data.reference, data.workSlug);
    const episode = saved.detail.seasons.find(s => s.number === data.seasonNumber)?.episodes.find(e => e.number === data.episodeNumber && canonicalReference(e.reference) === canonicalReference(data.episodeReference));
    if (!episode) throw new HTTPException(409, { message: 'O episódio não pertence a esta obra/temporada no servidor.' });
    const animeId = saved.identity.canonicalId;
    const sourceOrdinal = episodeOrdinal(saved.detail.seasons, data.seasonNumber, data.episodeNumber, data.episodeReference);
    const sourceTotal = saved.detail.seasons.reduce((total, season) => total + Math.max(season.episodes.length, 0), 0);
    let canonicalSeasons = await all<Row>(c.env.DB, 'SELECT id, number, title, episodes_count FROM anime_seasons WHERE anime_id=? ORDER BY number', animeId);
    const canonicalTotal = canonicalSeasons.reduce((total, season) => total + Math.max(Number(season.episodes_count ?? 0), 0), 0);

    // The first provider establishes a canonical season shape. If old data only
    // contains a partial shape, enrich it once the provider exposes more episodes.
    if (!canonicalSeasons.length || (sourceTotal > canonicalTotal && sourceOrdinal !== null)) {
      const seasonStatements = saved.detail.seasons.map((season) => c.env.DB.prepare(
        `INSERT INTO anime_seasons(id,anime_id,number,title,episodes_count) VALUES(?,?,?,?,?)
         ON CONFLICT(anime_id,number) DO UPDATE SET episodes_count = CASE
           WHEN anime_seasons.episodes_count < excluded.episodes_count THEN excluded.episodes_count
           ELSE anime_seasons.episodes_count END`
      ).bind(`${animeId}:s${season.number}`, animeId, season.number, season.title || `Temporada ${season.number}`, season.episodes.length));
      if (seasonStatements.length) await c.env.DB.batch(seasonStatements);
      canonicalSeasons = await all<Row>(c.env.DB, 'SELECT id, number, title, episodes_count FROM anime_seasons WHERE anime_id=? ORDER BY number', animeId);
    }

    const mapped = sourceOrdinal === null ? null : seasonEpisodeAtOrdinal(canonicalSeasons.map((row) => ({
      number: Number(row.number),
      episodesCount: Number(row.episodes_count ?? 0)
    })), sourceOrdinal);
    const targetSeasonNumber = mapped?.season.number ?? data.seasonNumber;
    const targetEpisodeNumber = mapped?.episodeNumber ?? data.episodeNumber;
    const targetSeason = canonicalSeasons.find((season) => Number(season.number) === targetSeasonNumber);
    const seasonId = String(targetSeason?.id ?? `${animeId}:s${targetSeasonNumber}`);
    const oldEpisode = await c.env.DB.prepare('SELECT id FROM episodes WHERE season_id=? AND number=?').bind(seasonId, targetEpisodeNumber).first<{id:string}>();
    const episodeId = oldEpisode?.id ?? `${seasonId}:e${targetEpisodeNumber}`;
    const position = Math.floor(data.positionSeconds), duration = Math.floor(data.durationSeconds);
    const completed = duration > 0 && position / duration >= .9 ? 1 : 0;
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO anime_seasons(id,anime_id,number,title,episodes_count) VALUES(?,?,?,?,?) ON CONFLICT(anime_id,number) DO NOTHING').bind(seasonId,animeId,targetSeasonNumber,`Temporada ${targetSeasonNumber}`,saved.detail.seasons.find(s => s.number === targetSeasonNumber)?.episodes.length ?? targetEpisodeNumber),
      c.env.DB.prepare('INSERT INTO episodes(id,season_id,number,title) VALUES(?,?,?,?) ON CONFLICT(season_id,number) DO NOTHING').bind(episodeId,seasonId,targetEpisodeNumber,episode.title),
      c.env.DB.prepare(`INSERT INTO user_episode_progress(id,user_id,episode_id,position_seconds,duration_seconds,completed) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,episode_id) DO UPDATE SET position_seconds=excluded.position_seconds,duration_seconds=excluded.duration_seconds,completed=excluded.completed,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(crypto.randomUUID(),c.get('userId'),episodeId,position,duration,completed)
    ]);
    return c.json({ ok: true, animeId, slug: saved.slug, episodeId, seasonNumber: targetSeasonNumber, episodeNumber: targetEpisodeNumber, episodeOrdinal: sourceOrdinal });
  } catch (error) { throw error instanceof HTTPException ? error : providerHttpException(error); }
});
app.get('/v1/me/library', async (c) => {
  const rows = await all<Row>(c.env.DB, `SELECT anime.id AS anime_id, anime.slug, anime.title, anime.year, anime.type, anime.genres, anime.score_basis_points, anime.image_url, user_library.status, user_library.updated_at FROM user_library INNER JOIN anime ON anime.id = user_library.anime_id WHERE user_library.user_id = ? ORDER BY user_library.updated_at DESC`, c.get('userId'));
  return c.json(rows.map((row) => ({ animeId: row.anime_id, slug: row.slug, title: row.title, year: row.year, type: row.type, genres: parseArray(row.genres), scoreBasisPoints: row.score_basis_points, status: row.status, imageUrl: typeof row.image_url === 'string' ? row.image_url : null, updatedAt: row.updated_at })));
});
app.put('/v1/me/library/:animeId', async (c) => {
  const body = await c.req.json<{ status?: string }>(); const status = body.status ?? 'watchlist';
  if (!['watchlist', 'watching', 'completed', 'paused', 'dropped'].includes(status)) throw new HTTPException(400, { message: 'Status da biblioteca inválido' });
  const exists = await first<Row>(c.env.DB, 'SELECT id FROM anime WHERE id = ?', c.req.param('animeId')); if (!exists) throw new HTTPException(404, { message: 'Anime não encontrado' });
  const id = crypto.randomUUID(); await c.env.DB.prepare(`INSERT INTO user_library (id, user_id, anime_id, status) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, anime_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP`).bind(id, c.get('userId'), exists.id, status).run();
  return c.json({ ok: true, animeId: exists.id, status });
});
app.delete('/v1/me/library/:animeId', async (c) => { await c.env.DB.prepare('DELETE FROM user_library WHERE user_id = ? AND anime_id = ?').bind(c.get('userId'), c.req.param('animeId')).run(); return c.json({ ok: true }); });
app.get('/v1/me/continue-watching', async (c) => {
  const rows = await all<Row>(c.env.DB, `SELECT * FROM (SELECT ROW_NUMBER() OVER (PARTITION BY anime.id ORDER BY julianday(user_episode_progress.updated_at) DESC, user_episode_progress.rowid DESC) AS rn, anime.id AS anime_id, anime.slug, anime.title, anime.type, anime.genres, anime.score_basis_points, anime.image_url, anime_seasons.number AS season_number, episodes.id AS episode_id, episodes.number AS episode_number, episodes.title AS episode_title, COALESCE((SELECT SUM(previous_season.episodes_count) FROM anime_seasons previous_season WHERE previous_season.anime_id = anime.id AND previous_season.number < anime_seasons.number), 0) + episodes.number AS episode_ordinal, user_episode_progress.position_seconds, user_episode_progress.duration_seconds, user_episode_progress.completed, user_episode_progress.updated_at FROM user_episode_progress INNER JOIN episodes ON episodes.id = user_episode_progress.episode_id INNER JOIN anime_seasons ON anime_seasons.id = episodes.season_id INNER JOIN anime ON anime.id = anime_seasons.anime_id WHERE user_episode_progress.user_id = ?  ) WHERE rn=1 AND completed=0 ORDER BY julianday(updated_at) DESC LIMIT 20`, c.get('userId'));
  return c.json(rows.map((row) => ({ animeId: row.anime_id, slug: row.slug, title: row.title, seasonNumber: row.season_number, episodeId: row.episode_id, episodeNumber: row.episode_number, episodeOrdinal: Number(row.episode_ordinal ?? 0) || undefined, episodeTitle: row.episode_title, positionSeconds: row.position_seconds, durationSeconds: row.duration_seconds, completed: Boolean(row.completed), type: row.type, genres: parseArray(row.genres), scoreBasisPoints: row.score_basis_points, imageUrl: typeof row.image_url === 'string' ? row.image_url : null, updatedAt: row.updated_at })));
});
app.put('/v1/me/progress/:episodeId', async (c) => {
  const body = await c.req.json<{ positionSeconds: number; durationSeconds: number }>(); const positionSeconds = Math.max(0, Math.floor(body.positionSeconds)); const durationSeconds = Math.max(0, Math.floor(body.durationSeconds));
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || positionSeconds > 604800 || durationSeconds > 604800 || (durationSeconds > 0 && positionSeconds > durationSeconds + 30)) throw new HTTPException(400, { message: 'Progresso inválido' });
  const exists = await first<Row>(c.env.DB, 'SELECT id FROM episodes WHERE id = ?', c.req.param('episodeId')); if (!exists) throw new HTTPException(404, { message: 'Episódio não encontrado' });
  const completed = durationSeconds > 0 && positionSeconds / durationSeconds >= 0.9 ? 1 : 0; const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO user_episode_progress (id, user_id, episode_id, position_seconds, duration_seconds, completed) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, episode_id) DO UPDATE SET position_seconds = excluded.position_seconds, duration_seconds = excluded.duration_seconds, completed = excluded.completed, updated_at = CURRENT_TIMESTAMP`).bind(id, c.get('userId'), exists.id, positionSeconds, durationSeconds, completed).run();
  return c.json({ ok: true, episodeId: exists.id, positionSeconds, durationSeconds, completed: Boolean(completed) });
});
app.get('/v1/me/saved-news', async (c) => {
  const rows = await all<Row>(c.env.DB, `SELECT news_articles.id, news_articles.slug, news_articles.title, news_articles.category, news_articles.source_name, news_articles.published_at FROM user_saved_news INNER JOIN news_articles ON news_articles.id = user_saved_news.article_id WHERE user_saved_news.user_id = ? ORDER BY user_saved_news.created_at DESC`, c.get('userId'));
  return c.json(rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title, category: row.category, sourceName: row.source_name, publishedAt: row.published_at })));
});
app.put('/v1/me/saved-news/:articleId', async (c) => { const article = await first<Row>(c.env.DB, 'SELECT id FROM news_articles WHERE id = ?', c.req.param('articleId')); if (!article) throw new HTTPException(404, { message: 'Notícia não encontrada' }); await c.env.DB.prepare('INSERT OR IGNORE INTO user_saved_news (id, user_id, article_id) VALUES (?, ?, ?)').bind(crypto.randomUUID(), c.get('userId'), article.id).run(); return c.json({ ok: true }); });
app.delete('/v1/me/saved-news/:articleId', async (c) => { await c.env.DB.prepare('DELETE FROM user_saved_news WHERE user_id = ? AND article_id = ?').bind(c.get('userId'), c.req.param('articleId')).run(); return c.json({ ok: true }); });

app.onError((error, c) => { if (error instanceof HTTPException) return c.json({ message: error.message }, error.status); if (error instanceof MalApiError) return c.json({ message: error.message }, error.status === 429 ? 503 : 502); console.error(error); return c.json({ message: 'Erro interno da API' }, 500); });

async function all<T extends Row>(db: D1Database, query: string, ...bindings: unknown[]) { return (await db.prepare(query).bind(...bindings).all<T>()).results; }
async function first<T extends Row>(db: D1Database, query: string, ...bindings: unknown[]) { return await db.prepare(query).bind(...bindings).first<T>(); }
function whereClause(conditions: string[]) { return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''; }
function parseArray(value: unknown): string[] { try { const parsed = JSON.parse(String(value ?? '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function parseObject(value: unknown): Record<string, unknown> { try { const parsed = JSON.parse(String(value ?? '{}')); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
function animeSummary(row: Row) { return { id: row.id, slug: row.slug, title: row.title, year: row.year, type: row.type, status: row.status, genres: parseArray(row.genres), scoreBasisPoints: row.score_basis_points, imageUrl: typeof row.image_url === 'string' ? row.image_url : null }; }
function animeDetail(row: Row) { return { ...animeSummary(row), titleEnglish: row.title_english, titleRomaji: row.title_romaji, titleNative: row.title_native, synopsis: row.synopsis }; }
function season(row: Row) { return { id: row.id, animeId: row.anime_id, number: row.number, title: row.title, episodesCount: row.episodes_count }; }
function episode(row: Row) { return { id: row.id, seasonId: row.season_id, number: row.number, title: row.title, durationSeconds: row.duration_seconds, airedAt: row.aired_at }; }
function source(row: Row) { return { id: row.id, url: row.url, mimeType: row.mime_type, label: row.label, headers: parseObject(row.headers), isDefault: Boolean(row.is_default) }; }

function parseMediaProxyTarget(value: string | undefined): string {
  if (!value || value.length > 2048 || !isMediaProxyTarget(value)) throw new HTTPException(400, { message: 'URL de mídia não permitida' });
  return new URL(value).toString();
}

function isMediaProxyTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MEDIA_PROXY_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function mediaProxyUrl(requestUrl: string, target: string): string {
  const url = new URL('/v1/media/proxy', requestUrl);
  url.searchParams.set('url', target);
  return url.toString();
}

function rewriteMediaPlaylist(playlist: string, baseUrl: string, requestUrl: string): string {
  return playlist.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/gi, (match, rawUrl: string) => {
        const absolute = resolveMediaUrl(rawUrl, baseUrl);
        return isMediaProxyTarget(absolute) ? `URI="${mediaProxyUrl(requestUrl, absolute)}"` : match;
      });
    }
    const absolute = resolveMediaUrl(trimmed, baseUrl);
    return isMediaProxyTarget(absolute) ? mediaProxyUrl(requestUrl, absolute) : line;
  }).join('\n');
}

function resolveMediaUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}
function newsArticle(row: Row) { return { id: row.id, slug: row.slug, title: row.title, summary: row.summary, category: row.category, sourceName: row.source_name, sourceUrl: row.source_url, imageUrl: row.image_allowed ? row.image_url : null, imageAllowed: Boolean(row.image_allowed), publishedAt: row.published_at }; }
async function readCredentials(c: Context) { const body = await c.req.json<{ email?: string; password?: string }>(); const email = body.email?.trim().toLowerCase() ?? ''; const password = body.password ?? ''; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256) throw new HTTPException(400, { message: 'E-mail ou senha inválidos' }); return { email, password }; }
async function createSession(db: D1Database, userId: string, email: string) { const token = randomToken(32); const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), userId, expiresAt).run(); return { session: { access_token: token, token_type: 'bearer', expires_in: 30 * 24 * 60 * 60, user: { id: userId, email } } }; }
function randomToken(size: number) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return bytesToBase64Url(bytes); }
function bytesToBase64Url(bytes: Uint8Array) { let binary = ''; bytes.forEach((value) => { binary += String.fromCharCode(value); }); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ToBytes(value: string) { const normalized = value.replace(/-/g, '+').replace(/_/g, '/'); const binary = atob(normalized); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
async function digest(value: string) { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return bytesToBase64Url(new Uint8Array(hash)); }
async function hashPassword(password: string, salt: string) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256); return bytesToBase64Url(new Uint8Array(bits)); }
async function verifyPassword(password: string, salt: string, expected: string) { return (await hashPassword(password, salt)) === expected; }
function clampInt(value: string | undefined, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback; }
function parsePositiveOptionalInt(value: string | undefined) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined; }
function validateProviderQuery(value: string) { if (value.length < 2 || value.length > 120) throw new HTTPException(400, { message: 'Consulta inválida' }); }
function positiveProviderInt(value: string | undefined, message: string) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100_000) throw new HTTPException(400, { message }); return parsed; }
function assertServerId(value: string) { if (!hasProvider(value)) throw new HTTPException(404, { message: 'Servidor não encontrado' }); }
function providerStatus(error: unknown): 'timeout' | 'error' { return error instanceof ProviderError && error.kind === 'timeout' ? 'timeout' : 'error'; }
function providerErrorCode(error: unknown): 'provider_unavailable' | 'provider_timeout' { return error instanceof ProviderError && error.kind === 'timeout' ? 'provider_timeout' : 'provider_unavailable'; }
function providerHttpException(error: unknown): HTTPException { return new HTTPException(error instanceof ProviderError && error.kind === 'timeout' ? 504 : 503, { message: error instanceof Error ? error.message : 'Provider indisponível' }); }
async function requireAdmin(c: Context, next: Next) {
  const expected = c.env.ADMIN_API_KEY;
  const authorization = c.req.header('authorization') ?? '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const provided = c.req.header('x-admin-key') ?? bearer;
  if (!expected || !provided || !constantTimeEqual(provided, expected)) throw new HTTPException(401, { message: 'Credencial administrativa inválida' });
  await next();
}
function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}
function appConfigState(row: Row) {
  const payload = parseObject(row.payload);
  return { version: Number(row.version ?? 1), mode: normalizeAppMode(row.mode), servers: normalizeServerConfig(payload.servers), updates: normalizeUpdateConfig(payload.updates), updatedAt: String(row.updated_at ?? new Date().toISOString()) };
}
function parseAdminAppConfig(value: unknown): WorkerAppConfig | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (input.mode !== 1 && input.mode !== 2) return null;
  return { mode: input.mode, servers: normalizeServerConfig(input.servers), updates: normalizeUpdateConfig(input.updates) };
}
function normalizeAppMode(value: unknown): 1 | 2 { return Number(value) === 2 ? 2 : 1; }
function boundedInt(value: unknown, min: number, max: number): number | null { return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null; }
function defaultServerConfig(): WorkerServerConfig[] {
  return listServerDescriptors().map((server) => ({ id: server.id, enabled: true, recommended: server.id === 'goyabu' }));
}
function normalizeServerConfig(value: unknown): WorkerServerConfig[] {
  const defaults = defaultServerConfig();
  if (!Array.isArray(value)) return defaults;
  const input = new Map(value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => [String(item.id), item]));
  return defaults.map((server) => ({ id: server.id, enabled: typeof input.get(server.id)?.enabled === 'boolean' ? Boolean(input.get(server.id)?.enabled) : server.enabled, recommended: typeof input.get(server.id)?.recommended === 'boolean' ? Boolean(input.get(server.id)?.recommended) : server.recommended }));
}
async function enabledServerDescriptors(db: D1Database) {
  const row = await first<Row>(db, 'SELECT payload FROM app_config WHERE id = 1');
  const configured = normalizeServerConfig(parseObject(row?.payload).servers);
  const enabled = new Set(configured.filter((server) => server.enabled).map((server) => server.id));
  return listServerDescriptors().filter((server) => enabled.has(server.id));
}
async function assertEnabledServer(db: D1Database, value: string) {
  assertServerId(value);
  if (!(await enabledServerDescriptors(db)).some((server) => server.id === value)) throw new HTTPException(404, { message: 'Servidor desativado no momento' });
}
function defaultUpdateConfig(): WorkerUpdateConfig { return { enabled: false, mode: 'direct', versionCode: 0, versionName: '', apkUrl: '', sha256: '', required: false, storeUrl: 'https://play.google.com/store/apps/details?id=com.nekoanimes.app' }; }
function normalizeUpdateConfig(value: unknown): WorkerUpdateConfig {
  const defaults = defaultUpdateConfig();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Record<string, unknown>;
  return { enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled, mode: input.mode === 'play_store' ? 'play_store' : 'direct', versionCode: boundedInt(input.versionCode, 0, 2_000_000_000) ?? defaults.versionCode, versionName: typeof input.versionName === 'string' ? input.versionName.slice(0, 64) : defaults.versionName, apkUrl: typeof input.apkUrl === 'string' ? input.apkUrl.slice(0, 2048) : defaults.apkUrl, sha256: typeof input.sha256 === 'string' ? input.sha256.toLowerCase().slice(0, 64) : defaults.sha256, required: typeof input.required === 'boolean' ? input.required : defaults.required, storeUrl: typeof input.storeUrl === 'string' ? input.storeUrl.slice(0, 2048) : defaults.storeUrl };
}
function parseUpdateConfig(value: unknown): WorkerUpdateConfig | null { const config = normalizeUpdateConfig(value); return config.enabled ? config : null; }
function report(row: Row) { return { id: row.id, userId: row.user_id, email: row.email, category: row.category, message: row.message, route: row.route, appVersion: row.app_version, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at }; }
// Android classifies drawer items by route; /continuar belongs to that secondary group.
function primaryNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'categories', label: 'Categorias', icon: 'category', route: '/categorias' }, { id: 'library', label: 'Minha lista', icon: 'library', route: '/lista' }, { id: 'continue', label: 'Continuar assistindo', icon: 'library', route: '/continuar' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }, { id: 'servers', label: 'Servidores', icon: 'server', route: '/servidores' }]; }
function secondaryNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'saved', label: 'Salvos', icon: 'bookmark', route: '/salvos' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }]; }

export default app;
