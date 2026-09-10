import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchNewsArticle } from '../lib/api';
import { getSavedNews } from '../lib/news-saved';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, TextRow } from '../components/AppScreen';

export function SavedNewsPage() {
  const navigate = useNavigate();
  const [slugs, setSlugs] = useState(getSavedNews);

  useEffect(() => {
    const sync = () => setSlugs(getSavedNews());
    window.addEventListener('neko:news-saved', sync);
    return () => window.removeEventListener('neko:news-saved', sync);
  }, []);

  const queries = useQueries({
    queries: slugs.map((slug) => ({ queryKey: ['news-article', slug], queryFn: () => fetchNewsArticle(slug) }))
  });
  const items = queries.flatMap((query) => query.data ? [query.data] : []);

  return (
    <AppScreen>
      <Eyebrow>Neko News</Eyebrow>
      <ScreenHeader title="Salvos" subtitle="Notícias marcadas neste dispositivo." />
      {!slugs.length ? <EmptyState title="Nada salvo ainda" description="Abra uma notícia e toque em Salvar para encontrá-la aqui." /> : null}
      {items.length ? (
        <div className="neko-list neko-results">
          {items.map((item) => (
            <TextRow key={item.id} title={item.title} meta={`${item.category} · ${item.sourceName}`} trailing="›" onClick={() => void navigate({ to: '/noticias/$slug', params: { slug: item.slug } })} />
          ))}
        </div>
      ) : null}
    </AppScreen>
  );
}
