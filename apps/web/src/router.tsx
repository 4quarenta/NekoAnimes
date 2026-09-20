import { Outlet, createRootRoute, createRoute, createRouter, redirect } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { HomePage } from './screens/HomePage';
import { SearchPage } from './screens/SearchPage';
import { LibraryPage } from './screens/LibraryPage';
import { AnimeDetailPage } from './screens/AnimeDetailPage';
import { NewsArticlePage } from './screens/NewsArticlePage';
import { SavedNewsPage } from './screens/SavedNewsPage';
import { AccountPage } from './screens/AccountPage';
import { CategoriesPage, CategoryDetailPage } from './screens/CategoriesPage';
import { ServersPage } from './screens/ServersPage';
import { ContinueWatchingPage } from './screens/ContinueWatchingPage';
import { ReportPage } from './screens/ReportPage';
import { PrivacyPage } from './screens/PrivacyPage';
import { AppLandingPage } from './screens/AppLandingPage';

const rootRoute = createRootRoute({ component: () => <Outlet /> });
function requireNativeApp() { if (!NekoNative.isAvailable()) throw redirect({ to: '/app' }); }
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', beforeLoad: requireNativeApp, component: HomePage });
const searchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/buscar', beforeLoad: requireNativeApp, validateSearch:(search:Record<string,unknown>)=>({q:typeof search.q==='string'?search.q.slice(0,200):undefined}), component: SearchPage });
const continueRoute = createRoute({ getParentRoute: () => rootRoute, path: '/continuar', beforeLoad: requireNativeApp, component: ContinueWatchingPage });
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lista', beforeLoad: requireNativeApp, component: LibraryPage });
const savedRoute = createRoute({ getParentRoute: () => rootRoute, path: '/salvos', beforeLoad: requireNativeApp, component: SavedNewsPage });
const accountRoute = createRoute({ getParentRoute: () => rootRoute, path: '/conta', beforeLoad: requireNativeApp, component: AccountPage });
const categoriesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/categorias', beforeLoad: requireNativeApp, component: CategoriesPage });
const categoryDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/categorias/$genreId', beforeLoad: requireNativeApp, validateSearch:(search:Record<string,unknown>)=>({page:Number.isInteger(Number(search.page))&&Number(search.page)>0?Math.min(100,Number(search.page)):undefined,server:typeof search.server==='string'?search.server:undefined}), component: CategoryDetailPage });
const serversRoute = createRoute({ getParentRoute: () => rootRoute, path: '/servidores', beforeLoad: requireNativeApp, component: ServersPage });
const animeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/anime/$slug',
  beforeLoad: requireNativeApp,
  validateSearch: (search: Record<string, unknown>) => ({
    provider: typeof search.provider === 'string' ? search.provider : undefined,
    ref: typeof search.ref === 'string' ? search.ref : undefined
  }),
  component: AnimeDetailPage
});
const newsArticleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/noticias/$slug', beforeLoad: requireNativeApp, component: NewsArticlePage });
const reportRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reportar', component: ReportPage });
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacidade', component: PrivacyPage });
const appLandingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/app', component: AppLandingPage });

const routeTree = rootRoute.addChildren([homeRoute, searchRoute, libraryRoute, continueRoute, savedRoute, accountRoute, categoriesRoute, categoryDetailRoute, serversRoute, animeDetailRoute, newsArticleRoute, reportRoute, privacyRoute, appLandingRoute]);
export const router = createRouter({ routeTree, scrollRestoration:true });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
