import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { fetchManifest, fetchServers, saveEpisodeProgress } from './lib/api';
import { useServerPreference } from './lib/server-preference';
import { router } from './router';

const NATIVE_ROUTES = ['/', '/catalogo', '/buscar', '/categorias', '/lista', '/salvos', '/conta', '/servidores'] as const;
type NativeRoute = (typeof NATIVE_ROUTES)[number];
type NavigableRoute = NativeRoute | `/anime/${string}` | `/noticias/${string}` | `/categorias/${string}`;
function isNativeRoute(route: string): route is NativeRoute { return (NATIVE_ROUTES as readonly string[]).includes(route); }
function isNavigableRoute(route: string): route is NavigableRoute {
  return isNativeRoute(route) || route.startsWith('/anime/') || route.startsWith('/noticias/') || route.startsWith('/categorias/');
}
function isStreamingOnly(route: string) { return route === '/catalogo' || route === '/categorias' || route.startsWith('/categorias/') || route === '/lista' || route === '/servidores' || route.startsWith('/anime/'); }
function isNewsOnly(route: string) { return route === '/salvos' || route.startsWith('/noticias/'); }

export function App() {
  const servers = useQuery({ queryKey: ['servers'], queryFn: fetchServers, staleTime: 10 * 60 * 1000 });
  const serverId = useServerPreference((state) => state.serverId);
  const setServerId = useServerPreference((state) => state.setServerId);

  useEffect(() => {
    if (!serverId && servers.data?.servers[0]) setServerId(servers.data.servers[0].id);
  }, [serverId, servers.data, setServerId]);

  useEffect(() => {
    NekoNative.handshake(import.meta.env.VITE_APP_VERSION ?? 'dev');

    void fetchManifest().then((manifest) => {
      const route = window.location.pathname;
      if (manifest.mode === 'news' && isStreamingOnly(route)) void router.navigate({ to: '/' });
      if (manifest.mode === 'streaming' && isNewsOnly(route)) void router.navigate({ to: '/' });
    }).catch(() => undefined);

    const unsubscribe = NekoNative.subscribe((event) => {
      if (event.type === 'player.closed') {
        const episodeId = event.payload?.episodeId;
        if (episodeId) {
          void saveEpisodeProgress(
            episodeId,
            event.payload?.positionSeconds ?? 0,
            event.payload?.durationSeconds ?? 0
          ).catch(() => undefined);
        }
        return;
      }

      if (event.type !== 'navigation.navigate') return;
      const route = event.payload.route;
      if (!isNavigableRoute(route)) return;
      if (route.startsWith('/anime/')) {
        void router.navigate({ to: '/anime/$slug', params: { slug: route.slice('/anime/'.length) }, search: { provider: undefined, ref: undefined } });
      } else if (route.startsWith('/noticias/')) {
        void router.navigate({ to: '/noticias/$slug', params: { slug: route.slice('/noticias/'.length) } });
      } else if (route.startsWith('/categorias/')) {
        void router.navigate({ to: '/categorias/$genreId', params: { genreId: route.slice('/categorias/'.length) } });
      } else if (route === '/servidores') {
        void router.navigate({ to: '/servidores' });
      } else if (isNativeRoute(route)) {
        void router.navigate({ to: route });
      }
    });

    const onResolved = () => {
      const route = window.location.pathname;
      if (route.startsWith('/anime/')) NekoNative.routeChanged(route);
      else if (route.startsWith('/noticias/')) NekoNative.routeChanged('/');
      else if (route.startsWith('/categorias/')) NekoNative.routeChanged('/categorias');
      else if (isNativeRoute(route)) NekoNative.routeChanged(route);
    };
    const off = router.subscribe('onResolved', onResolved);
    onResolved();
    return () => { unsubscribe(); off(); };
  }, []);

  return <RouterProvider router={router} />;
}
