import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest, expected: string) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  try { const decoded = atob(header.slice(6)); return decoded.includes(':') && decoded.slice(decoded.indexOf(':') + 1) === expected; } catch { return false; }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const apiBaseUrl = process.env.API_BASE_URL;
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!apiBaseUrl || !adminApiKey) return NextResponse.json({ message: 'Configuração do Admin incompleta' }, { status: 500 });
  if (!authorized(request, adminApiKey)) return NextResponse.json({ message: 'Chave administrativa necessária' }, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Neko Admin"' } });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const init: RequestInit = { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-key': adminApiKey, authorization: `Bearer ${adminApiKey}` }, body: JSON.stringify(body) };
  const { env } = getCloudflareContext() as { env: { API_WORKER?: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } } };
  const response = env.API_WORKER
    ? await env.API_WORKER.fetch(new Request(`https://nekoanimes-api.internal/v1/admin/reports/${encodeURIComponent(id)}`, init))
    : await fetch(`${apiBaseUrl}/v1/admin/reports/${encodeURIComponent(id)}`, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({ message: 'Resposta inválida da API' }));
  return NextResponse.json(payload, { status: response.status });
}
