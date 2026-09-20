import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { fetchManifest, fetchServers } from './lib/api';
import { recordLocalProgress } from './lib/local-progress';
import { useServerPreference } from './lib/server-preference';
import { router } from './router';

const NATIVE_ROUTES = ['/', '/buscar', '/categorias', '/lista', '/continuar', '/salvos', '/conta', '/servidores', '/reportar', '/privacidade'] as const;
type NativeRoute = (typeof NATIVE_ROUTES)[number];
type NavigableRoute = NativeRoute | `/anime/${string}` | `/noticias/${string}` | `/categorias/${string}`;
function isNativeRoute(route: string): route is NativeRoute { return (NATIVE_ROUTES as readonly string[]).includes(route); }
function isNavigableRoute(route: string): route is NavigableRoute {
  return isNativeRoute(route) || route.startsWith('/anime/') || route.startsWith('/noticias/') || route.startsWith('/categorias/');
}
function isModeOneOnly(route: string) { return route === '/categorias' || route.startsWith('/categorias/') || route === '/lista' || route === '/continuar' || route === '/servidores' || route.startsWith('/anime/'); }

export function App() {
  if (!NekoNative.isAvailable()) return <RouterProvider router={router} />;
  return <NativeAppRuntime />;
}

function NativeAppRuntime() {
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const servers = useQuery({ queryKey: ['servers'], queryFn: fetchServers, enabled: manifest.data?.mode === 1, staleTime: 10 * 60 * 1000 });
  const serverId = useServerPreference((state) => state.serverId);
  const setServerId = useServerPreference((state) => state.setServerId);

  useEffect(() => {
    if (manifest.data?.mode === 1 && !serverId && servers.data?.servers[0]) setServerId(servers.data.servers[0].id);
  }, [manifest.data?.mode, serverId, servers.data, setServerId]);

  useEffect(() => {
    const route = window.location.pathname;
    if (manifest.data?.mode === 2 && isModeOneOnly(route)) void router.navigate({ to: '/' });
  }, [manifest.data?.mode]);

  useEffect(() => {
    NekoNative.handshake(import.meta.env.VITE_APP_VERSION ?? 'dev');

    const unsubscribe = NekoNative.subscribe((event) => {
      if (event.type === 'player.closed' || event.type === 'player.progress') {
        const episodeId = event.payload?.episodeId;
        if (episodeId) {
          recordLocalProgress(
            episodeId,
            event.payload?.positionSeconds ?? 0,
            event.payload?.durationSeconds ?? 0,
            event.payload?.playbackReady !== false
          );
        }
        return;
      }

      if (event.type !== 'navigation.navigate') return;
      const route = event.payload.route;
      // Closing a player should not add another copy of the same detail route.
      if (route === `${window.location.pathname}${window.location.search}`) return;
      const parsed = parseAppRoute(route);
      if (!parsed || !isNavigableRoute(parsed.pathname)) return;
      if (manifest.data?.mode === 2 && isModeOneOnly(parsed.pathname)) return;
      if (parsed.pathname.startsWith('/anime/')) {
        void router.navigate({ to: '/anime/$slug', params: { slug: parsed.pathname.slice('/anime/'.length) }, search: { provider: parsed.search.get('provider') ?? undefined, ref: parsed.search.get('ref') ?? undefined } });
      } else if (parsed.pathname.startsWith('/noticias/')) {
        void router.navigate({ to: '/noticias/$slug', params: { slug: parsed.pathname.slice('/noticias/'.length) } });
      } else if (parsed.pathname.startsWith('/categorias/')) {
        void router.navigate({ to: '/categorias/$genreId', params: { genreId: parsed.pathname.slice('/categorias/'.length) }, search:{page:Number(parsed.search.get('page'))||undefined,server:parsed.search.get('server')??undefined} });
      } else if (parsed.pathname === '/buscar') {
        void router.navigate({to:'/buscar',search:{q:parsed.search.get('q')??undefined}});
      } else if (parsed.pathname === '/servidores') {
        void router.navigate({ to: '/servidores' });
      } else if (isNativeRoute(parsed.pathname)) {
        void router.navigate({ to: parsed.pathname });
      }
    });

    const onResolved = () => {
      const route = `${window.location.pathname}${window.location.search}`;
      if (isNavigableRoute(window.location.pathname)) NekoNative.routeChanged(route);
    };
    const off = router.subscribe('onResolved', onResolved);
    onResolved();
    return () => { unsubscribe(); off(); };
  }, [manifest.data?.mode]);

  return <RouterProvider router={router} />;
}

function parseAppRoute(route: string): { pathname: string; search: URLSearchParams } | null {
  try {
    const parsed = new URL(route, 'https://nekoanimes.local');
    return { pathname: parsed.pathname, search: parsed.searchParams };
  } catch {
    return null;
  }
}
