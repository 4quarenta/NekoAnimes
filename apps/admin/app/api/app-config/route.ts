import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function serverConfig() {
  const apiBaseUrl = process.env.API_BASE_URL;
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!apiBaseUrl || !adminApiKey) {
    throw new Error('API_BASE_URL e ADMIN_API_KEY devem estar configurados no servidor do Admin');
  }

  return { apiBaseUrl, adminApiKey };
}

function isAuthorized(request: NextRequest, expected: string): boolean {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  try {
    const decoded = atob(header.slice('Basic '.length));
    const separator = decoded.indexOf(':');
    return separator >= 0 && decoded.slice(separator + 1) === expected;
  } catch {
    return false;
  }
}

async function proxy(request: NextRequest, method: 'GET' | 'PUT', body?: unknown) {
  try {
    const { apiBaseUrl, adminApiKey } = serverConfig();
    if (!isAuthorized(request, adminApiKey)) {
      return NextResponse.json(
        { message: 'Chave administrativa necessária' },
        { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Neko Admin"' } }
      );
    }
    const init: RequestInit = {
      method,
      cache: 'no-store',
      headers: {
        'x-admin-key': adminApiKey,
        authorization: `Bearer ${adminApiKey}`,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    };
    const { env } = getCloudflareContext() as { env: { API_WORKER?: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } } };
    const response = env.API_WORKER
      ? await env.API_WORKER.fetch(new Request('https://nekoanimes-api.internal/v1/admin/app-config', init))
      : await fetch(`${apiBaseUrl}/v1/admin/app-config`, init);

    const payload = await response.json().catch(() => ({ message: 'Resposta inválida da API' }));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Falha ao acessar a API'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxy(request, 'GET');
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: 'JSON inválido' }, { status: 400 });
  return proxy(request, 'PUT', body);
}
