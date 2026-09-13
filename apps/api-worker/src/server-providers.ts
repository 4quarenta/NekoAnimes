export type ServerResultStatus = 'ok' | 'unavailable' | 'timeout' | 'error';

export type ServerDescriptor = {
  id: string;
  name: string;
  baseUrl: string;
  capabilities: {
    search: boolean;
    anime: boolean;
    episodes: boolean;
    playback: boolean;
  };
};

export type ServerAnimeMatch = {
  serverId: string;
  serverName: string;
  title: string;
  reference: string;
  url: string;
  confidence: number;
  postType: 'anime' | 'filme' | 'manga';
};

export type ServerEpisode = {
  id: string;
  title: string;
  number: number;
  seasonNumber: number;
  reference: string;
  url: string;
  available: boolean;
  sources?: ProviderPlaybackSource[];
};

export type ProviderPlaybackSource = {
  id: string;
  url: string;
  mimeType?: string;
  label: string;
  headers: Record<string, string>;
  isDefault: boolean;
  kind: 'direct' | 'embed';
};

export type ServerSeason = {
  id: string;
  number: number;
  title: string;
  episodes: ServerEpisode[];
};

export type ServerAnimeDetail = {
  server: ServerDescriptor;
  anime: {
    title: string;
    reference: string;
    url: string;
    year?: number;
  };
  seasons: ServerSeason[];
  fetchedAt: string;
  postType: 'anime' | 'filme' | 'manga';
};

type HtmlAnchor = { href: string; text: string };
type ProviderResponse = { html: string; url: string };
type ProviderConfig = ServerDescriptor & {
  searchPath: (query: string) => string;
  catalogPath: (letter?: string, genre?: string, page?: number) => string;
  fallbackAnimePath: (query: string) => string;
  isAnimeReference: (reference: string) => boolean;
  isEpisodeReference: (reference: string) => boolean;
  cleanTitle: (title: string) => string;
};

export const ANIMES_DIGITAL: ProviderConfig = {
  id: 'animesdigital',
  name: 'Animes Digital',
  baseUrl: 'https://animesdigital.org',
  capabilities: { search: true, anime: true, episodes: true, playback: true },
  searchPath: (query) => `/?s=${encodeURIComponent(query)}`,
  catalogPath: (letter, genre, page) => genre ? `/genero/${providerGenreSlug(genre)}${page && page > 1 ? `/page/${page}` : ''}/` : `/?s=${letter ? letter.toLowerCase() : 'an'}${page && page > 1 ? `&paged=${page}` : ''}`,
  fallbackAnimePath: (query) => `/anime/a/${slugify(query)}`,
  isAnimeReference: (reference) => reference.startsWith('/anime/a/'),
  isEpisodeReference: (reference) => reference.startsWith('/video/a/') || /^\/\?p=\d+$/i.test(reference),
  cleanTitle: cleanAnimeTitle
};

export const ANIMES_ONLINE_CC: ProviderConfig = {
  id: 'animesonlinecc',
  name: 'Animes Online',
  baseUrl: 'https://animesonlinecc.to',
  capabilities: { search: true, anime: true, episodes: true, playback: true },
  searchPath: (query) => `/?s=${encodeURIComponent(query)}`,
  catalogPath: (letter, genre, page) => genre ? `/genero/${providerGenreSlug(genre)}${page && page > 1 ? `/page/${page}` : ''}/` : letter ? `/genero/letra-${letter.toLowerCase()}${page && page > 1 ? `/page/${page}` : ''}/` : `/anime/${page && page > 1 ? `page/${page}/` : ''}`,
  fallbackAnimePath: (query) => `/anime/${slugify(query)}`,
  isAnimeReference: (reference) => reference.startsWith('/anime/'),
  isEpisodeReference: (reference) => reference.includes('/episodio/'),
  cleanTitle: (title) => cleanAnimeTitle(title).replace(/\s+todos\s+os\s+epis[oó]dios\s+online$/i, '').replace(/\s+online$/i, '').trim()
};

