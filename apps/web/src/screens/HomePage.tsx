import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchManifest, fetchNews } from '../lib/api';
import { AppScreen, Eyebrow, EmptyState, ScreenHeader, Section, TextRow } from '../components/AppScreen';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function HomePage() {
  const navigate = useNavigate();
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const news = useQuery({ queryKey: ['news-home'], queryFn: () => fetchNews({ limit: 30 }), enabled: manifest.data?.mode === 'news' });

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
        <div className="neko-list"><TextRow title="Anime Alpha" meta="T1 · Episódio 4" trailing="42%" /><TextRow title="Anime Beta" meta="T2 · Episódio 8" trailing="71%" /></div>
      </Section>
      <Section title="Lançamentos de hoje">
        <div className="neko-list"><TextRow title="Anime Gamma" meta="Episódio 7 · 18:30" trailing="›" /><TextRow title="Anime Delta" meta="Episódio 11 · 21:00" trailing="›" /></div>
      </Section>
      <Section title="Explorar A–Z" action={<button className="neko-link" onClick={() => void navigate({ to: '/catalogo' })}>Abrir catálogo</button>}>
        <div className="neko-letter-preview">{'ABCDEFG'.split('').map((letter) => <span key={letter}>{letter}</span>)}</div>
      </Section>
    </AppScreen>
  );
}
