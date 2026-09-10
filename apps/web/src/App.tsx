import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { router } from './router';

export function App() {
  useEffect(() => {
    const unsubscribe = NekoNative.subscribe((event) => {
      if (event.type !== 'navigation.navigate') return;

      const payload = event.payload as { route?: string } | undefined;
      if (!payload?.route?.startsWith('/')) return;

      void router.navigate({ to: payload.route });
    });

    const onResolved = () => {
      NekoNative.navigate(window.location.pathname);
    };

    const off = router.subscribe('onResolved', onResolved);

    return () => {
      unsubscribe();
      off();
    };
  }, []);

  return <RouterProvider router={router} />;
}