export const GOYABU: ProviderConfig = {
  id: 'goyabu',
  name: 'Goyabu',
  baseUrl: 'https://goyabu.io',
  capabilities: { search: true, anime: true, episodes: true, playback: true },
  searchPath: (query) => `/?s=${encodeURIComponent(query)}`,
  catalogPath: (letter, genre, page) => genre ? `/generos/${providerGenreSlug(genre)}${page && page > 1 ? `/page/${page}` : ''}` : `/lista-de-animes?l=${letter?.toLowerCase() ?? 'todos'}${page && page > 1 ? `&paged=${page}` : ''}`,
  fallbackAnimePath: (query) => `/anime/${slugify(query)}`,
  isAnimeReference: (reference) => reference.startsWith('/anime/'),
  isEpisodeReference: (reference) => /^\/\d+\/?(?:\?.*)?$/.test(reference) || reference.includes('/episodio/'),
  cleanTitle: (title) => cleanAnimeTitle(title).replace(/^assistir\s+/i, '').replace(/\s+todos\s+os\s+epis[oó]dios\s+online\.?$/i, '').trim()
};

const PROVIDERS: ProviderConfig[] = [GOYABU, ANIMES_ONLINE_CC, ANIMES_DIGITAL];

const MAX_HTML_BYTES = 4_000_000;
const DEFAULT_TIMEOUT_MS = 12_000;

export class ProviderError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'unavailable') {
    super(message);
    this.name = kind === 'timeout' ? 'TimeoutError' : 'ProviderError';
  }
}

export function listServerDescriptors(): ServerDescriptor[] {
  return PROVIDERS.map(({ searchPath: _searchPath, catalogPath: _catalogPath, fallbackAnimePath: _fallbackAnimePath, isAnimeReference: _isAnimeReference, isEpisodeReference: _isEpisodeReference, cleanTitle: _cleanTitle, ...descriptor }) => descriptor);
}

export function hasProvider(serverId: string): boolean {
  return PROVIDERS.some((provider) => provider.id === serverId);
}

export async function searchProvider(serverId: string, query: string): Promise<ServerAnimeMatch[]> {
  const provider = getProvider(serverId);
  const response = await getProviderHtml(provider, provider.searchPath(query));
  const matches = extractAnimeMatches(provider, query, parseAnchors(response.html));
  if (matches.length > 0) return matches.slice(0, 10);

  const fallbackReference = provider.fallbackAnimePath(query);
  try {
    const detail = await getProviderHtml(provider, fallbackReference);
    const title = provider.cleanTitle(parseH1(detail.html) ?? query);
    const confidence = scoreTitleMatch(query, title);
    return confidence >= 0.45 ? [toAnimeMatch(provider, title, detail.url, confidence)] : [];
  } catch {
    return [];
  }
}

export async function browseProvider(serverId: string, options: { letter?: string; genre?: string; page?: number; limit?: number } = {}): Promise<{ items: ServerAnimeMatch[]; hasNextPage: boolean }> {
  const provider = getProvider(serverId);
  const page = options.page ?? 1;
  const response = await getProviderHtml(provider, provider.catalogPath(options.letter, options.genre, page));
  let matches = extractBrowseMatches(provider, parseAnchors(response.html));
  let hasNextPage = hasProviderNextPage(provider, parseAnchors(response.html), page);
  const letter = options.letter?.toLowerCase();
  matches = matches.filter((match) => !letter || normalizeForMatch(match.title).startsWith(letter));
  // Animes Digital does not expose a stable all-titles/letter endpoint. Its
  // own search is the fallback for A-Z, still filtered to the requested letter.
  if (!matches.length && letter && provider.id === 'animesdigital') {
    matches = (await searchProvider(serverId, `${letter}n`)).filter((match) => normalizeForMatch(match.title).startsWith(letter));
  }
  if (matches.length > (options.limit ?? 50)) hasNextPage = true;
  return { items: matches.slice(0, options.limit ?? 50), hasNextPage };
}

