import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchProviderCatalog, fetchServers } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { providerSlug } from '../lib/provider-links';
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
  const serverId = useServerPreference((state) => state.serverId);
  const servers = useQuery({ queryKey: ['servers'], queryFn: fetchServers, staleTime: 10 * 60 * 1000 });
  const serverName = servers.data?.servers.find((server) => server.id === serverId)?.name;
  const catalog = useQuery({ queryKey: ['provider-catalog', serverId, letter], queryFn: () => fetchProviderCatalog(serverId!, { letter, limit: 100 }), enabled: Boolean(serverId) });
  const filterCatalog = useQuery({ queryKey: ['provider-catalog-filter-options', serverId], queryFn: () => fetchProviderCatalog(serverId!, { limit: 100 }), enabled: Boolean(serverId) });
  const availableItems = [...(filterCatalog.data?.items ?? []), ...(catalog.data?.items ?? [])];
  const statuses: string[] = [];
  const genres: string[] = [];
  const years: number[] = [];
  const filteredItems = useMemo(() => catalog.data?.items ?? [], [catalog.data?.items]);
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
      <ScreenHeader title="Catálogo A–Z" subtitle={serverName ? `Conteúdo de ${serverName}.` : 'Escolha um servidor para carregar o catálogo.'} />
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
                <TextRow key={item.reference} title={item.title} meta={serverName} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: providerSlug(item) }, search: { provider: item.serverId, ref: item.reference } })} />
            ))}
          </div>
        ) : catalog.data ? <EmptyState title="Nenhum título" description={activeFilterCount ? 'Os filtros locais não se aplicam ao catálogo do provider.' : `Ainda não há títulos na letra ${letter} neste servidor.`} /> : null}
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
