import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import * as schema from '../../api/src/database/schema/index';

type Db = ReturnType<typeof drizzle<typeof schema>>;
type App = Hono<{ Bindings: Env; Variables: { userId: string; userEmail?: string } }>;

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

app.get('/health/ready', async (c) => withDb(c.env, async (db) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok', service: 'neko-api', dependencies: { postgres: 'ok', redis: 'not-required-on-worker' }, timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'degraded', service: 'neko-api', dependencies: { postgres: 'error', redis: 'not-required-on-worker' }, timestamp: new Date().toISOString() }, 503);
  }
}));

app.get('/v1/app-manifest', async (c) => withDb(c.env, async (db) => {
  const [row] = await db.select().from(schema.appConfig).where(eq(schema.appConfig.id, 1)).limit(1);
  const payload = (row?.payload ?? {}) as Record<string, unknown>;
  const ads = isAdsConfig(payload.ads) ? payload.ads : defaultAds();
  const mode = row?.mode ?? c.env.APP_MODE ?? 'streaming';
  return c.json({
    schemaVersion: 1,
    configVersion: row?.version ?? 1,
    mode,
    webAppUrl: c.env.WEB_APP_URL,
    navigation: mode === 'news' ? newsNavigation() : streamingNavigation(),
    features: { player: mode === 'streaming', downloads: false, notifications: true, news: mode === 'news' },
    ads
  }, 200, { 'Cache-Control': 'no-store' });
}));

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

app.get('/v1/catalog/anime', async (c) => withDb(c.env, async (db) => {
  const conditions = [];
  const letter = c.req.query('letter');
  const query = c.req.query('q');
  const limit = clampInt(c.req.query('limit'), 50, 1, 100);
  if (letter && /^[A-Z]$/i.test(letter)) conditions.push(ilike(schema.anime.title, `${letter}%`));
  if (query?.trim()) {
    const q = `%${query.trim()}%`;
    conditions.push(or(ilike(schema.anime.title, q), ilike(schema.anime.titleEnglish, q), ilike(schema.anime.titleRomaji, q))!);
  }
  const items = await db.select({ id: schema.anime.id, slug: schema.anime.slug, title: schema.anime.title, year: schema.anime.year, type: schema.anime.type, status: schema.anime.status, genres: schema.anime.genres, scoreBasisPoints: schema.anime.scoreBasisPoints }).from(schema.anime).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(schema.anime.title)).limit(limit);
  return c.json({ items, count: items.length });
}));

app.get('/v1/catalog/anime/:slug', async (c) => withDb(c.env, async (db) => {
  const [item] = await db.select().from(schema.anime).where(eq(schema.anime.slug, c.req.param('slug'))).limit(1);
  if (!item) throw new HTTPException(404, { message: 'Anime não encontrado' });
  const [externalIds, seasons] = await Promise.all([
    db.select({ provider: schema.animeExternalIds.provider, externalId: schema.animeExternalIds.externalId }).from(schema.animeExternalIds).where(eq(schema.animeExternalIds.animeId, item.id)),
    db.select().from(schema.animeSeasons).where(eq(schema.animeSeasons.animeId, item.id)).orderBy(asc(schema.animeSeasons.number))
  ]);
  return c.json({ ...item, externalIds, seasons });
}));

app.get('/v1/catalog/seasons/:seasonId/episodes', async (c) => withDb(c.env, async (db) => {
  const seasonId = c.req.param('seasonId');
  const offset = Math.max(clampInt(c.req.query('offset'), 0, 0, 1_000_000), 0);
  const limit = clampInt(c.req.query('limit'), 10, 1, 50);
  const [season] = await db.select().from(schema.animeSeasons).where(eq(schema.animeSeasons.id, seasonId)).limit(1);
  if (!season) throw new HTTPException(404, { message: 'Temporada não encontrada' });
  const [items, countRows] = await Promise.all([
    db.select().from(schema.episodes).where(eq(schema.episodes.seasonId, seasonId)).orderBy(asc(schema.episodes.number)).offset(offset).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.episodes).where(eq(schema.episodes.seasonId, seasonId))
  ]);
  return c.json({ season, items, offset, limit, total: countRows[0]?.count ?? 0 });
}));

app.get('/v1/catalog/episodes/:episodeId/playback', async (c) => withDb(c.env, async (db) => {
  const episodeId = c.req.param('episodeId');
  const [episode] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId)).limit(1);
  if (!episode) throw new HTTPException(404, { message: 'Episódio não encontrado' });
  const sources = await db.select({ id: schema.episodeSources.id, url: schema.episodeSources.url, mimeType: schema.episodeSources.mimeType, label: schema.episodeSources.label, headers: schema.episodeSources.headers, isDefault: schema.episodeSources.isDefault }).from(schema.episodeSources).where(eq(schema.episodeSources.episodeId, episodeId)).orderBy(desc(schema.episodeSources.isDefault), asc(schema.episodeSources.label));
  if (!sources.length) throw new HTTPException(404, { message: 'Fonte de reprodução indisponível' });
  return c.json({ episode: { id: episode.id, number: episode.number, title: episode.title, durationSeconds: episode.durationSeconds }, sources });
}));