export async function getProviderAnime(serverId: string, reference: string): Promise<ServerAnimeDetail> {
  const provider = getProvider(serverId);
  const safeReference = assertReference(provider, reference, 'anime');
  const response = await getProviderHtml(provider, safeReference);
  const title = provider.cleanTitle(parseH1(response.html) ?? lastPathPart(safeReference) ?? 'Anime');
  const anchors = parseAnchors(response.html);
  const episodes = [...extractEpisodeCandidates(provider, anchors, 2), ...extractScriptEpisodeCandidates(provider, response.html, 2)];

  // Some provider pages expose seasons as links. Keep the number of follow-up
  // requests bounded because this endpoint is called from a public Worker.
  const seasonReferences = extractSeasonReferences(provider, anchors).slice(0, 12);
  const seasonPages = await Promise.allSettled(
    seasonReferences.map(async ({ reference: seasonReference, number }) => {
      const seasonPage = await getProviderHtml(provider, seasonReference);
      return extractEpisodeCandidates(provider, parseAnchors(seasonPage.html), 3, number);
    })
  );

  for (const result of seasonPages) {
    if (result.status === 'fulfilled') episodes.push(...result.value);
  }

  return {
    server: provider,
    anime: {
      title,
      reference: referenceFromUrl(provider, response.url),
      url: response.url,
      year: parseYear(pageText(response.html))
    },
    seasons: groupEpisodes(provider, episodes),
    fetchedAt: new Date().toISOString(),
    postType: inferPostType(title, safeReference)
  };
}

export async function getProviderEpisode(serverId: string, reference: string) {
  const provider = getProvider(serverId);
  const safeReference = assertReference(provider, reference, 'episode');
  const response = await getProviderHtml(provider, safeReference);
  const title = parseH1(response.html) ?? 'Episódio';
  const number = parseEpisodeNumber(title, safeReference);
  if (!number) throw new ProviderError('Número do episódio não identificado', 'unavailable');
  const seasonNumber = parseSeasonNumber(title, safeReference) ?? 1;
  const sources = await extractPlaybackSources(provider, response.html, response.url);

  return {
    server: provider,
    id: `${provider.id}:${seasonNumber}:${number}`,
    title,
    number,
    seasonNumber,
    reference: referenceFromUrl(provider, response.url),
    url: response.url,
    available: true,
    playback: { available: sources.length > 0, sources, reason: sources.length > 0 ? 'configured' as const : 'not-configured' as const },
    fetchedAt: new Date().toISOString()
  };
}

export async function checkProviderHealth(serverId: string): Promise<{ server: ServerDescriptor; status: 'ok' | 'unavailable'; latencyMs: number; checkedAt: string }> {
  const provider = getProvider(serverId);
  const startedAt = Date.now();
  try {
    await getProviderHtml(provider, '/', 5_000);
    return { server: provider, status: 'ok', latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() };
  } catch {
    return { server: provider, status: 'unavailable', latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() };
  }
}

