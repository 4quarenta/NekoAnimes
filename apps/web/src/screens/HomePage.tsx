import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchManifest, fetchNews, fetchProviderCatalog } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { providerSlug } from '../lib/provider-links';
import { AppScreen, Eyebrow, EmptyState, ScreenHeader, Section, TextRow } from '../components/AppScreen';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function HomePage() {
  const navigate = useNavigate();
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const serverId = useServerPreference((state) => state.serverId);
  const news = useQuery({ queryKey: ['news-home'], queryFn: () => fetchNews({ limit: 30 }), enabled: manifest.data?.mode === 'news' });
  const catalog = useQuery({ queryKey: ['provider-catalog-home', serverId], queryFn: () => fetchProviderCatalog(serverId!, { limit: 6 }), enabled: manifest.data?.mode === 'streaming' && Boolean(serverId) });

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
      <ScreenHeader title="O que você vai assistir?" subtitle="Rápido, direto e sem uma parede de capas." />
      <button className="neko-search-launcher" type="button" onClick={() => void navigate({ to: '/buscar' })}>
        <span>⌕</span><span>Buscar anime...</span>
      </button>
      <Section title="Continuar assistindo" action={<button className="neko-link" onClick={() => void navigate({ to: '/lista' })}>Ver lista</button>}>
        <div className="neko-list"><TextRow title="Entre na conta para sincronizar" meta="Seu progresso aparecerá aqui" trailing="›" onClick={() => void navigate({ to: '/conta' })} /></div>
      </Section>
      <Section title="Catálogo em destaque" action={<button className="neko-link" onClick={() => void navigate({ to: '/categorias' })}>Ver categorias</button>}>
        {catalog.isPending ? <div className="neko-skeleton short" /> : null}
        {catalog.data?.items.length ? <div className="neko-list">{catalog.data.items.map((item) => <TextRow key={item.reference} title={item.title} meta={catalog.data?.server.name} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: providerSlug(item) }, search: { provider: item.serverId, ref: item.reference } })} />)}</div> : null}
        {catalog.isError ? <p className="neko-error">Não foi possível carregar o catálogo de {serverId ?? 'servidor'}.</p> : null}
      </Section>
      <Section title="Explorar categorias" action={<button className="neko-link" onClick={() => void navigate({ to: '/categorias' })}>Abrir categorias</button>}>
        <div className="neko-category-strip" aria-label="Categorias"><span>Ação</span><span>Aventura</span><span>Comédia</span><span>Drama</span><span>Fantasia</span></div>
      </Section>
    </AppScreen>
  );
}
