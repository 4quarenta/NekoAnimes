import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { fetchAnime, fetchEpisodes, setLibraryItem } from '../lib/api';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

export function AnimeDetailPage() {
  const { slug } = useParams({ from: '/anime/$slug' });
  const navigate = useNavigate();
  const anime = useQuery({ queryKey: ['anime', slug], queryFn: () => fetchAnime(slug) });
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [visible, setVisible] = useState(10);
  const [libraryState, setLibraryState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const selectedSeasonId = seasonId ?? anime.data?.seasons[0]?.id ?? null;
  const episodeQuery = useQuery({
    queryKey: ['episodes', selectedSeasonId, visible],
    queryFn: () => fetchEpisodes(selectedSeasonId!, 0, visible),
    enabled: Boolean(selectedSeasonId)
  });

  if (anime.isPending) return <AppScreen><div className="neko-skeleton" /></AppScreen>;
  if (anime.isError) return <AppScreen><p className="neko-error">Anime não encontrado.</p></AppScreen>;

  const item = anime.data;

  async function addToLibrary() {
    setLibraryState('saving');
    try {
      await setLibraryItem(item.id, 'watchlist');
      setLibraryState('saved');
    } catch (error) {
      setLibraryState('idle');
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') void navigate({ to: '/conta' });
    }
  }

  return (
    <AppScreen>
      <Eyebrow>{item.type.toUpperCase()} · {item.year ?? '—'}</Eyebrow>
      <ScreenHeader title={item.title} subtitle={item.titleEnglish ?? item.titleRomaji ?? undefined} />
      <div className="neko-chips">
        <span>{item.status}</span>
        {item.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
        {item.scoreBasisPoints ? <span>★ {(item.scoreBasisPoints / 100).toFixed(2)}</span> : null}
      </div>
      <button className="neko-primary-button neko-library-button" type="button" disabled={libraryState !== 'idle'} onClick={() => void addToLibrary()}>
        {libraryState === 'saving' ? 'Adicionando...' : libraryState === 'saved' ? '✓ Na sua lista' : '+ Adicionar à minha lista'}
      </button>
      {item.synopsis ? <p className="neko-synopsis">{item.synopsis}</p> : null}

      <Section title="Temporadas">
        <div className="neko-season-tabs">
          {item.seasons.map((season) => (
            <button type="button" key={season.id} className={season.id === selectedSeasonId ? 'is-active' : ''} onClick={() => { setSeasonId(season.id); setVisible(10); }}>
              {season.title ?? `Temporada ${season.number}`}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Episódios">
        {episodeQuery.isPending ? <div className="neko-skeleton short" /> : null}
        {episodeQuery.data ? (
          <>
            <div className="neko-list">
              {episodeQuery.data.items.map((episode) => (
                <TextRow key={episode.id} title={`${episode.number}. ${episode.title ?? 'Episódio'}`} meta={episode.durationSeconds ? `${Math.round(episode.durationSeconds / 60)} min` : undefined} trailing="▶" onClick={() => NekoNative.player.open(episode.id)} />
              ))}
            </div>
            {episodeQuery.data.items.length < episodeQuery.data.total ? <button className="neko-more" type="button" onClick={() => setVisible((value) => value + 10)}>Mostrar mais</button> : null}
          </>
        ) : null}
      </Section>
    </AppScreen>
  );
}
