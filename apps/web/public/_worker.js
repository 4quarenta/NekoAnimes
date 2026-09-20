const PUBLIC_DOCUMENTS = new Set(['/app', '/privacidade', '/reportar']);
const STATIC_PREFIXES = ['/assets/', '/brand/'];

function normalizedPath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function isNativeApp(request) {
  return request.headers.get('user-agent')?.includes('NekoAnimes/Android') === true;
}

function isPublicAsset(pathname) {
  return STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  secured.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if ((secured.headers.get('content-type') ?? '').includes('text/html')) {
    secured.headers.set('Cache-Control', 'no-store');
  }
  return secured;
}

async function serveSpa(request, env) {
  let response = await env.ASSETS.fetch(request);
  const acceptsHtml = request.headers.get('accept')?.includes('text/html') !== false;
  if (response.status === 404 && acceptsHtml) {
    const indexUrl = new URL('/index.html', request.url);
    response = await env.ASSETS.fetch(new Request(indexUrl, request));
  }
  return withSecurityHeaders(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = normalizedPath(url.pathname);

    if (isPublicAsset(pathname)) return withSecurityHeaders(await env.ASSETS.fetch(request));

    if (!isNativeApp(request) && !PUBLIC_DOCUMENTS.has(pathname)) {
      const landing = new URL('/app', url);
      return Response.redirect(landing, 302);
    }

    return serveSpa(request, env);
  }
};