app.get('/v1/news', async (c) => withDb(c.env, async (db) => {
  const conditions = [];
  const query = c.req.query('q');
  const category = c.req.query('category');
  const limit = clampInt(c.req.query('limit'), 30, 1, 100);
  if (query?.trim()) { const q = `%${query.trim()}%`; conditions.push(or(ilike(schema.newsArticles.title, q), ilike(schema.newsArticles.summary, q), ilike(schema.newsArticles.sourceName, q))!); }
  if (category?.trim()) conditions.push(eq(schema.newsArticles.category, category.trim()));
  const items = await db.select({ id: schema.newsArticles.id, slug: schema.newsArticles.slug, title: schema.newsArticles.title, summary: schema.newsArticles.summary, category: schema.newsArticles.category, sourceName: schema.newsArticles.sourceName, sourceUrl: schema.newsArticles.sourceUrl, imageUrl: schema.newsArticles.imageUrl, imageAllowed: schema.newsArticles.imageAllowed, publishedAt: schema.newsArticles.publishedAt }).from(schema.newsArticles).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(schema.newsArticles.publishedAt)).limit(limit);
  return c.json({ items: items.map((item) => ({ ...item, imageUrl: item.imageAllowed ? item.imageUrl : null })), count: items.length });
}));

app.get('/v1/news/:slug', async (c) => withDb(c.env, async (db) => {
  const [item] = await db.select().from(schema.newsArticles).where(eq(schema.newsArticles.slug, c.req.param('slug'))).limit(1);
  if (!item) throw new HTTPException(404, { message: 'Notícia não encontrada' });
  return c.json({ ...item, imageUrl: item.imageAllowed ? item.imageUrl : null });
}));

