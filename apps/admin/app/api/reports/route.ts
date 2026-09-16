import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function settings() {
  const apiBaseUrl = process.env.API_BASE_URL;
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!apiBaseUrl || !adminApiKey) throw new Error('API_BASE_URL e ADMIN_API_KEY devem estar configurados no servidor do Admin');
  return { apiBaseUrl, adminApiKey };
}

function authorized(request: NextRequest, expected: string) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice(6));
    return decoded.includes(':') && decoded.slice(decoded.indexOf(':') + 1) === expected;
  } catch { return false; }
}

async function proxy(request: NextRequest, path: string, init: RequestInit = {}) {
  try {
    const { apiBaseUrl, adminApiKey } = settings();
    if (!authorized(request, adminApiKey)) return NextResponse.json({ message: 'Chave administrativa necessária' }, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Neko Admin"' } });
    const { env } = getCloudflareContext() as { env: { API_WORKER?: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } } };
    const headers = new Headers(init.headers);
    headers.set('x-admin-key', adminApiKey);
    headers.set('authorization', `Bearer ${adminApiKey}`);
    const upstream = env.API_WORKER
      ? await env.API_WORKER.fetch(new Request(`https://nekoanimes-api.internal${path}`, { ...init, headers }))
      : await fetch(`${apiBaseUrl}${path}`, { ...init, headers, cache: 'no-store' });
    const payload = await upstream.json().catch(() => ({ message: 'Resposta inválida da API' }));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : 'Falha ao acessar a API' }, { status: 500 }); }
}

export function GET(request: NextRequest) { return proxy(request, '/v1/admin/reports'); }
