import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';
import { HomePage } from './screens/HomePage';
import { PlaceholderPage } from './screens/PlaceholderPage';

const rootRoute = createRootRoute({
  component: () => <Outlet />
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalogo',
  component: () => <PlaceholderPage title="Catálogo A–Z" />
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/buscar',
  component: () => <PlaceholderPage title="Buscar" />
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lista',
  component: () => <PlaceholderPage title="Minha lista" />
});

const savedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/salvos',
  component: () => <PlaceholderPage title="Salvos" />
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  catalogRoute,
  searchRoute,
  libraryRoute,
  savedRoute
]);

export const router = createRouter({
  routeTree
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
