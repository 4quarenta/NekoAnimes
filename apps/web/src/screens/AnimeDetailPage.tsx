import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { fetchAnime, fetchAniListMetadata, fetchEpisodes, fetchServerAnime, fetchServerProviderResolution, saveProviderAnimeData, setLibraryItem, type AnimeDetail, type Episode, type RemoteAnimeMetadata, type ServerEpisode } from '../lib/api';
import { readLocalContinueWatching, rememberActivePlayback, type LocalContinueWatching } from '../lib/local-progress';
import { useServerPreference } from '../lib/server-preference';
import { AppScreen, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';

type EpisodeOrder = 'asc' | 'desc';

export function AnimeDetailPage() {
  const { slug } = useParams({ from: '/anime/$slug' });
  const search = useSearch({ from: '/anime/$slug' });
  const navigate = useNavigate();
  const defaultServerId = useServerPreference((state) => state.serverId);
  const providerId = search.provider ?? defaultServerId;
  const providerReference = search.ref;
  const legacyAnime = useQuery({ queryKey: ['anime', slug], queryFn: () => fetchAnime(slug), enabled: !providerReference });
  const providerAnime = useQuery({ queryKey: ['provider-anime', providerId, providerReference], queryFn: () => fetchServerAnime(providerId!, providerReference!), enabled: Boolean(providerId && providerReference), staleTime: 10 * 60 * 1000 });
  const providerMode = Boolean(providerAnime.data);
  const providerIdentity = providerAnime.data?.identity;
  const remoteMetadata = useQuery({ queryKey: ['anilist-metadata', providerAnime.data?.anime.title], queryFn: () => fetchAniListMetadata(providerAnime.data!.anime.title), enabled: Boolean(providerMode && providerAnime.data?.anime.title && (!providerIdentity?.imageUrl || !providerIdentity.synopsis)), staleTime: 24 * 60 * 60 * 1000, retry: 1 });
  const item = useMemo(() => providerAnime.data ? normalizeProviderAnime(providerAnime.data, slug, remoteMetadata.data) : legacyAnime.data, [legacyAnime.data, providerAnime.data, remoteMetadata.data, slug]);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [visible, setVisible] = useState(60);
  const [episodeOrder, setEpisodeOrder] = useState<EpisodeOrder>('asc');
  const [libraryState, setLibraryState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [dataState, setDataState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<ServerEpisode | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [viewedEpisodes, setViewedEpisodes] = useState<Set<string>>(new Set());
  const [continueWatching, setContinueWatching] = useState<LocalContinueWatching | null>(null);
  const selectedSeasonId = seasonId ?? item?.seasons[0]?.id ?? null;
  const selectedSeason = item?.seasons.find((season) => season.id === selectedSeasonId);
  const selectedProviderSeason = providerAnime.data?.seasons.find((season) => season.id === selectedSeasonId);
  const legacyEpisodeQuery = useQuery({ queryKey: ['episodes', selectedSeasonId, visible], queryFn: () => fetchEpisodes(selectedSeasonId!, 0, visible), enabled: Boolean(selectedSeasonId && !providerMode) });
  const providerResolution = useQuery({ queryKey: ['provider-resolution', providerId, providerAnime.data?.anime.reference, selectedEpisode?.reference], queryFn: () => fetchServerProviderResolution(providerId!, providerAnime.data!.anime.title, selectedEpisode!.seasonNumber, selectedEpisode!.number, providerAnime.data!.anime.reference, selectedEpisode!.reference), enabled: Boolean(providerMode && providerId && selectedEpisode), staleTime: 10 * 60 * 1000, retry: 1 });

  useEffect(() => {
    if (item) setViewedEpisodes(readViewedEpisodes(item.id));
  }, [item?.id]);

  useEffect(() => {
    const resolution = providerResolution.data;
    if (!resolution || !selectedEpisode || !item) return;
    const directSources = resolution.sources.filter((source) => source.kind === 'direct');
    const source = directSources.find((candidate) => candidate.isDefault) ?? directSources[0] ?? resolution.sources.find((candidate) => candidate.kind === 'embed');
    if (!source) { setPlaybackError('Este episódio não possui uma fonte de vídeo disponível.'); return; }
    rememberActivePlayback({
      animeId: item.id,
      slug: item.slug,
      title: item.title,
      imageUrl: item.imageUrl ?? null,
      seasonNumber: resolution.season,
      episodeId: resolution.episode.id,
      episodeNumber: resolution.episode.number,
      episodeTitle: resolution.episode.title,
      providerId: providerId ?? undefined,
      animeReference: providerAnime.data?.anime.reference,
      episodeReference: resolution.episode.reference
    });
    const opened = NekoNative.player.open(resolution.episode.id, { ...source, url: source.playbackUrl ?? source.url });
    if (opened) {
      markEpisodeViewed(resolution.episode);
      setSelectedEpisode(null);
      setPlaybackError(null);
    } else setPlaybackError('A reprodução desta fonte está disponível no aplicativo Android.');
  }, [providerResolution.data, selectedEpisode]);

  useEffect(() => {
    if (!item) return;
    const sync = () => setContinueWatching(readLocalContinueWatching(item.id));
    sync();
    window.addEventListener('neko-progress-updated', sync);
    return () => window.removeEventListener('neko-progress-updated', sync);
  }, [item?.id]);

  const loading = providerReference ? providerAnime.isPending : legacyAnime.isPending;
  const error = providerReference ? providerAnime.isError : legacyAnime.isError;
  if (loading) return <AppScreen><div className="neko-skeleton" /></AppScreen>;
  if (error || !item) return <AppScreen><p className="neko-error">Não foi possível carregar este anime no servidor selecionado.</p></AppScreen>;
  const currentItem = item;
  const episodes = providerMode ? (selectedProviderSeason?.episodes ?? []).slice(0, visible) : (legacyEpisodeQuery.data?.items ?? []);
  const orderedEpisodes = [...episodes].sort((left, right) => (episodeNumber(left) - episodeNumber(right)) * (episodeOrder === 'asc' ? 1 : -1));
  const totalEpisodes = providerMode ? (selectedProviderSeason?.episodes.length ?? 0) : (legacyEpisodeQuery.data?.total ?? 0);
  const backdropUrl = providerAnime.data?.identity?.backdropUrl;

  function openEpisode(episode: Episode | ServerEpisode) {
    setPlaybackError(null);
    if ('reference' in episode) { setSelectedEpisode(episode); return; }
    setPlaybackError('Este episódio pertence ao catálogo legado e ainda não possui uma fonte provider vinculada.');
  }

  function resumeWatching() {
    if (!continueWatching || !providerMode || !providerAnime.data) return;
    const targetSeason = providerAnime.data.seasons.find((season) => season.number === continueWatching.seasonNumber);
    const targetEpisode = targetSeason?.episodes.find((episode) => episode.id === continueWatching.episodeId || episode.number === continueWatching.episodeNumber);
    if (!targetSeason || !targetEpisode) {
      setPlaybackError('O episódio salvo não está mais disponível neste provider.');
      return;
    }
    setSeasonId(targetSeason.id);
    openEpisode(targetEpisode);
  }

  function markEpisodeViewed(episode: ServerEpisode) {
    const key = viewedEpisodeKey(currentItem.id, episode.seasonNumber, episode.number);
    setViewedEpisodes((previous) => {
      const next = new Set(previous).add(key);
      persistViewedEpisodes(currentItem.id, next);
      return next;
    });
  }

  async function addToLibrary() {
    setLibraryState('saving');
    try { await setLibraryItem(currentItem.id, 'watchlist'); setLibraryState('saved'); }
    catch (saveError) { setLibraryState('idle'); if (saveError instanceof Error && saveError.message === 'AUTH_REQUIRED') void navigate({ to: '/conta' }); }
  }

  async function loadAnimeData() {
    if (!providerMode || !providerAnime.data || !providerId) return;
    setDataState('loading');
    setDataMessage(null);
    try {
      const result = await saveProviderAnimeData(providerId, providerAnime.data.anime.reference);
      setDataState('loaded');
      setDataMessage(result.sources.anidb ? 'Dados salvos: MAL, AniList e AniDB.' : 'Dados salvos: MAL e AniList.');
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'AUTH_REQUIRED') {
        void navigate({ to: '/conta' });
        return;
      }
      setDataState('error');
      setDataMessage('Não foi possível carregar os dados agora. Tente novamente.');
    }
  }

  return (
    <AppScreen>
      {backdropUrl ? <div className="neko-anime-hero" style={{ backgroundImage: `linear-gradient(180deg, rgba(13, 10, 28, .18), var(--neko-bg) 92%), url(${backdropUrl})` }} aria-hidden="true" /> : null}
      <div className="neko-anime-detail-content">
        <Eyebrow>{contentTypeLabel(currentItem.type)} · {currentItem.year ?? providerAnime.data?.identity?.year ?? '—'}{providerMode ? ` · ${providerAnime.data!.server.name}` : ''}</Eyebrow>
        <ScreenHeader title={currentItem.title} subtitle={currentItem.titleEnglish ?? currentItem.titleRomaji ?? undefined} />
        {currentItem.imageUrl ? <img className="neko-anime-poster" src={currentItem.imageUrl} alt={`Capa de ${currentItem.title}`} /> : null}
        {providerAnime.data?.identity ? <div className="neko-external-meta"><span>MAL {providerAnime.data.identity.malId ?? '—'}</span><span>AniList {providerAnime.data.identity.anilistId ?? '—'}</span></div> : null}
        <div className="neko-chips"><span>{currentItem.status}</span>{currentItem.genres.slice(0, 4).map((genre) => <span key={genre}>{genre}</span>)}{currentItem.scoreBasisPoints ? <span>★ {(currentItem.scoreBasisPoints / 100).toFixed(2)}</span> : null}</div>
        <div className="neko-anime-actions">
          <button className="neko-primary-button neko-library-button" type="button" disabled={libraryState !== 'idle'} onClick={() => void addToLibrary()}>{libraryState === 'saving' ? 'Adicionando...' : libraryState === 'saved' ? '✓ Na sua lista' : '+ Adicionar à minha lista'}</button>
          <button className="neko-secondary-button neko-library-button" type="button" disabled={!providerMode || dataState === 'loading' || dataState === 'loaded'} onClick={() => void loadAnimeData()}>{dataState === 'loading' ? 'Carregando...' : dataState === 'loaded' ? '✓ Dados salvos' : 'Carregar dados'}</button>
        </div>
        {dataMessage ? <p className={dataState === 'error' ? 'neko-error neko-data-message' : 'neko-data-message'}>{dataMessage}</p> : null}
        {currentItem.synopsis ? <p className="neko-synopsis">{currentItem.synopsis}</p> : null}
        <Section title="Temporadas"><div className="neko-season-tabs">{currentItem.seasons.map((season) => <button type="button" key={season.id} className={season.id === selectedSeasonId ? 'is-active' : ''} onClick={() => { setSeasonId(season.id); setVisible(60); }}>{season.title ?? `Temporada ${season.number}`}</button>)}</div></Section>
        <Section title="Episódios" action={<select className="neko-episode-order" value={episodeOrder} onChange={(event) => setEpisodeOrder(event.target.value as EpisodeOrder)} aria-label="Ordem dos episódios"><option value="asc">Mais antigos</option><option value="desc">Mais recentes</option></select>}>
          {!providerMode && legacyEpisodeQuery.isPending ? <div className="neko-skeleton short" /> : null}
          {continueWatching && providerMode ? <ContinueWatchingCard item={continueWatching} onClick={resumeWatching} /> : null}
          {episodes.length ? <><div className="neko-episode-grid">{orderedEpisodes.map((episode) => { const seasonNumber = 'seasonNumber' in episode ? episode.seasonNumber : selectedSeason?.number ?? 1; const watched = viewedEpisodes.has(viewedEpisodeKey(currentItem.id, seasonNumber, episodeNumber(episode))); return <button key={episode.id} className={`neko-episode-box${watched ? ' is-watched' : ''}`} type="button" onClick={() => openEpisode(episode)} aria-label={`Episódio ${episodeNumber(episode)}${watched ? ', já aberto' : ''}`}><span>{String(episodeNumber(episode)).padStart(2, '0')}</span></button>; })}</div>{episodes.length < totalEpisodes ? <button className="neko-more" type="button" onClick={() => setVisible((value) => value + 60)}>Mostrar mais</button> : null}</> : !legacyEpisodeQuery.isPending ? <p className="neko-account-notice">Nenhum episódio foi encontrado neste servidor.</p> : null}
          {selectedEpisode && providerResolution.isPending ? <p className="neko-account-notice">Abrindo episódio {selectedEpisode.number}…</p> : null}
          {selectedEpisode && providerResolution.isError ? <p className="neko-error">Não foi possível abrir o vídeo deste provider. Toque no episódio para tentar novamente.</p> : null}
          {playbackError ? <p className="neko-error">{playbackError}</p> : null}
        </Section>
      </div>
    </AppScreen>
  );
}

function normalizeProviderAnime(detail: Awaited<ReturnType<typeof fetchServerAnime>>, slug: string, remoteMetadata?: RemoteAnimeMetadata | null): AnimeDetail {
  const identity = detail.identity;
  const metadata = { ...identity, ...remoteMetadata };
  const id = identity?.canonicalId ?? (metadata.malId ? `mal:${metadata.malId}` : metadata.anilistId ? `anilist:${metadata.anilistId}` : `provider:${detail.server.id}:${detail.anime.reference}`);
  return { id, slug, title: metadata.canonicalTitle ?? detail.anime.title, titleEnglish: metadata.titleEnglish ?? null, titleRomaji: metadata.titleRomaji ?? null, titleNative: metadata.titleNative ?? null, synopsis: metadata.synopsis ?? null, type: metadata.postType ?? detail.postType, status: 'disponível', year: metadata.year ?? detail.anime.year ?? null, genres: metadata.genres ?? [], scoreBasisPoints: metadata.scoreBasisPoints ?? null, imageUrl: metadata.imageUrl ?? null, externalIds: [{ provider: detail.server.id, externalId: detail.anime.reference }, ...(metadata.malId ? [{ provider: 'myanimelist', externalId: String(metadata.malId) }] : []), ...(metadata.anilistId ? [{ provider: 'anilist', externalId: String(metadata.anilistId) }] : [])], seasons: detail.seasons.map((season) => ({ id: season.id, animeId: id, number: season.number, title: season.title, episodesCount: season.episodes.length })) };
}

function episodeNumber(episode: Episode | ServerEpisode): number { return episode.number; }
function contentTypeLabel(type: string): string { return type === 'filme' ? 'FILME' : type === 'manga' ? 'MANGÁ' : 'ANIME'; }
function viewedStorageKey(animeId: string) { return `nekoanimes.viewed-episodes.v1:${animeId}`; }
function viewedEpisodeKey(animeId: string, season: number, episode: number) { return `${animeId}:s${season}:e${episode}`; }
function readViewedEpisodes(animeId: string): Set<string> { try { const raw = localStorage.getItem(viewedStorageKey(animeId)); const values = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(values) ? values.map(String) : []); } catch { return new Set(); } }
function persistViewedEpisodes(animeId: string, values: Set<string>) { try { localStorage.setItem(viewedStorageKey(animeId), JSON.stringify([...values])); } catch { /* storage can be unavailable in private WebViews */ } }

function ContinueWatchingCard({ item, onClick }: { item: LocalContinueWatching; onClick: () => void }) {
  const progress = item.durationSeconds > 0 ? Math.min(100, Math.round(item.positionSeconds / item.durationSeconds * 100)) : 0;
  return <button className="neko-continue-card" type="button" onClick={onClick} aria-label={`Continuar episódio ${item.episodeNumber}, ${progress}% assistido`}>
    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="neko-continue-placeholder" aria-hidden="true">▶</span>}
    <span className="neko-continue-copy"><small>Continuar assistindo</small><strong>{item.title}</strong><span>T{item.seasonNumber} · Episódio {String(item.episodeNumber).padStart(2, '0')}{item.episodeTitle ? ` · ${item.episodeTitle}` : ''}</span><span className="neko-progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span><small>{progress}% assistido</small></span>
    <span className="neko-continue-play" aria-hidden="true">▶</span>
  </button>;
}