async function getProviderHtml(provider: ProviderConfig, reference: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProviderResponse> {
  const url = new URL(reference, provider.baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== new URL(provider.baseUrl).hostname) {
    throw new ProviderError('Referência fora do provider permitido', 'unavailable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'NekoAnimes-Staging/1.0 (+https://nekoanimes-staging.pages.dev)'
      }
    });

    const finalUrl = new URL(response.url || url.toString());
    if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== url.hostname) {
      throw new ProviderError('Provider redirecionou para uma origem não permitida', 'unavailable');
    }
    if (!response.ok) throw new ProviderError(`Provider respondeu HTTP ${response.status}`, 'unavailable');

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > MAX_HTML_BYTES) throw new ProviderError('Resposta do provider excedeu o limite', 'unavailable');
    const html = await readLimitedText(response, MAX_HTML_BYTES);
    return { html, url: finalUrl.toString() };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
      throw new ProviderError('Tempo de resposta do provider esgotado', 'timeout');
    }
    throw new ProviderError('Provider indisponível', 'unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return output + decoder.decode();
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new ProviderError('Resposta do provider excedeu o limite', 'unavailable');
      output += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function getProvider(serverId: string): ProviderConfig {
  const provider = PROVIDERS.find((item) => item.id === serverId);
  if (!provider) throw new ProviderError('Servidor não encontrado', 'unavailable');
  return provider;
}

function extractAnimeMatches(provider: ProviderConfig, query: string, anchors: HtmlAnchor[]): ServerAnimeMatch[] {
  const deduped = new Map<string, ServerAnimeMatch>();
  for (const anchor of anchors) {
    const reference = referenceFromHref(provider, anchor.href);
    if (!reference || !provider.isAnimeReference(reference)) continue;
    const title = provider.cleanTitle(anchor.text);
    if (!title || title.length < 2) continue;
    const confidence = scoreTitleMatch(query, title);
    if (confidence < 0.45) continue;
    const match = toAnimeMatch(provider, title, new URL(reference, provider.baseUrl).toString(), confidence);
    const existing = deduped.get(reference);
    if (!existing || match.confidence > existing.confidence) deduped.set(reference, match);
  }
  return [...deduped.values()].sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
}

function extractBrowseMatches(provider: ProviderConfig, anchors: HtmlAnchor[]): ServerAnimeMatch[] {
  const deduped = new Map<string, ServerAnimeMatch>();
  for (const anchor of anchors) {
    const reference = referenceFromHref(provider, anchor.href);
    if (!reference || !provider.isAnimeReference(reference)) continue;
    const title = provider.cleanTitle(anchor.text);
    if (!title || title.length < 2) continue;
    const match = toAnimeMatch(provider, title, new URL(reference, provider.baseUrl).toString(), 1);
    if (!deduped.has(reference)) deduped.set(reference, match);
  }
  return [...deduped.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function hasProviderNextPage(provider: ProviderConfig, anchors: HtmlAnchor[], currentPage: number): boolean {
  return anchors.some((anchor) => {
    const reference = referenceFromHref(provider, anchor.href);
    if (!reference) return false;
    const page = /\/page\/(\d+)\/?$/i.exec(reference)?.[1] ?? /[?&]paged=(\d+)/i.exec(reference)?.[1];
    return Number(page) > currentPage;
  });
}

function toAnimeMatch(provider: ProviderConfig, title: string, url: string, confidence: number): ServerAnimeMatch {
  return { serverId: provider.id, serverName: provider.name, title, reference: referenceFromUrl(provider, url), url, confidence, postType: inferPostType(title, url) };
}

function inferPostType(title: string, reference: string): 'anime' | 'filme' | 'manga' {
  const value = `${title} ${reference}`.toLocaleLowerCase('pt-BR');
  if (/\b(manga|mangá|mangas|mangás|manhwa|manhua)\b/.test(value)) return 'manga';
  if (/\b(filme|filmes|movie|movies)\b/.test(value)) return 'filme';
  return 'anime';
}

function extractEpisodeCandidates(provider: ProviderConfig, anchors: HtmlAnchor[], sourcePriority: number, forcedSeason?: number): Array<{ episode: ServerEpisode; sourcePriority: number }> {
  const candidates: Array<{ episode: ServerEpisode; sourcePriority: number }> = [];
  for (const anchor of anchors) {
    const reference = referenceFromHref(provider, anchor.href);
    if (!reference || !provider.isEpisodeReference(reference)) continue;
    const episodeNumber = parseEpisodeNumber(anchor.text, reference);
    if (!episodeNumber) continue;
    const seasonNumber = forcedSeason ?? parseSeasonNumber(anchor.text, reference) ?? 1;
    candidates.push({
      sourcePriority,
      episode: {
        id: `${provider.id}:${seasonNumber}:${episodeNumber}`,
        title: cleanEpisodeTitle(anchor.text || `Episódio ${episodeNumber}`),
        number: episodeNumber,
        seasonNumber,
        reference,
        url: new URL(reference, provider.baseUrl).toString(),
        available: true
      }
    });
  }
  return candidates;
}

function extractScriptEpisodeCandidates(provider: ProviderConfig, html: string, sourcePriority: number): Array<{ episode: ServerEpisode; sourcePriority: number }> {
  if (provider.id !== 'goyabu') return [];
  const match = /(?:const|let|var)\s+allEpisodes\s*=\s*(\[[\s\S]*?\]);/i.exec(html);
  if (!match?.[1]) return [];
  try {
    const items = JSON.parse(match[1].replace(/\\\//g, '/')) as Array<{ link?: string; episodio?: string; episode_name?: string }>;
    return items.flatMap((item) => {
      const reference = referenceFromHref(provider, item.link ?? '');
      const number = Number.parseInt(item.episodio ?? '', 10);
      if (!reference || !provider.isEpisodeReference(reference) || !Number.isInteger(number) || number < 1) return [];
      return [{
        sourcePriority,
        episode: {
          id: `${provider.id}:1:${number}`,
          title: cleanEpisodeTitle(item.episode_name || `Episódio ${number}`),
          number,
          seasonNumber: 1,
          reference,
          url: new URL(reference, provider.baseUrl).toString(),
          available: true
        }
      }];
    });
  } catch {
    return [];
  }
}

async function extractPlaybackSources(provider: ProviderConfig, html: string, episodeUrl: string): Promise<ProviderPlaybackSource[]> {
  const candidates = new Set<string>();
  const embedCandidates = new Set<string>();
  const normalizedHtml = html.replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  const directPattern = /(?:https?:)?\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|mpd)(?:\?[^\s"'<>\\]*)?/gi;
  for (const match of normalizedHtml.matchAll(directPattern)) {
    const candidate = match[0].startsWith('//') ? `https:${match[0]}` : match[0];
    if (isDirectMediaUrl(candidate)) candidates.add(candidate);
  }

  const iframePattern = /<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of normalizedHtml.matchAll(iframePattern)) {
    const raw = decodeHtml(match[1] ?? match[2] ?? match[3] ?? '');
    try {
      const iframe = new URL(raw, episodeUrl);
      const embedded = iframe.searchParams.get('d') ?? iframe.searchParams.get('file') ?? iframe.searchParams.get('source');
      if (embedded && isDirectMediaUrl(embedded)) candidates.add(embedded);
      if (isDirectMediaUrl(iframe.toString())) candidates.add(iframe.toString());
      if (isBloggerVideoUrl(iframe.toString())) embedCandidates.add(iframe.toString());
    } catch {
      // Ignore malformed or non-HTTPS player frames.
    }
  }

  const bloggerPattern = /https:\/\/www\.blogger\.com\/video\.g\?token=[^\s"'<>\\]+/gi;
  for (const match of normalizedHtml.matchAll(bloggerPattern)) {
    const url = match[0].replace(/[),.;]+$/g, '');
    if (isBloggerVideoUrl(url)) embedCandidates.add(url);
  }

  const encryptedBloggerPattern = /data-blogger-url-encrypted\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of normalizedHtml.matchAll(encryptedBloggerPattern)) {
    const decoded = decodeBloggerVideoUrl(match[1] ?? match[2] ?? '');
    if (decoded) embedCandidates.add(decoded);
  }

  const orderedCandidates = [...candidates]
    .filter((url) => isDirectMediaUrl(url) && !isBackgroundAsset(url))
    .sort((a, b) => mediaPriority(a) - mediaPriority(b))
    .slice(0, 10);
  const directSources = orderedCandidates.slice(0, 5).map((url, index) => ({
    id: `${provider.id}:source:${index + 1}`,
    url,
    mimeType: mediaMimeType(url),
    label: `${provider.name} · fonte ${index + 1}`,
    headers: { Referer: episodeUrl },
    isDefault: index === 0,
    kind: 'direct' as const
  }));
  const embedSources = [...embedCandidates].slice(0, 5).map((url, index) => ({
    id: `${provider.id}:embed:${index + 1}`,
    url,
    mimeType: 'text/html',
    label: `${provider.name} · Blogger ${index + 1}`,
    headers: { Referer: episodeUrl },
    isDefault: directSources.length === 0 && index === 0,
    kind: 'embed' as const
  }));
  return [...directSources, ...embedSources];
}

function isDirectMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /\.(?:m3u8|mp4|mpd)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function isBackgroundAsset(value: string): boolean {
  try {
    return /(?:^|\/)(?:bg|background|poster|thumbnail)\.mp4$/i.test(new URL(value).pathname);
  } catch {
    return true;
  }
}

function isBloggerVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.blogger.com' && url.pathname === '/video.g' && url.searchParams.has('token');
  } catch {
    return false;
  }
}

function decodeBloggerVideoUrl(value: string): string | null {
  try {
    const decoded = atob(value);
    const url = decoded.split('').reverse().join('');
    return isBloggerVideoUrl(url) ? url : null;
  } catch {
    return null;
  }
}

function mediaPriority(value: string): number {
  if (/\.m3u8$/i.test(new URL(value).pathname)) return 0;
  if (/\.mpd$/i.test(new URL(value).pathname)) return 1;
  return 2;
}

function mediaMimeType(value: string): string | undefined {
  if (/\.m3u8$/i.test(new URL(value).pathname)) return 'application/vnd.apple.mpegurl';
  if (/\.mpd$/i.test(new URL(value).pathname)) return 'application/dash+xml';
  if (/\.mp4$/i.test(new URL(value).pathname)) return 'video/mp4';
  return undefined;
}

function extractSeasonReferences(provider: ProviderConfig, anchors: HtmlAnchor[]): Array<{ reference: string; number: number }> {
  const seen = new Set<string>();
  const result: Array<{ reference: string; number: number }> = [];
  for (const anchor of anchors) {
    const reference = referenceFromHref(provider, anchor.href);
    if (!reference || !reference.includes('/temporada/') || seen.has(reference)) continue;
    const number = parseSeasonNumber(anchor.text, reference) ?? 1;
    seen.add(reference);
    result.push({ reference, number });
  }
  return result.sort((a, b) => a.number - b.number);
}

function groupEpisodes(provider: ProviderConfig, candidates: Array<{ episode: ServerEpisode; sourcePriority: number }>): ServerSeason[] {
  const byKey = new Map<string, { episode: ServerEpisode; sourcePriority: number }>();
  for (const candidate of candidates) {
    const key = `${candidate.episode.seasonNumber}:${candidate.episode.number}`;
    const existing = byKey.get(key);
    if (!existing || candidate.sourcePriority < existing.sourcePriority) byKey.set(key, candidate);
  }
  const seasons = new Map<number, ServerEpisode[]>();
  for (const { episode } of byKey.values()) {
    const current = seasons.get(episode.seasonNumber) ?? [];
    current.push(episode);
    seasons.set(episode.seasonNumber, current);
  }
  return [...seasons.entries()].sort(([a], [b]) => a - b).map(([number, episodes]) => ({
    id: `${provider.id}:season:${number}`,
    number,
    title: `Temporada ${number}`,
    episodes: episodes.sort((a, b) => a.number - b.number)
  }));
}

function assertReference(provider: ProviderConfig, reference: string, kind: 'anime' | 'episode'): string {
  const normalized = referenceFromHref(provider, reference);
  const allowed = kind === 'anime' ? Boolean(normalized && provider.isAnimeReference(normalized)) : Boolean(normalized && provider.isEpisodeReference(normalized));
  if (!normalized || !allowed) throw new ProviderError(`Referência de ${kind} inválida`, 'unavailable');
  return normalized;
}

function referenceFromHref(provider: ProviderConfig, href: string): string | null {
  try {
    const base = new URL(provider.baseUrl);
    const url = new URL(decodeHtml(href), base);
    if (url.protocol !== 'https:' || url.hostname !== base.hostname) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function referenceFromUrl(provider: ProviderConfig, url: string): string {
  const reference = referenceFromHref(provider, url);
  if (!reference) throw new ProviderError('URL do provider inválida', 'unavailable');
  return reference;
}

function cleanAnimeTitle(title: string): string {
  return title
    .replace(/^assistir\s+/i, '')
    .replace(/\s+(?:todos\s+os\s+epis[oó]dios|anime\s+completo).*$/i, '')
    .replace(/\s+-\s+[^-]+$/i, '')
    .replace(/\s+todos\s+(?:os\s+)?epis[oó]dios(?:\s+online)?(?:\s+em\s+hd)?$/i, '')
    .replace(/\s+online(?:\s+em\s+hd)?$/i, '')
    .trim();
}

function cleanEpisodeTitle(title: string): string {
  return title.replace(/\s+\d+\s+(?:anos?|meses?|dias?)\s+atr[aá]s\s*$/i, '').replace(/\s+smart_display\s*$/i, '').trim();
}

function parseAnchors(html: string): HtmlAnchor[] {
  const anchors: HtmlAnchor[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? '';
    const text = stripTags(match[4] ?? '');
    if (href) anchors.push({ href: decodeHtml(href), text });
  }
  return anchors;
}

function parseH1(html: string): string | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match?.[1] ? stripTags(match[1]) : null;
}

function pageText(html: string): string {
  return stripTags(html);
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10))).replace(/&([a-z]+);/gi, (match: string, name: string) => entities[name.toLowerCase()] ?? match);
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function providerGenreSlug(value: string): string {
  const normalized = normalizeForMatch(value);
  const aliases: Record<string, string> = {
    action: 'acao', adventure: 'aventura', comedy: 'comedia', drama: 'drama', fantasy: 'fantasia', horror: 'horror', mystery: 'misterio', romance: 'romance', 'sci-fi': 'ficcao-cientifica', sports: 'esporte', supernatural: 'sobrenatural', suspense: 'suspense'
  };
  return aliases[normalized] ?? normalized;
}

function slugify(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, '-');
}

