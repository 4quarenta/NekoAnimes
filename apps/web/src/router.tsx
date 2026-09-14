import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
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

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const searchRoute = createRoute({ getParentRoute: () => rootRoute, path: '/buscar', validateSearch:(search:Record<string,unknown>)=>({q:typeof search.q==='string'?search.q.slice(0,200):undefined}), component: SearchPage });
const continueRoute = createRoute({ getParentRoute: () => rootRoute, path: '/continuar', component: ContinueWatchingPage });
const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/lista', component: LibraryPage });
const savedRoute = createRoute({ getParentRoute: () => rootRoute, path: '/salvos', component: SavedNewsPage });
const accountRoute = createRoute({ getParentRoute: () => rootRoute, path: '/conta', component: AccountPage });
const categoriesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/categorias', component: CategoriesPage });
const categoryDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/categorias/$genreId', validateSearch:(search:Record<string,unknown>)=>({page:Number.isInteger(Number(search.page))&&Number(search.page)>0?Math.min(100,Number(search.page)):undefined,server:typeof search.server==='string'?search.server:undefined}), component: CategoryDetailPage });
const serversRoute = createRoute({ getParentRoute: () => rootRoute, path: '/servidores', component: ServersPage });
const animeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/anime/$slug',
  validateSearch: (search: Record<string, unknown>) => ({
    provider: typeof search.provider === 'string' ? search.provider : undefined,
    ref: typeof search.ref === 'string' ? search.ref : undefined
  }),
  component: AnimeDetailPage
});
const newsArticleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/noticias/$slug', component: NewsArticlePage });

const routeTree = rootRoute.addChildren([homeRoute, searchRoute, libraryRoute, continueRoute, savedRoute, accountRoute, categoriesRoute, categoryDetailRoute, serversRoute, animeDetailRoute, newsArticleRoute]);
export const router = createRouter({ routeTree, scrollRestoration:true });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
