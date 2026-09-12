import { Injectable } from '@nestjs/common';

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

export interface ServerHttpResponse {
  html: string;
  url: string;
  status: number;
}

@Injectable()
export class ServerHttpClient {
  async getHtml(baseUrl: string, target: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ServerHttpResponse> {
    const allowed = new URL(baseUrl);
    const requested = new URL(target, allowed);
    this.assertAllowedUrl(allowed, requested);

    const response = await fetch(requested, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
        'cache-control': 'no-cache',
        'user-agent': 'NekoAnimes/1.0 (+metadata-discovery)'
      }
    });

    const finalUrl = new URL(response.url || requested.toString());
    this.assertAllowedUrl(allowed, finalUrl);

    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
      throw new Error('Provider response too large');
    }

    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) throw new Error('Provider response too large');

    return { html, url: finalUrl.toString(), status: response.status };
  }

  private assertAllowedUrl(base: URL, candidate: URL): void {
    if (candidate.protocol !== 'https:') throw new Error('Provider requires HTTPS');
    if (candidate.hostname !== base.hostname) throw new Error('Provider redirect/origin not allowed');
    if (candidate.username || candidate.password) throw new Error('Provider URL credentials not allowed');
  }
}
