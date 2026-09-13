import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchContinueWatching, fetchManifest, fetchNews, fetchProviderCatalog } from '../lib/api';
import { auth, type AuthSession } from '../lib/auth';
import { useServerPreference } from '../lib/server-preference';
import { providerSlug } from '../lib/provider-links';
import { AnimeListRow, AppScreen, Eyebrow, EmptyState, ScreenHeader, Section, TextRow } from '../components/AppScreen';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function HomePage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const serverId = useServerPreference((state) => state.serverId);
  const news = useQuery({ queryKey: ['news-home'], queryFn: () => fetchNews({ limit: 30 }), enabled: manifest.data?.mode === 'news' });
  const watching = useQuery({ queryKey: ['me-continue-home', session?.user.id], queryFn: fetchContinueWatching, enabled: manifest.data?.mode === 'streaming' && Boolean(session), staleTime: 30 * 1000 });
  const catalog = useQuery({ queryKey: ['provider-catalog-home', serverId], queryFn: () => fetchProviderCatalog(serverId!, { limit: 6 }), enabled: manifest.data?.mode === 'streaming' && Boolean(serverId) });

  useEffect(() => {
    void auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refresh = () => void watching.refetch();
    window.addEventListener('neko-progress-updated', refresh);
    return () => window.removeEventListener('neko-progress-updated', refresh);
  }, [watching.refetch]);

  if (manifest.isPending) return <AppScreen><div className="neko-skeleton" /><div className="neko-skeleton short" /></AppScreen>;
  if (manifest.isError) return <AppScreen><p className="neko-error">Não foi possível carregar a configuração.</p></AppScreen>;

  if (manifest.data.mode === 'news') {
    return (
      <AppScreen>
        <Eyebrow>Neko News</Eyebrow>
        <ScreenHeader title="Últimas notícias" subtitle="Anime, mangá, indústria e cultura em um feed direto." />
        <button className="neko-search-launcher" type="button" onClick={() => void navigate({ to: '/buscar' })}>
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
      <button className="neko-search-launcher" type="button" onClick={() => void navigate({ to: '/buscar' })}>
        <span>⌕</span><span>Buscar anime...</span>
      </button>
      <Section title="Continuar assistindo" action={<button className="neko-link" onClick={() => void navigate({ to: '/lista' })}>Ver lista</button>}>
        {!session ? <div className="neko-list"><TextRow title="Entre na conta para sincronizar" meta="Seu progresso aparecerá aqui" trailing="›" onClick={() => void navigate({ to: '/conta' })} /></div> : null}
        {session && watching.isPending ? <div className="neko-skeleton short" /> : null}
        {session && watching.data?.length ? <div className="neko-list">{watching.data.map((item) => {
          const progress = item.durationSeconds > 0 ? Math.min(100, Math.round(item.positionSeconds / item.durationSeconds * 100)) : 0;
          return <AnimeListRow key={item.episodeId} title={item.title} meta={`T${item.seasonNumber} · Episódio ${String(item.episodeNumber).padStart(2, '0')}`} imageUrl={item.imageUrl} postType={item.type} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} trailing={`${progress}%`} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug }, search: { provider: undefined, ref: undefined } })} />;
        })}</div> : null}
        {session && watching.data && !watching.data.length ? <EmptyState title="Nada em andamento" description="Seu progresso aparecerá aqui depois que começar a assistir." /> : null}
        {session && watching.isError ? <p className="neko-error">Não foi possível carregar seu progresso agora.</p> : null}
      </Section>
      <Section title="Catálogo em destaque" action={<button className="neko-link" onClick={() => void navigate({ to: '/categorias' })}>Ver categorias</button>}>
        {catalog.isPending ? <div className="neko-skeleton short" /> : null}
        {catalog.data?.items.length ? <div className="neko-list">{catalog.data.items.map((item) => <AnimeListRow key={item.reference} title={item.title} meta={catalog.data?.server.name} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: providerSlug(item) }, search: { provider: item.serverId, ref: item.reference } })} />)}</div> : null}
        {catalog.isError ? <p className="neko-error">Não foi possível carregar o catálogo de {serverId ?? 'servidor'}.</p> : null}
      </Section>
      <Section title="Explorar categorias" action={<button className="neko-link" onClick={() => void navigate({ to: '/categorias' })}>Abrir categorias</button>}>
        <div className="neko-category-strip" aria-label="Categorias"><span>Ação</span><span>Aventura</span><span>Comédia</span><span>Drama</span><span>Fantasia</span></div>
      </Section>
    </AppScreen>
  );
}
