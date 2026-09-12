import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import {
  ANIMES_DIGITAL,
  ProviderError,
  checkAnimesDigitalHealth,
  getAnimesDigitalAnime,
  getAnimesDigitalEpisode,
  listServerDescriptors,
  searchAnimesDigital
} from './server-providers';

type Variables = { userId: string; userEmail?: string; tokenHash?: string };
type App = Hono<{ Bindings: Env; Variables: Variables }>;
type Row = Record<string, unknown>;

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

app.get('/v1/catalog/anime', async (c) => {
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const letter = c.req.query('letter');
  const query = c.req.query('q')?.trim();
  const limit = clampInt(c.req.query('limit'), 50, 1, 100);
  if (letter && /^[A-Z]$/i.test(letter)) { conditions.push('title LIKE ? COLLATE NOCASE'); bindings.push(`${letter}%`); }
  if (query) { conditions.push('(title LIKE ? COLLATE NOCASE OR title_english LIKE ? COLLATE NOCASE OR title_romaji LIKE ? COLLATE NOCASE)'); bindings.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  const rows = await all<Row>(c.env.DB, `SELECT id, slug, title, year, type, status, genres, score_basis_points FROM anime${whereClause(conditions)} ORDER BY title COLLATE NOCASE LIMIT ?`, ...bindings, limit);
  return c.json({ items: rows.map(animeSummary), count: rows.length });
});

app.get('/v1/catalog/anime/:slug', async (c) => {
  const item = await first<Row>(c.env.DB, 'SELECT * FROM anime WHERE slug = ?', c.req.param('slug'));
  if (!item) throw new HTTPException(404, { message: 'Anime não encontrado' });
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

app.get('/v1/servers/health', async (c) => c.json({ servers: [await checkAnimesDigitalHealth()], checkedAt: new Date().toISOString() }));

app.get('/v1/servers/search', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  validateProviderQuery(query);
  try {
    const matches = await searchAnimesDigital(query);
    return c.json({
      query,
      servers: [{ server: ANIMES_DIGITAL, status: matches.length ? 'ok' : 'unavailable', matches }],
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return c.json(providerSearchError(query, error), 200);
  }
});

app.get('/v1/servers/resolve/:query/:season/:episode', async (c) => {
  const query = decodeURIComponent(c.req.param('query')).trim();
  validateProviderQuery(query);
  const seasonNumber = positiveProviderInt(c.req.param('season'), 'Temporada inválida');
  const episodeNumber = positiveProviderInt(c.req.param('episode'), 'Episódio inválido');
  let search;
  try {
    search = await searchAnimesDigital(query);
  } catch (error) {
    return c.json({ query, season: seasonNumber, episode: episodeNumber, servers: [{ server: ANIMES_DIGITAL, status: providerStatus(error), available: false, error: providerErrorCode(error) }], fetchedAt: new Date().toISOString() }, 200);
  }

  const match = search[0];
  if (!match) return c.json({ query, season: seasonNumber, episode: episodeNumber, servers: [{ server: ANIMES_DIGITAL, status: 'unavailable', available: false, error: 'provider_unavailable' }], fetchedAt: new Date().toISOString() }, 200);
  try {
    const detail = await getAnimesDigitalAnime(match.reference);
    const episode = detail.seasons.find((item) => item.number === seasonNumber)?.episodes.find((item) => item.number === episodeNumber);
    return c.json({ query, season: seasonNumber, episode: episodeNumber, servers: [{ server: ANIMES_DIGITAL, status: 'ok', available: Boolean(episode), anime: match, ...(episode ? { episode } : {}) }], fetchedAt: new Date().toISOString() }, 200);
  } catch (error) {
    return c.json({ query, season: seasonNumber, episode: episodeNumber, servers: [{ server: ANIMES_DIGITAL, status: providerStatus(error), available: false, anime: match, error: providerErrorCode(error) }], fetchedAt: new Date().toISOString() }, 200);
  }
});

app.get('/v1/servers/:serverId/anime', async (c) => {
  assertServerId(c.req.param('serverId'));
  const reference = c.req.query('ref')?.trim() ?? '';
  if (!reference || reference.length > 1000 || !reference.startsWith('/')) throw new HTTPException(400, { message: 'Referência inválida' });
  try {
    return c.json(await getAnimesDigitalAnime(reference));
  } catch (error) {
    throw providerHttpException(error);
  }
});

app.get('/v1/servers/:serverId/episode', async (c) => {
  assertServerId(c.req.param('serverId'));
  const reference = c.req.query('ref')?.trim() ?? '';
  if (!reference || reference.length > 1000 || !reference.startsWith('/')) throw new HTTPException(400, { message: 'Referência inválida' });
  try {
    return c.json(await getAnimesDigitalEpisode(reference));
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

app.get('/v1/me', (c) => c.json({ id: c.get('userId'), email: c.get('userEmail') ?? null }));
app.get('/v1/me/library', async (c) => {
  const rows = await all<Row>(c.env.DB, `SELECT anime.id AS anime_id, anime.slug, anime.title, anime.year, anime.genres, user_library.status, user_library.updated_at FROM user_library INNER JOIN anime ON anime.id = user_library.anime_id WHERE user_library.user_id = ? ORDER BY user_library.updated_at DESC`, c.get('userId'));
  return c.json(rows.map((row) => ({ animeId: row.anime_id, slug: row.slug, title: row.title, year: row.year, genres: parseArray(row.genres), status: row.status, updatedAt: row.updated_at })));
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
  const rows = await all<Row>(c.env.DB, `SELECT anime.id AS anime_id, anime.slug, anime.title, anime_seasons.number AS season_number, episodes.id AS episode_id, episodes.number AS episode_number, episodes.title AS episode_title, user_episode_progress.position_seconds, user_episode_progress.duration_seconds, user_episode_progress.completed, user_episode_progress.updated_at FROM user_episode_progress INNER JOIN episodes ON episodes.id = user_episode_progress.episode_id INNER JOIN anime_seasons ON anime_seasons.id = episodes.season_id INNER JOIN anime ON anime.id = anime_seasons.anime_id WHERE user_episode_progress.user_id = ? AND user_episode_progress.completed = 0 ORDER BY user_episode_progress.updated_at DESC LIMIT 20`, c.get('userId'));
  return c.json(rows.map((row) => ({ animeId: row.anime_id, slug: row.slug, title: row.title, seasonNumber: row.season_number, episodeId: row.episode_id, episodeNumber: row.episode_number, episodeTitle: row.episode_title, positionSeconds: row.position_seconds, durationSeconds: row.duration_seconds, completed: Boolean(row.completed), updatedAt: row.updated_at })));
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

app.onError((error, c) => { if (error instanceof HTTPException) return c.json({ message: error.message }, error.status); console.error(error); return c.json({ message: 'Erro interno da API' }, 500); });

async function all<T extends Row>(db: D1Database, query: string, ...bindings: unknown[]) { return (await db.prepare(query).bind(...bindings).all<T>()).results; }
async function first<T extends Row>(db: D1Database, query: string, ...bindings: unknown[]) { return await db.prepare(query).bind(...bindings).first<T>(); }
function whereClause(conditions: string[]) { return conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''; }
function parseArray(value: unknown): string[] { try { const parsed = JSON.parse(String(value ?? '[]')); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function parseObject(value: unknown): Record<string, unknown> { try { const parsed = JSON.parse(String(value ?? '{}')); return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
function animeSummary(row: Row) { return { id: row.id, slug: row.slug, title: row.title, year: row.year, type: row.type, status: row.status, genres: parseArray(row.genres), scoreBasisPoints: row.score_basis_points }; }
function animeDetail(row: Row) { return { ...animeSummary(row), titleEnglish: row.title_english, titleRomaji: row.title_romaji, titleNative: row.title_native, synopsis: row.synopsis }; }
function season(row: Row) { return { id: row.id, animeId: row.anime_id, number: row.number, title: row.title, episodesCount: row.episodes_count }; }
function episode(row: Row) { return { id: row.id, seasonId: row.season_id, number: row.number, title: row.title, durationSeconds: row.duration_seconds, airedAt: row.aired_at }; }
function source(row: Row) { return { id: row.id, url: row.url, mimeType: row.mime_type, label: row.label, headers: parseObject(row.headers), isDefault: Boolean(row.is_default) }; }
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
function validateProviderQuery(value: string) { if (value.length < 2 || value.length > 120) throw new HTTPException(400, { message: 'Consulta inválida' }); }
function positiveProviderInt(value: string | undefined, message: string) { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100_000) throw new HTTPException(400, { message }); return parsed; }
function assertServerId(value: string) { if (value !== ANIMES_DIGITAL.id) throw new HTTPException(404, { message: 'Servidor não encontrado' }); }
function providerStatus(error: unknown): 'timeout' | 'error' { return error instanceof ProviderError && error.kind === 'timeout' ? 'timeout' : 'error'; }
function providerErrorCode(error: unknown): 'provider_unavailable' | 'provider_timeout' { return error instanceof ProviderError && error.kind === 'timeout' ? 'provider_timeout' : 'provider_unavailable'; }
function providerSearchError(query: string, error: unknown) { return { query, servers: [{ server: ANIMES_DIGITAL, status: providerStatus(error), matches: [], error: providerErrorCode(error) }], fetchedAt: new Date().toISOString() }; }
function providerHttpException(error: unknown): HTTPException { return new HTTPException(error instanceof ProviderError && error.kind === 'timeout' ? 504 : 503, { message: error instanceof Error ? error.message : 'Provider indisponível' }); }
function defaultAds() { return { enabled: false, engine: 'max' as const, banner: { enabled: false }, appOpen: { enabled: false, minIntervalMinutes: 60, skipFirstOpens: 3 }, interstitial: { enabled: false, minIntervalMinutes: 30, maxPerSession: 2 } }; }
function isAdsConfig(value: unknown): value is ReturnType<typeof defaultAds> { return Boolean(value && typeof value === 'object' && 'enabled' in value && 'banner' in value && 'appOpen' in value && 'interstitial' in value); }
function streamingNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'catalog', label: 'A–Z', icon: 'catalog', route: '/catalogo' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'library', label: 'Lista', icon: 'library', route: '/lista' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }]; }
function newsNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'saved', label: 'Salvos', icon: 'bookmark', route: '/salvos' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }]; }

export default app;