const requireAuth = async (c: Context<{ Bindings: Env; Variables: { userId: string; userEmail?: string } }>, next: Next) => {
  const match = /^Bearer\s+([^\s]+)$/i.exec(c.req.header('Authorization') ?? '');
  const token = match?.[1] ?? '';
  if (!token || token.length > 8192 || !c.env.SUPABASE_URL || !c.env.SUPABASE_PUBLISHABLE_KEY) throw new HTTPException(401, { message: 'Autenticação necessária' });
  let response: Response;
  try { response = await fetch(new URL('/auth/v1/user', c.env.SUPABASE_URL), { headers: { apikey: c.env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}`, accept: 'application/json' } }); }
  catch { throw new HTTPException(503, { message: 'Serviço de autenticação indisponível' }); }
  if (!response.ok) throw new HTTPException(401, { message: 'Sessão inválida ou expirada' });
  const user = await response.json() as { id?: string; email?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new HTTPException(401, { message: 'Usuário inválido' });
  c.set('userId', user.id); c.set('userEmail', user.email); await next();
};

app.use('/v1/me', requireAuth);
app.use('/v1/me/*', requireAuth);

app.get('/v1/me', (c) => c.json({ id: c.get('userId'), email: c.get('userEmail') ?? null }));
app.get('/v1/me/library', async (c) => withDb(c.env, async (db) => c.json(await db.select({ animeId: schema.anime.id, slug: schema.anime.slug, title: schema.anime.title, year: schema.anime.year, genres: schema.anime.genres, status: schema.userLibrary.status, updatedAt: schema.userLibrary.updatedAt }).from(schema.userLibrary).innerJoin(schema.anime, eq(schema.userLibrary.animeId, schema.anime.id)).where(eq(schema.userLibrary.userId, c.get('userId'))).orderBy(desc(schema.userLibrary.updatedAt)))));
app.put('/v1/me/library/:animeId', async (c) => withDb(c.env, async (db) => {
  const body = await c.req.json<{ status?: string }>(); const status = body.status ?? 'watchlist';
  if (!['watchlist', 'watching', 'completed', 'paused', 'dropped'].includes(status)) throw new HTTPException(400, { message: 'Status da biblioteca inválido' });
  const [exists] = await db.select({ id: schema.anime.id }).from(schema.anime).where(eq(schema.anime.id, c.req.param('animeId'))).limit(1); if (!exists) throw new HTTPException(404, { message: 'Anime não encontrado' });
  const [row] = await db.insert(schema.userLibrary).values({ userId: c.get('userId'), animeId: exists.id, status, updatedAt: new Date() }).onConflictDoUpdate({ target: [schema.userLibrary.userId, schema.userLibrary.animeId], set: { status, updatedAt: new Date() } }).returning(); return c.json(row);
}));
app.delete('/v1/me/library/:animeId', async (c) => withDb(c.env, async (db) => { await db.delete(schema.userLibrary).where(and(eq(schema.userLibrary.userId, c.get('userId')), eq(schema.userLibrary.animeId, c.req.param('animeId')))); return c.json({ ok: true }); }));
app.get('/v1/me/continue-watching', async (c) => withDb(c.env, async (db) => c.json(await db.select({ animeId: schema.anime.id, slug: schema.anime.slug, title: schema.anime.title, seasonNumber: schema.animeSeasons.number, episodeId: schema.episodes.id, episodeNumber: schema.episodes.number, episodeTitle: schema.episodes.title, positionSeconds: schema.userEpisodeProgress.positionSeconds, durationSeconds: schema.userEpisodeProgress.durationSeconds, completed: schema.userEpisodeProgress.completed, updatedAt: schema.userEpisodeProgress.updatedAt }).from(schema.userEpisodeProgress).innerJoin(schema.episodes, eq(schema.userEpisodeProgress.episodeId, schema.episodes.id)).innerJoin(schema.animeSeasons, eq(schema.episodes.seasonId, schema.animeSeasons.id)).innerJoin(schema.anime, eq(schema.animeSeasons.animeId, schema.anime.id)).where(and(eq(schema.userEpisodeProgress.userId, c.get('userId')), eq(schema.userEpisodeProgress.completed, false))).orderBy(desc(schema.userEpisodeProgress.updatedAt)).limit(20))));
app.put('/v1/me/progress/:episodeId', async (c) => withDb(c.env, async (db) => {
  const body = await c.req.json<{ positionSeconds: number; durationSeconds: number }>(); const positionSeconds = Math.max(0, Math.floor(body.positionSeconds)); const durationSeconds = Math.max(0, Math.floor(body.durationSeconds));
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || positionSeconds > 604800 || durationSeconds > 604800 || (durationSeconds > 0 && positionSeconds > durationSeconds + 30)) throw new HTTPException(400, { message: 'Progresso inválido' });
  const [exists] = await db.select({ id: schema.episodes.id }).from(schema.episodes).where(eq(schema.episodes.id, c.req.param('episodeId'))).limit(1); if (!exists) throw new HTTPException(404, { message: 'Episódio não encontrado' });
  const completed = durationSeconds > 0 && positionSeconds / durationSeconds >= 0.9;
  const [row] = await db.insert(schema.userEpisodeProgress).values({ userId: c.get('userId'), episodeId: exists.id, positionSeconds, durationSeconds, completed, updatedAt: new Date() }).onConflictDoUpdate({ target: [schema.userEpisodeProgress.userId, schema.userEpisodeProgress.episodeId], set: { positionSeconds, durationSeconds, completed, updatedAt: new Date() } }).returning(); return c.json(row);
}));
app.get('/v1/me/saved-news', async (c) => withDb(c.env, async (db) => c.json(await db.select({ id: schema.newsArticles.id, slug: schema.newsArticles.slug, title: schema.newsArticles.title, category: schema.newsArticles.category, sourceName: schema.newsArticles.sourceName, publishedAt: schema.newsArticles.publishedAt }).from(schema.userSavedNews).innerJoin(schema.newsArticles, eq(schema.userSavedNews.articleId, schema.newsArticles.id)).where(eq(schema.userSavedNews.userId, c.get('userId'))).orderBy(desc(schema.userSavedNews.createdAt)))));
app.put('/v1/me/saved-news/:articleId', async (c) => withDb(c.env, async (db) => { const [article] = await db.select({ id: schema.newsArticles.id }).from(schema.newsArticles).where(eq(schema.newsArticles.id, c.req.param('articleId'))).limit(1); if (!article) throw new HTTPException(404, { message: 'Notícia não encontrada' }); await db.insert(schema.userSavedNews).values({ userId: c.get('userId'), articleId: article.id }).onConflictDoNothing(); return c.json({ ok: true }); }));
app.delete('/v1/me/saved-news/:articleId', async (c) => withDb(c.env, async (db) => { await db.delete(schema.userSavedNews).where(and(eq(schema.userSavedNews.userId, c.get('userId')), eq(schema.userSavedNews.articleId, c.req.param('articleId')))); return c.json({ ok: true }); }));

app.onError((error, c) => { if (error instanceof HTTPException) return c.json({ message: error.message }, error.status); console.error(error); return c.json({ message: 'Erro interno da API' }, 500); });

async function withDb<T>(env: Env, action: (db: Db) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5, connectionTimeoutMillis: 5_000 });
  const db = drizzle(pool, { schema });
  try { return await action(db); } finally { await pool.end(); }
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback; }
function defaultAds() { return { enabled: false, engine: 'max' as const, banner: { enabled: false }, appOpen: { enabled: false, minIntervalMinutes: 60, skipFirstOpens: 3 }, interstitial: { enabled: false, minIntervalMinutes: 30, maxPerSession: 2 } }; }
function isAdsConfig(value: unknown): value is ReturnType<typeof defaultAds> { return Boolean(value && typeof value === 'object' && 'enabled' in value && 'banner' in value && 'appOpen' in value && 'interstitial' in value); }
function streamingNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'catalog', label: 'A–Z', icon: 'catalog', route: '/catalogo' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'library', label: 'Lista', icon: 'library', route: '/lista' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }]; }
function newsNavigation() { return [{ id: 'home', label: 'Início', icon: 'home', route: '/' }, { id: 'search', label: 'Buscar', icon: 'search', route: '/buscar' }, { id: 'saved', label: 'Salvos', icon: 'bookmark', route: '/salvos' }, { id: 'account', label: 'Conta', icon: 'profile', route: '/conta' }]; }

export default app;
