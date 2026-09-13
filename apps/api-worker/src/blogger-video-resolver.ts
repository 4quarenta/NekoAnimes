import puppeteer, { type Page } from '@cloudflare/puppeteer';

const BLOGGER_HOST = 'www.blogger.com';
const GOOGLEVIDEO_SUFFIX = '.googlevideo.com';
const MAX_SOURCE_URL_LENGTH = 2_048;
const RESOLUTION_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 250;

export type BloggerVideoSource = {
  url: string;
  mimeType: 'video/mp4';
  expiresAt: string | null;
  expiresInSeconds: number | null;
};

export class BloggerVideoResolutionError extends Error {
  constructor(message: string, readonly kind: 'invalid' | 'unavailable' | 'timeout') {
    super(message);
    this.name = kind === 'timeout' ? 'TimeoutError' : 'BloggerVideoResolutionError';
  }
}

export function parseBloggerVideoUrl(value: string | undefined): string {
  if (!value || value.length > MAX_SOURCE_URL_LENGTH) {
    throw new BloggerVideoResolutionError('URL Blogger inválida', 'invalid');
  }

  try {
    const url = new URL(value);
    const token = url.searchParams.get('token');
    if (
      url.protocol !== 'https:' ||
      url.hostname !== BLOGGER_HOST ||
      url.pathname !== '/video.g' ||
      url.username ||
      url.password ||
      !token ||
      token.length > 1_800
    ) {
      throw new Error('invalid');
    }
    return url.toString();
  } catch {
    throw new BloggerVideoResolutionError('URL Blogger inválida', 'invalid');
  }
}

export async function resolveBloggerVideoSource(endpoint: Fetcher, sourceUrl: string): Promise<BloggerVideoSource> {
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  let page: Page | undefined;
  let candidate: BloggerVideoSource | undefined;

  try {
    browser = await puppeteer.launch(endpoint);
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
    );

    page.on('request', (request) => {
      const source = parseGoogleVideoUrl(request.url());
      if (source && !candidate) candidate = source;
    });

    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForSelector('main', { timeout: 10_000 });

    while (!candidate && Date.now() - startedAt < RESOLUTION_TIMEOUT_MS) {
      await triggerBloggerPlayback(page);
      candidate = (await findVideoElementSource(page)) ?? candidate;
      if (!candidate) await delay(POLL_INTERVAL_MS);
    }

    if (candidate) return candidate;
    throw new BloggerVideoResolutionError('Blogger não retornou um MP4 temporário', 'timeout');
  } catch (error) {
    if (error instanceof BloggerVideoResolutionError) throw error;
    if (Date.now() - startedAt >= RESOLUTION_TIMEOUT_MS) {
      throw new BloggerVideoResolutionError('Tempo esgotado ao resolver o vídeo Blogger', 'timeout');
    }
    throw new BloggerVideoResolutionError('Blogger não está disponível para reprodução', 'unavailable');
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

function parseGoogleVideoUrl(value: string): BloggerVideoSource | null {
  try {
    const url = new URL(value);
    const mimeType = url.searchParams.get('mime')?.toLowerCase();
    const expire = Number(url.searchParams.get('expire'));
    const isGoogleVideo =
      url.protocol === 'https:' &&
      (url.hostname === 'googlevideo.com' || url.hostname.endsWith(GOOGLEVIDEO_SUFFIX)) &&
      url.pathname === '/videoplayback' &&
      mimeType === 'video/mp4' &&
      url.searchParams.has('sig') &&
      Number.isInteger(expire);

    if (!isGoogleVideo) return null;
    const expiresAt = new Date(expire * 1_000);
    return {
      url: url.toString(),
      mimeType: 'video/mp4',
      expiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt.toISOString(),
      expiresInSeconds: Math.max(0, Math.floor((expire * 1_000 - Date.now()) / 1_000))
    };
  } catch {
    return null;
  }
}

async function triggerBloggerPlayback(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return false;
      main.click();
      main.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    })
    .catch(() => false);
}

async function findVideoElementSource(page: Page): Promise<BloggerVideoSource | null> {
  for (const frame of page.frames()) {
    try {
      const source = await frame.$eval('video', (element) => {
        const video = element as HTMLVideoElement;
        return video.currentSrc || video.src || null;
      });
      const parsed = source ? parseGoogleVideoUrl(source) : null;
      if (parsed) return parsed;
    } catch {
      // Frames can disappear while Blogger replaces the iframe.
    }
  }
  return null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
