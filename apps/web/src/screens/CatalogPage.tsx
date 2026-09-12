import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchCatalog } from '../lib/api';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
type CatalogFilters = { status: string; genre: string; year: string };
const emptyFilters: CatalogFilters = { status: '', genre: '', year: '' };

const statusLabels: Record<string, string> = {
  finished: 'Concluído',
  releasing: 'Em lançamento',
  upcoming: 'Em breve',
  cancelled: 'Cancelado',
  unknown: 'Desconhecido'
};

export function CatalogPage() {
  const [letter, setLetter] = useState('A');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<CatalogFilters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(emptyFilters);
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: ['catalog', letter], queryFn: () => fetchCatalog({ letter, limit: 100 }) });
  const filterCatalog = useQuery({ queryKey: ['catalog-filter-options'], queryFn: () => fetchCatalog({ limit: 100 }) });
  const availableItems = [...(filterCatalog.data?.items ?? []), ...(catalog.data?.items ?? [])];
  const statuses = [...new Set(availableItems.map((item) => item.status).filter(Boolean))].sort();
  const genres = [...new Set(availableItems.flatMap((item) => item.genres))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(availableItems.map((item) => item.year).filter((year): year is number => year !== null))].sort((a, b) => b - a);
  const filteredItems = useMemo(() => (catalog.data?.items ?? []).filter((item) => (
    (!filters.status || item.status === filters.status) &&
    (!filters.genre || item.genres.includes(filters.genre)) &&
    (!filters.year || String(item.year) === filters.year)
  )), [catalog.data?.items, filters]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    if (!filterOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [filterOpen]);

  function openFilters() {
    setDraftFilters(filters);
    setFilterOpen(true);
  }

  function applyFilters() {
    setFilters(draftFilters);
    setFilterOpen(false);
  }

  function clearFilters() {
    setDraftFilters(emptyFilters);
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Catálogo A–Z" subtitle="Encontre rapidamente pelo nome, sem depender de capas." />
      <div className="neko-catalog-toolbar">
        <span>{activeFilterCount ? `${activeFilterCount} filtro${activeFilterCount > 1 ? 's' : ''} ativo${activeFilterCount > 1 ? 's' : ''}` : 'Refine o catálogo'}</span>
        <button className={activeFilterCount ? 'neko-filter-button is-active' : 'neko-filter-button'} type="button" onClick={openFilters}>
          ☷ Filtros{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
      <div className="neko-letter-strip" aria-label="Filtrar por letra">
        {letters.map((item) => <button type="button" key={item} className={item === letter ? 'is-active' : ''} onClick={() => setLetter(item)}>{item}</button>)}
      </div>
      <Section title={`Letra ${letter}`}>
        {catalog.isPending ? <div className="neko-skeleton short" /> : null}
        {filteredItems.length ? (
          <div className="neko-list">
            {filteredItems.map((item) => (
              <TextRow key={item.id} title={item.title} meta={[item.year, item.genres[0], item.status].filter(Boolean).join(' · ')} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug } })} />
            ))}
          </div>
        ) : catalog.data ? <EmptyState title="Nenhum título" description={activeFilterCount ? 'Nenhum título corresponde aos filtros escolhidos.' : `Ainda não há títulos na letra ${letter}.`} /> : null}
      </Section>

      {filterOpen ? (
        <div className="neko-filter-modal" role="dialog" aria-modal="true" aria-labelledby="neko-filter-title">
          <header className="neko-filter-modal-header">
            <button className="neko-filter-close" type="button" onClick={() => setFilterOpen(false)}>Fechar</button>
            <h2 id="neko-filter-title">Filtros</h2>
            <button className="neko-filter-clear" type="button" onClick={clearFilters}>Limpar</button>
          </header>
          <div className="neko-filter-modal-body">
            <label className="neko-filter-field">
              <span>Status</span>
              <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="">Todos os status</option>
                {statuses.map((status) => <option key={status} value={status}>{statusLabels[status] ?? status}</option>)}
              </select>
            </label>
            <label className="neko-filter-field">
              <span>Gênero</span>
              <select value={draftFilters.genre} onChange={(event) => setDraftFilters((current) => ({ ...current, genre: event.target.value }))}>
                <option value="">Todos os gêneros</option>
                {genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
              </select>
            </label>
            <label className="neko-filter-field">
              <span>Ano</span>
              <select value={draftFilters.year} onChange={(event) => setDraftFilters((current) => ({ ...current, year: event.target.value }))}>
                <option value="">Todos os anos</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </div>
          <footer className="neko-filter-modal-footer">
            <button className="neko-primary-button" type="button" onClick={applyFilters}>Aplicar filtros</button>
          </footer>
        </div>
      ) : null}
    </AppScreen>
  );
}
