import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import {
  fetchAnime,
  fetchEpisodes,
  fetchServerResolution,
  setLibraryItem,
  type Episode
} from '../lib/api';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

export function AnimeDetailPage() {
  const { slug } = useParams({ from: '/anime/$slug' });
  const navigate = useNavigate();
  const anime = useQuery({ queryKey: ['anime', slug], queryFn: () => fetchAnime(slug) });
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [visible, setVisible] = useState(10);
  const [libraryState, setLibraryState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedEpisode, setSelectedEpisode] = useState<{ id: string; number: number; title: string | null; seasonNumber: number } | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const selectedSeasonId = seasonId ?? anime.data?.seasons[0]?.id ?? null;
  const episodeQuery = useQuery({
    queryKey: ['episodes', selectedSeasonId, visible],
    queryFn: () => fetchEpisodes(selectedSeasonId!, 0, visible),
    enabled: Boolean(selectedSeasonId)
  });
  const serverResolution = useQuery({
    queryKey: ['server-resolution', anime.data?.title, selectedEpisode?.seasonNumber, selectedEpisode?.number],
    queryFn: () => fetchServerResolution(anime.data!.title, selectedEpisode!.seasonNumber, selectedEpisode!.number),
    enabled: Boolean(anime.data?.title && selectedEpisode),
    staleTime: 10 * 60 * 1000
  });

  if (anime.isPending) return <AppScreen><div className="neko-skeleton" /></AppScreen>;
  if (anime.isError) return <AppScreen><p className="neko-error">Anime não encontrado.</p></AppScreen>;

  const item = anime.data;

  function openEpisode(episode: Episode) {
    const seasonNumber = item.seasons.find((season) => season.id === episode.seasonId)?.number ?? 1;
    setSelectedServerId(null);
    setSelectedEpisode({ id: episode.id, number: episode.number, title: episode.title, seasonNumber });
  }

  function openInternalPlayer() {
    if (!selectedEpisode) return;
    NekoNative.player.open(selectedEpisode.id);
    setSelectedEpisode(null);
    setSelectedServerId(null);
  }

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
    <>
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
                  <TextRow key={episode.id} title={`${episode.number}. ${episode.title ?? 'Episódio'}`} meta={episode.durationSeconds ? `${Math.round(episode.durationSeconds / 60)} min` : undefined} trailing="▶" onClick={() => openEpisode(episode)} />
                ))}
              </div>
              {episodeQuery.data.items.length < episodeQuery.data.total ? <button className="neko-more" type="button" onClick={() => setVisible((value) => value + 10)}>Mostrar mais</button> : null}
            </>
          ) : null}
        </Section>
      </AppScreen>

      {selectedEpisode ? (
        <div className="neko-filter-modal neko-server-modal" role="dialog" aria-modal="true" aria-labelledby="neko-server-title">
          <header className="neko-filter-modal-header">
            <h2 id="neko-server-title">Escolher servidor</h2>
            <button className="neko-filter-close" type="button" onClick={() => setSelectedEpisode(null)}>Fechar</button>
          </header>
          <div className="neko-filter-modal-body">
            <p className="neko-account-copy">Episódio {selectedEpisode.number}{selectedEpisode.title ? ` · ${selectedEpisode.title}` : ''}</p>
            {serverResolution.isPending ? <div className="neko-skeleton short" /> : null}
            {serverResolution.isError ? <p className="neko-error">Não foi possível consultar os servidores agora.</p> : null}
            {serverResolution.data ? (
              <div className="neko-list">
                {serverResolution.data.servers.map((result) => {
                  const selected = selectedServerId === result.server.id;
                  const meta = result.available
                    ? 'Episódio disponível neste servidor'
                    : result.status === 'timeout'
                      ? 'Tempo de resposta esgotado'
                      : result.status === 'error'
                        ? 'Servidor indisponível'
                        : 'Episódio não encontrado';
                  return <TextRow key={result.server.id} title={result.server.name} meta={meta} trailing={selected ? '✓' : result.available ? 'Selecionar' : '—'} onClick={result.available ? () => setSelectedServerId(result.server.id) : undefined} />;
                })}
              </div>
            ) : null}
            {selectedServerId ? <div className="neko-account-notice"><strong>Servidor selecionado</strong><p>O catálogo do provider foi localizado. A reprodução por esse servidor ainda não está configurada no player do app.</p></div> : null}
          </div>
          <footer className="neko-filter-modal-footer neko-server-actions">
            <button className="neko-more" type="button" onClick={openInternalPlayer}>Testar player interno</button>
            <button className="neko-primary-button" type="button" onClick={() => { setSelectedEpisode(null); setSelectedServerId(null); }}>Fechar</button>
          </footer>
        </div>
      ) : null}
    </>
  );
}
