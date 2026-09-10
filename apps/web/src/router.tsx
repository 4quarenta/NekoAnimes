import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { HomePage } from './screens/HomePage';
import { CatalogPage } from './screens/CatalogPage';
import { SearchPage } from './screens/SearchPage';
import { LibraryPage } from './screens/LibraryPage';
import { PlaceholderPage } from './screens/PlaceholderPage';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const catalogRoute = createRoute({ getParentRoute: () => rootRoute, path: '/catalogo', component: CatalogPage });
const searchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/buscar', component: SearchPage });
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lista', component: LibraryPage });
const savedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/salvos',
  component: () => <PlaceholderPage title="Notícias salvas" />
});

const routeTree = rootRoute.addChildren([homeRoute, catalogRoute, searchRoute, libraryRoute, savedRoute]);
export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
