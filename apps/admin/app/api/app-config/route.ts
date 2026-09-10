import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function serverConfig() {
  const apiBaseUrl = process.env.API_BASE_URL;
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!apiBaseUrl || !adminApiKey) {
    throw new Error('API_BASE_URL e ADMIN_API_KEY devem estar configurados no servidor do Admin');
  }

  return { apiBaseUrl, adminApiKey };
}

async function proxy(method: 'GET' | 'PUT', body?: unknown) {
  try {
    const { apiBaseUrl, adminApiKey } = serverConfig();
    const response = await fetch(`${apiBaseUrl}/v1/admin/app-config`, {
      method,
      cache: 'no-store',
      headers: {
        'x-admin-key': adminApiKey,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

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

export async function GET() {
  return proxy('GET');
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: 'JSON inválido' }, { status: 400 });
  return proxy('PUT', body);
}
