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
};

export type ServerEpisode = {
  id: string;
  title: string;
  number: number;
  seasonNumber: number;
  reference: string;
  url: string;
  available: boolean;
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
};

type HtmlAnchor = { href: string; text: string };
type ProviderResponse = { html: string; url: string };

export const ANIMES_DIGITAL: ServerDescriptor = {
  id: 'animesdigital',
  name: 'Animes Digital',
  baseUrl: 'https://animesdigital.org',
  capabilities: { search: true, anime: true, episodes: true, playback: false }
};

const MAX_HTML_BYTES = 4_000_000;
const DEFAULT_TIMEOUT_MS = 12_000;

export class ProviderError extends Error {
  constructor(message: string, readonly kind: 'timeout' | 'unavailable') {
    super(message);
    this.name = kind === 'timeout' ? 'TimeoutError' : 'ProviderError';
  }
}

export function listServerDescriptors(): ServerDescriptor[] {
  return [ANIMES_DIGITAL];
}

export async function searchAnimesDigital(query: string): Promise<ServerAnimeMatch[]> {
  const response = await getProviderHtml(`/?s=${encodeURIComponent(query)}`);
  const matches = extractAnimeMatches(query, parseAnchors(response.html));
  if (matches.length > 0) return matches.slice(0, 10);

  const fallbackReference = `/anime/a/${slugify(query)}`;
  try {
    const detail = await getProviderHtml(fallbackReference);
    const title = cleanAnimeTitle(parseH1(detail.html) ?? query);
    const confidence = scoreTitleMatch(query, title);
    return confidence >= 0.45 ? [toAnimeMatch(title, detail.url, confidence)] : [];
  } catch {
    return [];
  }
}

export async function getAnimesDigitalAnime(reference: string): Promise<ServerAnimeDetail> {
  const safeReference = assertReference(reference, 'anime');
  const response = await getProviderHtml(safeReference);
  const title = cleanAnimeTitle(parseH1(response.html) ?? lastPathPart(safeReference) ?? 'Anime');
  const anchors = parseAnchors(response.html);
  const episodes = extractEpisodeCandidates(anchors, 2);

  // Some provider pages expose seasons as links. Keep the number of follow-up
  // requests bounded because this endpoint is called from a public Worker.
  const seasonReferences = extractSeasonReferences(anchors).slice(0, 12);
  const seasonPages = await Promise.allSettled(
    seasonReferences.map(async ({ reference: seasonReference, number }) => {
      const seasonPage = await getProviderHtml(seasonReference);
      return extractEpisodeCandidates(parseAnchors(seasonPage.html), 3, number);
    })
  );

  for (const result of seasonPages) {
    if (result.status === 'fulfilled') episodes.push(...result.value);
  }

  return {
    server: ANIMES_DIGITAL,
    anime: {
      title,
      reference: referenceFromUrl(response.url),
      url: response.url,
      year: parseYear(pageText(response.html))
    },
    seasons: groupEpisodes(episodes),
    fetchedAt: new Date().toISOString()
  };
}

export async function getAnimesDigitalEpisode(reference: string) {
  const safeReference = assertReference(reference, 'episode');
  const response = await getProviderHtml(safeReference);
  const title = parseH1(response.html) ?? 'Episódio';
  const number = parseEpisodeNumber(title, safeReference);
  if (!number) throw new ProviderError('Número do episódio não identificado', 'unavailable');
  const seasonNumber = parseSeasonNumber(title, safeReference) ?? 1;

  return {
    server: ANIMES_DIGITAL,
    id: `${ANIMES_DIGITAL.id}:${seasonNumber}:${number}`,
    title,
    number,
    seasonNumber,
    reference: referenceFromUrl(response.url),
    url: response.url,
    available: true,
    playback: { available: false, sources: [], reason: 'not-configured' as const },
    fetchedAt: new Date().toISOString()
  };
}

export async function checkAnimesDigitalHealth(): Promise<{ server: ServerDescriptor; status: 'ok' | 'unavailable'; latencyMs: number; checkedAt: string }> {
  const startedAt = Date.now();
  try {
    await getProviderHtml('/', 5_000);
    return { server: ANIMES_DIGITAL, status: 'ok', latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() };
  } catch {
    return { server: ANIMES_DIGITAL, status: 'unavailable', latencyMs: Date.now() - startedAt, checkedAt: new Date().toISOString() };
  }
}

