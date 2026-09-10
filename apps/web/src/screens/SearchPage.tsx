import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchCatalog } from '../lib/api';
import { AppScreen, Eyebrow, EmptyState, ScreenHeader, TextRow } from '../components/AppScreen';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const normalized = query.trim();
  const results = useQuery({
    queryKey: ['catalog-search', normalized],
    queryFn: () => fetchCatalog({ query: normalized, limit: 50 }),
    enabled: normalized.length >= 2
  });

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Buscar" subtitle="Nome, título em inglês ou título romanizado." />
      <label className="neko-search">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar anime..." autoComplete="off" inputMode="search" />
      </label>
      {normalized.length < 2 ? <EmptyState title="Digite para pesquisar" description="A busca começa a partir de 2 caracteres." /> : null}
      {results.isPending && normalized.length >= 2 ? <div className="neko-skeleton short" /> : null}
      {results.data?.items.length ? (
        <div className="neko-list neko-results">
          {results.data.items.map((item) => <TextRow key={item.id} title={item.title} meta={[item.year, item.genres[0], item.status].filter(Boolean).join(' · ')} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug } })} />)}
        </div>
      ) : results.data ? <EmptyState title="Nenhum resultado" description="Tente outro nome ou título alternativo." /> : null}
    </AppScreen>
  );
}
