import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { fetchGenres, fetchProviderCatalog, fetchServers } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { providerSlug } from '../lib/provider-links';

const genreLabels: Record<string, string> = {
  Action: 'Ação', Adventure: 'Aventura', 'Avant Garde': 'Vanguarda', 'Award Winning': 'Premiados',
  'Boys Love': 'Boys Love', Comedy: 'Comédia', Drama: 'Drama', Ecchi: 'Ecchi', Erotica: 'Erótico',
  Fantasy: 'Fantasia', 'Girls Love': 'Girls Love', Gourmet: 'Gastronomia', Horror: 'Terror',
  Mystery: 'Mistério', Romance: 'Romance', 'Sci-Fi': 'Ficção científica', Sports: 'Esportes',
  Supernatural: 'Sobrenatural', Suspense: 'Suspense'
};

function displayGenre(name: string) { return genreLabels[name] ?? name; }

function GenreCard({ id, name, count, onClick }: { id: number; name: string; count: number; onClick: () => void }) {
  return (
    <button className="neko-category-card" type="button" onClick={onClick}>
      <span className="neko-category-mark" aria-hidden="true">✦</span>
      <strong>{displayGenre(name)}</strong>
      <small>{count ? `${count.toLocaleString('pt-BR')} títulos` : 'Ver títulos'}</small>
    </button>
  );
}

export function CategoriesPage() {
  const navigate = useNavigate();
  const genres = useQuery({ queryKey: ['catalog-genres'], queryFn: fetchGenres, staleTime: 60 * 60 * 1000 });

  return (
    <AppScreen>
      <Eyebrow>MyAnimeList</Eyebrow>
      <ScreenHeader title="Categorias" subtitle="Explore os gêneros oficiais disponíveis no catálogo." />
      <Section title="Todos os gêneros">
        {genres.isPending ? <div className="neko-skeleton short" /> : null}
        {genres.isError ? <p className="neko-error">Não foi possível carregar as categorias agora.</p> : null}
        {genres.data?.items.length ? (
          <div className="neko-category-grid">
            {genres.data.items.map((genre) => <GenreCard key={genre.id} {...genre} onClick={() => void navigate({ to: '/categorias/$genreId', params: { genreId: String(genre.id) } })} />)}
          </div>
        ) : null}
      </Section>
    </AppScreen>
  );
}

export function CategoryDetailPage() {
  const navigate = useNavigate();
  const serverId = useServerPreference((state) => state.serverId);
  const { genreId } = useParams({ from: '/categorias/$genreId' });
  const parsedGenreId = Number(genreId);
  const genres = useQuery({ queryKey: ['catalog-genres'], queryFn: fetchGenres, staleTime: 60 * 60 * 1000 });
  const servers = useQuery({ queryKey: ['servers'], queryFn: fetchServers, staleTime: 10 * 60 * 1000 });
  const selectedGenre = genres.data?.items.find((genre) => genre.id === parsedGenreId);
  const serverName = servers.data?.servers.find((server) => server.id === serverId)?.name;
  const anime = useQuery({
    queryKey: ['provider-catalog-genre', serverId, selectedGenre?.name],
    queryFn: () => fetchProviderCatalog(serverId!, { genre: selectedGenre!.name, limit: 24 }),
    enabled: Number.isInteger(parsedGenreId) && parsedGenreId > 0 && Boolean(selectedGenre && serverId),
    staleTime: 10 * 60 * 1000
  });

  return (
    <AppScreen>
      <button className="neko-link neko-category-back" type="button" onClick={() => void navigate({ to: '/categorias' })}>‹ Todas as categorias</button>
      <Eyebrow>MyAnimeList</Eyebrow>
      <ScreenHeader title={selectedGenre ? displayGenre(selectedGenre.name) : 'Categoria'} subtitle={serverName ? `Animes de ${serverName} nesta categoria.` : 'Animes encontrados nesta categoria.'} />
      <Section title="Animes">
        {anime.isPending ? <div className="neko-skeleton short" /> : null}
        {anime.isError ? <p className="neko-error">Não foi possível carregar os animes desta categoria.</p> : null}
        {anime.data?.items.length ? (
          <div className="neko-list">
            {anime.data.items.map((item) => <TextRow key={item.reference} title={item.title} meta={serverName} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: providerSlug(item) }, search: { provider: item.serverId, ref: item.reference } })} />)}
          </div>
        ) : anime.data ? <EmptyState title="Nenhum anime encontrado" description="A categoria não retornou títulos neste momento." /> : null}
      </Section>
    </AppScreen>
  );
}