async function getProviderHtml(reference: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProviderResponse> {
  const url = new URL(reference, ANIMES_DIGITAL.baseUrl);
  if (url.protocol !== 'https:' || url.hostname !== new URL(ANIMES_DIGITAL.baseUrl).hostname) {
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

function extractAnimeMatches(query: string, anchors: HtmlAnchor[]): ServerAnimeMatch[] {
  const deduped = new Map<string, ServerAnimeMatch>();
  for (const anchor of anchors) {
    const reference = referenceFromHref(anchor.href);
    if (!reference || !reference.startsWith('/anime/a/')) continue;
    const title = cleanAnimeTitle(anchor.text);
    if (!title || title.length < 2) continue;
    const confidence = scoreTitleMatch(query, title);
    if (confidence < 0.45) continue;
    const match = toAnimeMatch(title, new URL(reference, ANIMES_DIGITAL.baseUrl).toString(), confidence);
    const existing = deduped.get(reference);
    if (!existing || match.confidence > existing.confidence) deduped.set(reference, match);
  }
  return [...deduped.values()].sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title));
}

function toAnimeMatch(title: string, url: string, confidence: number): ServerAnimeMatch {
  return { serverId: ANIMES_DIGITAL.id, serverName: ANIMES_DIGITAL.name, title, reference: referenceFromUrl(url), url, confidence };
}

function extractEpisodeCandidates(anchors: HtmlAnchor[], sourcePriority: number, forcedSeason?: number): Array<{ episode: ServerEpisode; sourcePriority: number }> {
  const candidates: Array<{ episode: ServerEpisode; sourcePriority: number }> = [];
  for (const anchor of anchors) {
    const reference = referenceFromHref(anchor.href);
    if (!reference || (!reference.startsWith('/video/a/') && !/^\/\?p=\d+$/i.test(reference))) continue;
    const episodeNumber = parseEpisodeNumber(anchor.text, reference);
    if (!episodeNumber) continue;
    const seasonNumber = forcedSeason ?? parseSeasonNumber(anchor.text, reference) ?? 1;
    candidates.push({
      sourcePriority,
      episode: {
        id: `${ANIMES_DIGITAL.id}:${seasonNumber}:${episodeNumber}`,
        title: cleanEpisodeTitle(anchor.text || `Episódio ${episodeNumber}`),
        number: episodeNumber,
        seasonNumber,
        reference,
        url: new URL(reference, ANIMES_DIGITAL.baseUrl).toString(),
        available: true
      }
    });
  }
  return candidates;
}

function extractSeasonReferences(anchors: HtmlAnchor[]): Array<{ reference: string; number: number }> {
  const seen = new Set<string>();
  const result: Array<{ reference: string; number: number }> = [];
  for (const anchor of anchors) {
    const reference = referenceFromHref(anchor.href);
    if (!reference || !reference.includes('/temporada/') || seen.has(reference)) continue;
    const number = parseSeasonNumber(anchor.text, reference) ?? 1;
    seen.add(reference);
    result.push({ reference, number });
  }
  return result.sort((a, b) => a.number - b.number);
}

function groupEpisodes(candidates: Array<{ episode: ServerEpisode; sourcePriority: number }>): ServerSeason[] {
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
    id: `${ANIMES_DIGITAL.id}:season:${number}`,
    number,
    title: `Temporada ${number}`,
    episodes: episodes.sort((a, b) => a.number - b.number)
  }));
}

function assertReference(reference: string, kind: 'anime' | 'episode'): string {
  const normalized = referenceFromHref(reference);
  const allowed = kind === 'anime'
    ? normalized?.startsWith('/anime/a/')
    : Boolean(normalized && (normalized.startsWith('/video/a/') || /^\/\?p=\d+$/i.test(normalized)));
  if (!normalized || !allowed) throw new ProviderError(`Referência de ${kind} inválida`, 'unavailable');
  return normalized;
}

function referenceFromHref(href: string): string | null {
  try {
    const base = new URL(ANIMES_DIGITAL.baseUrl);
    const url = new URL(decodeHtml(href), base);
    if (url.protocol !== 'https:' || url.hostname !== base.hostname) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function referenceFromUrl(url: string): string {
  const reference = referenceFromHref(url);
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
    if (href && text) anchors.push({ href: decodeHtml(href), text });
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
