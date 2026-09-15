import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchProviderCategories, fetchManifest, fetchNews, fetchProviderCatalog } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { useContinueWatching } from '../lib/use-continue-watching';
import { WatchingList } from '../components/WatchingList';
import { providerSlug } from '../lib/provider-links';
import { AnimeListRow, AppScreen, Eyebrow, EmptyState, ScreenHeader, Section, TextRow } from '../components/AppScreen';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function HomePage() {
  const navigate = useNavigate();
  const {session,query:watching,items:progressItems,pending}=useContinueWatching();
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const serverId = useServerPreference((state) => state.serverId);
  const news = useQuery({ queryKey: ['news-home'], queryFn: () => fetchNews({ limit: 30 }), enabled: manifest.data?.mode === 'news' });
  const categories=useQuery({queryKey:['provider-categories',serverId],queryFn:()=>fetchProviderCategories(serverId!),enabled:Boolean(serverId)&&manifest.data?.mode==='streaming',staleTime:15*60*1000});
  const catalog = useQuery({ queryKey: ['provider-catalog-home', serverId], queryFn: () => fetchProviderCatalog(serverId!, { limit: 6 }), enabled: manifest.data?.mode === 'streaming' && Boolean(serverId) });


  if (manifest.isPending) return <AppScreen><div className="neko-skeleton" /><div className="neko-skeleton short" /></AppScreen>;
  if (manifest.isError) return <AppScreen><p role="alert" className="neko-error">Não foi possível carregar a configuração.</p><button className="neko-secondary-button" onClick={()=>void manifest.refetch()}>Tentar novamente</button></AppScreen>;

  if (manifest.data.mode === 'news') {
    return (
      <AppScreen>
        <Eyebrow>Neko News</Eyebrow>
        <ScreenHeader title="Últimas notícias" subtitle="Anime, mangá, indústria e cultura em um feed direto." />
        <button className="neko-search-launcher" type="button" onClick={() => void navigate({ to: '/buscar',search:{q:undefined} })}>
          <span>⌕</span><span>Buscar notícias...</span>
        </button>
        <div className="neko-category-strip" aria-label="Categorias">
          {['Anime', 'Mangá', 'Indústria', 'Cultura'].map((category) => <span key={category}>{category}</span>)}
        </div>
        <Section title="Mais recentes">
          {news.isPending ? <><div className="neko-skeleton" /><div className="neko-skeleton short" /></> : null}
          {news.data?.items.length ? (
            <div className="neko-news-list">
              {news.data.items.map((item, index) => (
                <button key={item.id} type="button" className={index === 0 ? 'neko-news-card featured' : 'neko-news-card'} onClick={() => void navigate({ to: '/noticias/$slug', params: { slug: item.slug } })}>
                  <span className="neko-news-meta">{item.category} · {item.sourceName} · {formatDate(item.publishedAt)}</span>
                  <strong>{item.title}</strong>
                  {item.summary ? <span className="neko-news-summary">{item.summary}</span> : null}
                  <span className="neko-news-open">Ler notícia ›</span>
                </button>
              ))}
            </div>
          ) : news.data ? <EmptyState title="Nenhuma notícia publicada" description="O feed será preenchido pelas fontes configuradas ou pelo painel editorial." /> : null}
        </Section>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="O que você vai assistir?" subtitle="Rápido, direto e com listas organizadas para encontrar seu próximo anime." />
      <button className="neko-search-launcher" type="button" onClick={() => void navigate({ to: '/buscar',search:{q:undefined} })}>
        <span>⌕</span><span>Buscar anime...</span>
      </button>
      <Section title="Continuar assistindo" action={<button className="neko-link" onClick={() => void navigate({ to: '/continuar' })}>Ver todos</button>}>
        {!session ? <div className="neko-list"><TextRow title="Entre na conta para sincronizar" meta="Seu progresso aparecerá aqui" trailing="›" onClick={() => void navigate({ to: '/conta' })} /></div> : null}
        {session && watching.isPending ? <div className="neko-skeleton short" /> : null}
        {progressItems.length ? <WatchingList items={progressItems.slice(0,3)}/> : null}
        {session && watching.data && !progressItems.length ? <EmptyState title="Nada em andamento" description="Seu progresso aparecerá aqui depois que começar a assistir." /> : null}
        {session && pending ? <p className="neko-account-notice">Progresso salvo neste dispositivo; aguardando sincronização. Você pode tentar novamente na Conta.</p> : null}
        {session && watching.isError ? <p className="neko-error">Não foi possível carregar seu progresso agora.</p> : null}
      </Section>
      <Section title="Catálogo em destaque" action={<button className="neko-link" onClick={() => void navigate({ to: '/categorias' })}>Ver categorias</button>}>
        {catalog.isPending ? <div className="neko-skeleton short" /> : null}
        {catalog.data?.items.length ? <div className="neko-list">{catalog.data.items.map((item) => <AnimeListRow key={item.reference} title={item.title} imageUrl={item.imageUrl} postType={item.postType} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} releaseLabel={item.releaseLabel} meta={catalog.data?.server.name} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.workSlug??providerSlug(item) }, search: { provider: item.serverId, ref: item.reference } })} />)}</div> : null}
        {catalog.isError ? <div role="alert"><p className="neko-error">Não foi possível carregar o catálogo de {serverId ?? 'servidor'}.</p><button className="neko-secondary-button" onClick={()=>void catalog.refetch()}>Tentar novamente</button></div> : null}
      </Section>
      <Section title="Explorar categorias" action={<button className="neko-link" onClick={() => void navigate({ to: '/categorias' })}>Abrir categorias</button>}>
        <div className="neko-category-strip" aria-label="Categorias">{categories.data?.items.slice(0,5).map(item=><button className="neko-link" key={item.id} onClick={()=>void navigate({to:'/categorias/$genreId',params:{genreId:item.id},search:{page:undefined,server:serverId??undefined}})}>{item.name}</button>)}</div>
      </Section>
    </AppScreen>
  );
}
