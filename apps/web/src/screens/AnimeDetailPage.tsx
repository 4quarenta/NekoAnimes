import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { fetchAnime, fetchEpisodes, fetchServerAnime, fetchServerProviderResolution, setLibraryItem, type AnimeDetail, type Episode, type ServerEpisode } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import '../server-dialog.css';

export function AnimeDetailPage() {
  const { slug } = useParams({ from: '/anime/$slug' });
  const search = useSearch({ from: '/anime/$slug' });
  const navigate = useNavigate();
  const defaultServerId = useServerPreference((state) => state.serverId);
  const providerId = search.provider ?? defaultServerId;
  const providerReference = search.ref;
  const legacyAnime = useQuery({ queryKey: ['anime', slug], queryFn: () => fetchAnime(slug), enabled: !providerReference });
  const providerAnime = useQuery({ queryKey: ['provider-anime', providerId, providerReference], queryFn: () => fetchServerAnime(providerId!, providerReference!), enabled: Boolean(providerId && providerReference), staleTime: 10 * 60 * 1000 });
  const item = useMemo(() => providerAnime.data ? normalizeProviderAnime(providerAnime.data, slug) : legacyAnime.data, [legacyAnime.data, providerAnime.data, slug]);
  const providerMode = Boolean(providerAnime.data);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [visible, setVisible] = useState(10);
  const [libraryState, setLibraryState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [selectedEpisode, setSelectedEpisode] = useState<ServerEpisode | null>(null);
  const selectedSeasonId = seasonId ?? item?.seasons[0]?.id ?? null;
  const selectedSeason = item?.seasons.find((season) => season.id === selectedSeasonId);
  const selectedProviderSeason = providerAnime.data?.seasons.find((season) => season.id === selectedSeasonId);
  const legacyEpisodeQuery = useQuery({ queryKey: ['episodes', selectedSeasonId, visible], queryFn: () => fetchEpisodes(selectedSeasonId!, 0, visible), enabled: Boolean(selectedSeasonId && !providerMode) });
  const providerResolution = useQuery({ queryKey: ['provider-resolution', providerId, providerAnime.data?.anime.reference, selectedEpisode?.reference], queryFn: () => fetchServerProviderResolution(providerId!, providerAnime.data!.anime.title, selectedEpisode!.seasonNumber, selectedEpisode!.number, providerAnime.data!.anime.reference, selectedEpisode!.reference), enabled: Boolean(providerMode && providerId && selectedEpisode), staleTime: 10 * 60 * 1000 });

  useEffect(() => {
    const resolution = providerResolution.data;
    const directSources = resolution?.sources.filter((source) => source.kind === 'direct') ?? [];
    const source = directSources.find((candidate) => candidate.isDefault) ?? directSources[0] ?? resolution?.sources.find((candidate) => candidate.kind === 'embed');
    if (!resolution || !source) return;
    const opened = NekoNative.player.open(resolution.episode.id, { ...source, url: source.playbackUrl ?? source.url });
    if (opened) setSelectedEpisode(null);
  }, [providerResolution.data]);

  const loading = providerReference ? providerAnime.isPending : legacyAnime.isPending;
  const error = providerReference ? providerAnime.isError : legacyAnime.isError;
  if (loading) return <AppScreen><div className="neko-skeleton" /></AppScreen>;
  if (error || !item) return <AppScreen><p className="neko-error">Não foi possível carregar este anime no servidor selecionado.</p></AppScreen>;
  const currentItem = item;

  const episodes = providerMode ? (selectedProviderSeason?.episodes ?? []).slice(0, visible) : (legacyEpisodeQuery.data?.items ?? []);
  const totalEpisodes = providerMode ? (selectedProviderSeason?.episodes.length ?? 0) : (legacyEpisodeQuery.data?.total ?? 0);

  function openEpisode(episode: Episode | ServerEpisode) {
    if ('reference' in episode) { setSelectedEpisode(episode); return; }
    const seasonNumber = currentItem.seasons.find((season) => season.id === episode.seasonId)?.number ?? 1;
    setSelectedEpisode({ id: episode.id, title: episode.title ?? `Episódio ${episode.number}`, number: episode.number, seasonNumber, reference: '', url: '', available: true });
  }

  async function addToLibrary() {
    setLibraryState('saving');
    try { await setLibraryItem(currentItem.id, 'watchlist'); setLibraryState('saved'); }
    catch (saveError) { setLibraryState('idle'); if (saveError instanceof Error && saveError.message === 'AUTH_REQUIRED') void navigate({ to: '/conta' }); }
  }

  return (
    <>
      <AppScreen>
        <Eyebrow>{item.type.toUpperCase()} · {item.year ?? '—'}{providerMode ? ` · ${providerAnime.data!.server.name}` : ''}</Eyebrow>
        <ScreenHeader title={item.title} subtitle={item.titleEnglish ?? item.titleRomaji ?? undefined} />
        <div className="neko-chips"><span>{item.status}</span>{item.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}{item.scoreBasisPoints ? <span>★ {(item.scoreBasisPoints / 100).toFixed(2)}</span> : null}</div>
        <button className="neko-primary-button neko-library-button" type="button" disabled={libraryState !== 'idle'} onClick={() => void addToLibrary()}>{libraryState === 'saving' ? 'Adicionando...' : libraryState === 'saved' ? '✓ Na sua lista' : '+ Adicionar à minha lista'}</button>
        {item.synopsis ? <p className="neko-synopsis">{item.synopsis}</p> : null}
        <Section title="Temporadas"><div className="neko-season-tabs">{item.seasons.map((season) => <button type="button" key={season.id} className={season.id === selectedSeasonId ? 'is-active' : ''} onClick={() => { setSeasonId(season.id); setVisible(10); }}>{season.title ?? `Temporada ${season.number}`}</button>)}</div></Section>
        <Section title="Episódios">
          {!providerMode && legacyEpisodeQuery.isPending ? <div className="neko-skeleton short" /> : null}
          {episodes.length ? <><div className="neko-list">{episodes.map((episode) => <TextRow key={episode.id} title={`${episode.number}. ${episode.title ?? 'Episódio'}`} meta={'durationSeconds' in episode && episode.durationSeconds ? `${Math.round(episode.durationSeconds / 60)} min` : undefined} trailing="▶" onClick={() => openEpisode(episode)} />)}</div>{episodes.length < totalEpisodes ? <button className="neko-more" type="button" onClick={() => setVisible((value) => value + 10)}>Mostrar mais</button> : null}</> : !legacyEpisodeQuery.isPending ? <p className="neko-account-notice">Nenhum episódio foi encontrado neste servidor.</p> : null}
        </Section>
      </AppScreen>
      {selectedEpisode && providerMode ? <div className="neko-server-dialog-backdrop" role="presentation"><div className="neko-server-dialog" role="dialog" aria-modal="true" aria-labelledby="neko-server-title"><header className="neko-server-dialog-header"><h2 id="neko-server-title">Abrindo episódio</h2><button className="neko-filter-close" type="button" aria-label="Fechar" onClick={() => setSelectedEpisode(null)}>×</button></header><div className="neko-server-dialog-body"><p className="neko-account-copy">Episódio {selectedEpisode.number} · {providerAnime.data!.server.name}</p>{providerResolution.isPending ? <div className="neko-skeleton short" /> : null}{providerResolution.isError ? <p className="neko-error">Não foi possível abrir o vídeo deste provider.</p> : null}{providerResolution.data && providerResolution.data.sources.length === 0 ? <p className="neko-error">Este episódio não possui uma fonte de vídeo disponível.</p> : null}{providerResolution.data && !NekoNative.isAvailable() ? <p className="neko-account-notice">A reprodução desta fonte está disponível no aplicativo Android.</p> : null}</div></div></div> : null}
    </>
  );
}

function normalizeProviderAnime(detail: Awaited<ReturnType<typeof fetchServerAnime>>, slug: string): AnimeDetail {
  return { id: `provider:${detail.server.id}:${detail.anime.reference}`, slug, title: detail.anime.title, titleEnglish: null, titleRomaji: null, titleNative: null, synopsis: null, type: 'tv', status: 'disponível', year: detail.anime.year ?? null, genres: [], scoreBasisPoints: null, imageUrl: null, externalIds: [{ provider: detail.server.id, externalId: detail.anime.reference }], seasons: detail.seasons.map((season) => ({ id: season.id, animeId: `provider:${detail.server.id}:${detail.anime.reference}`, number: season.number, title: season.title, episodesCount: season.episodes.length })) };
}
