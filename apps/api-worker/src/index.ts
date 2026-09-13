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
import { resolveProviderIdentity } from './provider-identity';

type Variables = { userId: string; userEmail?: string; tokenHash?: string };
type App = Hono<{ Bindings: Env; Variables: Variables }>;
type Row = Record<string, unknown>;
const MEDIA_PROXY_HOSTS = new Set(['cdn.imagesskill.com']);

const app: App = new Hono();

app.use('*', async (c, next) => {
  const configuredUrl = c.env?.WEB_APP_URL;
  const allowed = configuredUrl ? new URL(configuredUrl).origin : '';
  return cors({
    origin: allowed,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
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
  const mode = row?.mode === 'news' ? 'news' : 'streaming';
  return c.json({
    schemaVersion: 1,
    configVersion: Number(row?.version ?? 1),
    mode,
    webAppUrl: c.env.WEB_APP_URL,
    navigation: mode === 'news' ? newsNavigation() : streamingNavigation(),
    features: { player: mode === 'streaming', downloads: false, notifications: true, news: mode === 'news' },
    ads: isAdsConfig(payload.ads) ? payload.ads : defaultAds()
  }, 200, { 'Cache-Control': 'no-store' });
});

app.get('/v1/app-update/android', (c) => {
  const versionCode = Number(c.env.ANDROID_LATEST_VERSION_CODE);
  const versionName = c.env.ANDROID_LATEST_VERSION_NAME;
  const apkUrl = c.env.ANDROID_APK_URL;
  const sha256 = c.env.ANDROID_APK_SHA256?.toLowerCase();
  if (!Number.isInteger(versionCode) || versionCode < 1 || !versionName || !apkUrl || !sha256 || !/^[a-f0-9]{64}$/.test(sha256)) {
    return c.json({ message: 'Canal de atualização Android ainda não publicado' }, 503);
  }
  return c.json({ platform: 'android', channel: 'direct', versionCode, versionName, apkUrl, sha256, required: c.env.ANDROID_UPDATE_REQUIRED === 'true' }, 200, { 'Cache-Control': 'no-store' });
});

app.get('/v1/media/proxy', async (c) => {
  const target = parseMediaProxyTarget(c.req.query('url'));
  const response = await fetch(target, {
    redirect: 'follow',
    headers: { accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,video/*,*/*' }
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

app.get('/v1/servers', (c) => c.json({ servers: listServerDescriptors() }));

app.get('/v1/servers/health', async (c) => c.json({ servers: await Promise.all(listServerDescriptors().map((server) => checkProviderHealth(server.id))), checkedAt: new Date().toISOString() }));

app.get('/v1/servers/search', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  validateProviderQuery(query);
  try {
    const servers = await Promise.all(listServerDescriptors().map(async (server) => {
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
app.get('/v1/servers/:serverId/catalog', async (c) => {
  const serverId = c.req.param('serverId');
  assertServerId(serverId);
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
    const server = listServerDescriptors().find((item) => item.id === serverId)!;
    return c.json({ server, items: browse.items.slice(0, limit), count: Math.min(browse.items.length, limit), page, pageSize: limit, hasNextPage: browse.hasNextPage, source: 'provider', fetchedAt: new Date().toISOString() }, 200, { 'Cache-Control': 'public, max-age=120' });
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
  const search = await Promise.all(listServerDescriptors().map(async (server) => {
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
    search = await Promise.all(listServerDescriptors().map(async (server) => {
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
  assertServerId(serverId);
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
  assertServerId(serverId);
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

app.get('/v1/servers/:serverId/anime', async (c) => {
  assertServerId(c.req.param('serverId'));
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
  assertServerId(c.req.param('serverId'));
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

app.use('/v1/catalog/provider-data', requireAuth);
app.post('/v1/catalog/provider-data', async (c) => {
  const body = await c.req.json<{ serverId?: string; reference?: string }>();
  const serverId = body.serverId?.trim() ?? '';
  const reference = body.reference?.trim() ?? '';
  assertServerId(serverId);
  if (!reference || reference.length > 1000 || !reference.startsWith('/')) throw new HTTPException(400, { message: 'Referência do anime inválida' });
  try {
    const detail = await getProviderAnime(serverId, reference);
    const identity = await resolveProviderIdentity(c, {
      serverId,
      reference: detail.anime.reference,
      title: detail.anime.title,
      fallbackPostType: detail.postType
    });
    const animeId = identity.canonicalId;
    const slug = await uniqueAnimeSlug(c.env.DB, savedAnimeSlug(identity, detail.anime.title, serverId), animeId);
    const status = identity.status ?? 'unknown';
    const type = identity.postType === 'filme' ? 'movie' : identity.postType === 'manga' ? 'manga' : 'tv';
    await c.env.DB.prepare(`INSERT INTO anime (id, slug, title, title_english, title_romaji, title_native, synopsis, type, status, year, score_basis_points, genres, image_url, backdrop_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, title = excluded.title, title_english = excluded.title_english, title_romaji = excluded.title_romaji, title_native = excluded.title_native, synopsis = excluded.synopsis, type = excluded.type, status = excluded.status, year = excluded.year, score_basis_points = excluded.score_basis_points, genres = excluded.genres, image_url = excluded.image_url, backdrop_url = excluded.backdrop_url, updated_at = CURRENT_TIMESTAMP`)
      .bind(animeId, slug, identity.canonicalTitle, identity.titleEnglish, identity.titleRomaji, identity.titleNative, identity.synopsis, type, status, identity.year, identity.scoreBasisPoints, JSON.stringify(identity.genres), identity.imageUrl, identity.backdropUrl)
      .run();
    const externalIds = [
      { provider: serverId, externalId: detail.anime.reference },
      ...(identity.malId ? [{ provider: 'myanimelist', externalId: String(identity.malId) }] : []),
      ...(identity.anilistId ? [{ provider: 'anilist', externalId: String(identity.anilistId) }] : [])
    ];
    for (const external of externalIds) {
      await c.env.DB.prepare(`INSERT INTO anime_external_ids (id, anime_id, provider, external_id) VALUES (?, ?, ?, ?)
        ON CONFLICT(provider, external_id) DO UPDATE SET anime_id = excluded.anime_id`)
        .bind(crypto.randomUUID(), animeId, external.provider, external.externalId)
        .run();
    }
    return c.json({ ok: true, saved: true, anime: { id: animeId, slug, title: identity.canonicalTitle, imageUrl: identity.imageUrl, backdropUrl: identity.backdropUrl }, identity, sources: { myanimelist: Boolean(identity.malId), anilist: Boolean(identity.anilistId), anidb: false }, savedAt: new Date().toISOString() });
  } catch (error) {
    throw error instanceof HTTPException ? error : providerHttpException(error);
  }
});

app.get('/v1/me', (c) => c.json({ id: c.get('userId'), email: c.get('userEmail') ?? null }));
app.get('/v1/me/library', async (c) => {
  const rows = await all<Row>(c.env.DB, `SELECT anime.id AS anime_id, anime.slug, anime.title, anime.year, anime.genres, anime.image_url, user_library.status, user_library.updated_at FROM user_library INNER JOIN anime ON anime.id = user_library.anime_id WHERE user_library.user_id = ? ORDER BY user_library.updated_at DESC`, c.get('userId'));
  return c.json(rows.map((row) => ({ animeId: row.anime_id, slug: row.slug, title: row.title, year: row.year, genres: parseArray(row.genres), status: row.status, imageUrl: typeof row.image_url === 'string' ? row.image_url : null, updatedAt: row.updated_at })));
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
  const rows = await all<Row>(c.env.DB, `SELECT anime.id AS anime_id, anime.slug, anime.title, anime.image_url, anime_seasons.number AS season_number, episodes.id AS episode_id, episodes.number AS episode_number, episodes.title AS episode_title, user_episode_progress.position_seconds, user_episode_progress.duration_seconds, user_episode_progress.completed, user_episode_progress.updated_at FROM user_episode_progress INNER JOIN episodes ON episodes.id = user_episode_progress.episode_id INNER JOIN anime_seasons ON anime_seasons.id = episodes.season_id INNER JOIN anime ON anime.id = anime_seasons.anime_id WHERE user_episode_progress.user_id = ? AND user_episode_progress.completed = 0 ORDER BY user_episode_progress.updated_at DESC LIMIT 20`, c.get('userId'));
  return c.json(rows.map((row) => ({ animeId: row.anime_id, slug: row.slug, title: row.title, seasonNumber: row.season_number, episodeId: row.episode_id, episodeNumber: row.episode_number, episodeTitle: row.episode_title, positionSeconds: row.position_seconds, durationSeconds: row.duration_seconds, completed: Boolean(row.completed), imageUrl: typeof row.image_url === 'string' ? row.image_url : null, updatedAt: row.updated_at })));
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
async function uniqueAnimeSlug(db: D1Database, baseSlug: string, animeId: string): Promise<string> {
  const existing = await first<Row>(db, 'SELECT id FROM anime WHERE slug = ?', baseSlug);
  if (!existing || String(existing.id) === animeId) return baseSlug;
  return `${baseSlug}-${animeId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
}
function savedAnimeSlug(identity: { malId: number | null; anilistId: number | null }, title: string, serverId: string): string {
  if (identity.malId) return `mal-${identity.malId}`;
  if (identity.anilistId) return `anilist-${identity.anilistId}`;
  const titleSlug = title.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'anime';
  return `provider-${serverId}-${titleSlug}`;
}
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
function defaultAds() { return { enabled: false, engine: 'max' as const, banner: { enabled: false }, appOpen: { enabled: false, minIntervalMinutes: 60, skipFirstOpens: 3 }, interstitial: { enabled: false, minIntervalMinutes: 30, maxPerSession: 2 } }; }
function isAdsConfig(value: unknown): value is ReturnType<typeof defaultAds> { return Boolean(value && typeof value === 'object' && 'enabled' in value && 'banner' in value && 'appOpen' in value && 'interstitial' in value); }
function streamingNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'categories', label: 'Categorias', icon: 'category', route: '/categorias' }, { id: 'library', label: 'Lista', icon: 'library', route: '/lista' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }, { id: 'servers', label: 'Servidores', icon: 'server', route: '/servidores' }]; }
function newsNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'saved', label: 'Salvos', icon: 'bookmark', route: '/salvos' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }]; }

export default app;
