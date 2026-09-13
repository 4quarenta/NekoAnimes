import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { fetchCatalog, fetchGenres } from '../lib/api';

const genreLabels: Record<string, string> = {
  Action: 'Ação', Adventure: 'Aventura', 'Avant Garde': 'Vanguarda', 'Award Winning': 'Premiados',
  'Boys Love': 'Boys Love', Comedy: 'Comédia', Drama: 'Drama', Ecchi: 'Ecchi', Erotica: 'Erótico',
  Fantasy: 'Fantasia', 'Girls Love': 'Girls Love', Gourmet: 'Gastronomia', Horror: 'Terror',
  Mystery: 'Mistério', Romance: 'Romance', 'Sci-Fi': 'Ficção científica', Sports: 'Esportes',
  Supernatural: 'Sobrenatural', Suspense: 'Suspense'
};

function displayGenre(name: string) { return genreLabels[name] ?? name; }

export function CategoriesPage() {
  const navigate = useNavigate();
  const [selectedGenreId, setSelectedGenreId] = useState<number | null>(null);
  const genres = useQuery({ queryKey: ['catalog-genres'], queryFn: fetchGenres, staleTime: 60 * 60 * 1000 });
  const selectedGenre = genres.data?.items.find((genre) => genre.id === selectedGenreId);
  const anime = useQuery({
    queryKey: ['catalog-genre', selectedGenreId],
    queryFn: () => fetchCatalog({ genreId: selectedGenreId!, limit: 24 }),
    enabled: selectedGenreId !== null,
    staleTime: 10 * 60 * 1000
  });

  return (
    <AppScreen>
      <Eyebrow>MyAnimeList</Eyebrow>
      <ScreenHeader title="Categorias" subtitle="Explore os gêneros oficiais disponíveis no catálogo." />
      <Section title="Todos os gêneros">
        {genres.isPending ? <div className="neko-skeleton short" /> : null}
        {genres.isError ? <p className="neko-error">Não foi possível carregar as categorias agora.</p> : null}
        {genres.data?.items.length ? (
          <div className="neko-category-grid">
            {genres.data.items.map((genre) => (
              <button
                className={selectedGenreId === genre.id ? 'neko-category-card is-active' : 'neko-category-card'}
                key={genre.id}
                type="button"
                onClick={() => setSelectedGenreId((current) => current === genre.id ? null : genre.id)}
              >
                <span className="neko-category-mark" aria-hidden="true">✦</span>
                <strong>{displayGenre(genre.name)}</strong>
                <small>{genre.count ? `${genre.count.toLocaleString('pt-BR')} títulos` : 'Ver títulos'}</small>
              </button>
            ))}
          </div>
        ) : null}
      </Section>

      {selectedGenre ? (
        <Section title={displayGenre(selectedGenre.name)} action={<button className="neko-link" type="button" onClick={() => setSelectedGenreId(null)}>Fechar</button>}>
          {anime.isPending ? <div className="neko-skeleton short" /> : null}
          {anime.isError ? <p className="neko-error">Não foi possível carregar os animes desta categoria.</p> : null}
          {anime.data?.items.length ? (
            <div className="neko-list">
              {anime.data.items.map((item) => <TextRow key={item.id} title={item.title} meta={[item.year, item.status].filter(Boolean).join(' · ')} trailing="›" imageUrl={item.imageUrl} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug } })} />)}
            </div>
          ) : anime.data ? <EmptyState title="Nenhum anime encontrado" description="A categoria não retornou títulos neste momento." /> : null}
        </Section>
      ) : null}
    </AppScreen>
  );
}
