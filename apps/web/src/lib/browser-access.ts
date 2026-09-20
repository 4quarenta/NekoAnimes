import { NekoNative } from '@neko/bridge-web';

const PUBLIC_BROWSER_PATHS = ['/app', '/privacidade', '/reportar'] as const;

function isPublicBrowserPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (PUBLIC_BROWSER_PATHS as readonly string[]).includes(normalized);
}

export function prepareBrowserEntry(): void {
  if (NekoNative.isAvailable() || isPublicBrowserPath(window.location.pathname)) return;
  window.history.replaceState(null, '', '/app');
}
