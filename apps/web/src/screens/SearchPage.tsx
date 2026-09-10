import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchCatalog, fetchManifest, fetchNews } from '../lib/api';
import { AppScreen, Eyebrow, EmptyState, ScreenHeader, TextRow } from '../components/AppScreen';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const normalized = query.trim();
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const newsMode = manifest.data?.mode === 'news';

  const catalogResults = useQuery({
    queryKey: ['catalog-search', normalized],
    queryFn: () => fetchCatalog({ query: normalized, limit: 50 }),
    enabled: !newsMode && normalized.length >= 2
  });
  const newsResults = useQuery({
    queryKey: ['news-search', normalized],
    queryFn: () => fetchNews({ query: normalized, limit: 50 }),
    enabled: newsMode && normalized.length >= 2
  });

  if (manifest.isPending) return <AppScreen><div className="neko-skeleton" /></AppScreen>;

  return (
    <AppScreen>
      <Eyebrow>{newsMode ? 'Neko News' : 'NekoAnimes'}</Eyebrow>
      <ScreenHeader
        title="Buscar"
        subtitle={newsMode ? 'Pesquise por título, resumo ou fonte.' : 'Nome, título em inglês ou título romanizado.'}
      />
      <label className="neko-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={newsMode ? 'Buscar notícia...' : 'Buscar anime...'}
          autoComplete="off"
          inputMode="search"
        />
      </label>
      {normalized.length < 2 ? <EmptyState title="Digite para pesquisar" description="A busca começa a partir de 2 caracteres." /> : null}
      {newsMode ? (
        <>
          {newsResults.isPending && normalized.length >= 2 ? <div className="neko-skeleton short" /> : null}
          {newsResults.data?.items.length ? (
            <div className="neko-list neko-results">
              {newsResults.data.items.map((item) => (
                <TextRow key={item.id} title={item.title} meta={`${item.category} · ${item.sourceName}`} trailing="›" onClick={() => void navigate({ to: '/noticias/$slug', params: { slug: item.slug } })} />
              ))}
            </div>
          ) : newsResults.data ? <EmptyState title="Nenhuma notícia encontrada" description="Tente outro termo de pesquisa." /> : null}
        </>
      ) : (
        <>
          {catalogResults.isPending && normalized.length >= 2 ? <div className="neko-skeleton short" /> : null}
          {catalogResults.data?.items.length ? (
            <div className="neko-list neko-results">
              {catalogResults.data.items.map((item) => <TextRow key={item.id} title={item.title} meta={[item.year, item.genres[0], item.status].filter(Boolean).join(' · ')} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug } })} />)}
            </div>
          ) : catalogResults.data ? <EmptyState title="Nenhum resultado" description="Tente outro nome ou título alternativo." /> : null}
        </>
      )}
    </AppScreen>
  );
}
