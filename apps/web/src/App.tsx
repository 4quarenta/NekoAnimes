import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { router } from './router';

const NATIVE_ROUTES = ['/', '/catalogo', '/buscar', '/lista', '/salvos'] as const;
type NativeRoute = (typeof NATIVE_ROUTES)[number];
function isNativeRoute(route: string): route is NativeRoute { return (NATIVE_ROUTES as readonly string[]).includes(route); }

export function App() {
  useEffect(() => {
    NekoNative.handshake(import.meta.env.VITE_APP_VERSION ?? 'dev');
    const unsubscribe = NekoNative.subscribe((event) => {
      if (event.type !== 'navigation.navigate') return;
      const route = event.payload.route;
      if (!isNativeRoute(route)) return;
      void router.navigate({ to: route });
    });
    const onResolved = () => {
      const route = window.location.pathname;
      if (route.startsWith('/anime/')) NekoNative.routeChanged('/catalogo');
      else if (route.startsWith('/noticias/')) NekoNative.routeChanged('/');
      else if (isNativeRoute(route)) NekoNative.routeChanged(route);
    };
    const off = router.subscribe('onResolved', onResolved);
    onResolved();
    return () => { unsubscribe(); off(); };
  }, []);
  return <RouterProvider router={router} />;
}
