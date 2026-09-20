const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
};

export interface HtmlAnchor {
  href: string;
  text: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&([a-z]+);/gi, (match: string, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAnchors(html: string): HtmlAnchor[] {
  const anchors: HtmlAnchor[] = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? '';
    const inner = match[4] ?? '';
    const text = stripTags(inner);
    if (href && text) anchors.push({ href: decodeHtml(href), text });
  }

  return anchors;
}

export function parseH1(html: string): string | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return match?.[1] ? stripTags(match[1]) : null;
}

export function pageText(html: string): string {
  return stripTags(html);
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value: string): string {
  return normalizeForMatch(value).replace(/\s+/g, '-');
}

export function scoreTitleMatch(query: string, title: string): number {
  const normalizedQuery = normalizeForMatch(query);
  const normalizedTitle = normalizeForMatch(title);
  if (!normalizedQuery || !normalizedTitle) return 0;
  if (normalizedQuery === normalizedTitle) return 1;
  if (normalizedTitle.startsWith(normalizedQuery)) return 0.96;
  if (normalizedTitle.includes(normalizedQuery)) return 0.92;

  const queryTokens = new Set(normalizedQuery.split(' ').filter(Boolean));
  const titleTokens = new Set(normalizedTitle.split(' ').filter(Boolean));
  if (queryTokens.size === 0) return 0;

  let hits = 0;
  for (const token of queryTokens) if (titleTokens.has(token)) hits += 1;
  return Number((hits / queryTokens.size).toFixed(3));
}

export function parseEpisodeNumber(text: string, href = ''): number | null {
  const candidates = [
    /\b\d+\s*[xX]\s*(\d+)\b/,
    /epis[oó]dio[^0-9]{0,12}(\d+)/i,
    /episodio[-_ ]?(\d+)/i
  ];

  for (const source of [text, href]) {
    for (const pattern of candidates) {
      const match = pattern.exec(source);
      const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
      if (Number.isInteger(value) && value > 0) return value;
    }
  }

  return null;
}

export function parseSeasonNumber(text: string, href = ''): number | null {
  const candidates = [
    /\b(\d+)\s*[xX]\s*\d+\b/,
    /(\d+)\s*(?:ª|a)?\s*temporada/i,
    /(?:temporada|season)[-_ ]?(\d+)/i,
    /-(\d+)-temporada/i
  ];

  for (const source of [text, href]) {
    for (const pattern of candidates) {
      const match = pattern.exec(source);
      const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
      if (Number.isInteger(value) && value > 0) return value;
    }
  }

  return null;
}

export function parseYear(text: string): number | undefined {
  const match = /\b((?:19|20)\d{2})\b/.exec(text);
  const year = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  return Number.isInteger(year) ? year : undefined;
}