function scoreTitleMatch(query: string, title: string): number {
  const normalizedQuery = normalizeForMatch(query);
  const normalizedTitle = normalizeForMatch(title);
  if (!normalizedQuery || !normalizedTitle) return 0;
  if (normalizedQuery === normalizedTitle) return 1;
  if (normalizedTitle.startsWith(normalizedQuery)) return 0.96;
  if (normalizedTitle.includes(normalizedQuery)) return 0.92;
  const queryTokens = new Set(normalizedQuery.split(' ').filter(Boolean));
  const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
  let hits = 0;
  for (const token of queryTokens) if (titleTokens.has(token)) hits += 1;
  return queryTokens.size ? Number((hits / queryTokens.size).toFixed(3)) : 0;
}

function parseEpisodeNumber(text: string, href = ''): number | null {
  const patterns = [/\b\d+\s*[xX]\s*(\d+)\b/, /epis[oó]dio[^0-9]{0,12}(\d+)/i, /episodio[-_ ]?(\d+)/i];
  for (const source of [text, href]) for (const pattern of patterns) {
    const value = Number.parseInt(pattern.exec(source)?.[1] ?? '', 10);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function parseSeasonNumber(text: string, href = ''): number | null {
  const patterns = [/\b(\d+)\s*[xX]\s*\d+\b/, /(\d+)\s*(?:ª|a)?\s*temporada/i, /(?:temporada|season)[-_ ]?(\d+)/i, /-(\d+)-temporada/i];
  for (const source of [text, href]) for (const pattern of patterns) {
    const value = Number.parseInt(pattern.exec(source)?.[1] ?? '', 10);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function parseYear(text: string): number | undefined {
  const year = Number.parseInt(/\b((?:19|20)\d{2})\b/.exec(text)?.[1] ?? '', 10);
  return Number.isInteger(year) ? year : undefined;
}

function lastPathPart(reference: string): string | undefined {
  return reference.split('/').filter(Boolean).pop();
}
