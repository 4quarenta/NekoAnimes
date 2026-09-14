import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { fetchAnime, fetchLibrary, fetchContinueWatching, removeLibraryItem, fetchSavedServerAnime, saveProviderLibrary, fetchAniListMetadata, fetchEpisodes, fetchServerAnime, fetchServerProviderResolution, saveProviderAnimeData, setLibraryItem, type AnimeDetail, type Episode, type RemoteAnimeMetadata, type ServerEpisode } from '../lib/api';
import { readLocalContinueWatching, rememberActivePlayback, type LocalContinueWatching } from '../lib/local-progress';
import { useServerPreference } from '../lib/server-preference';
import { AppScreen, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';

import { auth, currentUserId, type AuthSession } from '../lib/auth';
import { PlaybackFeedback } from '../components/PlaybackFeedback';

type EpisodeOrder = 'asc' | 'desc';

export function AnimeDetailPage() {
  const { slug } = useParams({ from: '/anime/$slug' });
  const search = useSearch({ from: '/anime/$slug' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  useEffect(() => {
    void auth.getSession().then(({data}) => setSession(data.session));
    const {data} = auth.onAuthStateChange((_event,value) => setSession(value));
    return () => data.subscription.unsubscribe();
  }, []);
  const library = useQuery({queryKey:['me-library',session?.user.id],queryFn:fetchLibrary,enabled:Boolean(session)});
  const savedProgress = useQuery({queryKey:['me-continue',session?.user.id],queryFn:fetchContinueWatching,enabled:Boolean(session)});
  const defaultServerId = useServerPreference((state) => state.serverId);
  const providerId = search.provider ?? defaultServerId;
  const providerReference = search.ref;
  const legacyAnime = useQuery({ queryKey: ['anime', slug], queryFn: () => fetchAnime(slug), enabled: !providerId });
  const providerAnime = useQuery({ queryKey: ['provider-anime', providerId, providerReference, slug], queryFn: () => providerReference ? fetchServerAnime(providerId!, providerReference) : fetchSavedServerAnime(providerId!, slug), enabled: Boolean(providerId), staleTime: 2 * 60 * 1000 });
  const providerMode = Boolean(providerAnime.data);
  const providerIdentity = providerAnime.data?.identity;
  const remoteMetadata = useQuery({ queryKey: ['anilist-metadata', providerAnime.data?.anime.title], queryFn: () => fetchAniListMetadata(providerAnime.data!.anime.title), enabled: Boolean(providerMode && providerAnime.data?.anime.title && (!providerIdentity?.imageUrl || !providerIdentity.synopsis)), staleTime: 24 * 60 * 60 * 1000, retry: 1 });
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [visible, setVisible] = useState(60);
  const [episodeOrder, setEpisodeOrder] = useState<EpisodeOrder>('asc');
  const [libraryState, setLibraryState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [dataState, setDataState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [loadedMetadata, setLoadedMetadata] = useState<RemoteAnimeMetadata | null>(null);
  const [playAttempt, setPlayAttempt] = useState(0);
  const [startPosition, setStartPosition] = useState(0);
  const [savedWorkSlug, setSavedWorkSlug] = useState<string | undefined>();
  const [savedAnimeId, setSavedAnimeId] = useState<string | undefined>();
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<ServerEpisode | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [viewedEpisodes, setViewedEpisodes] = useState<Set<string>>(new Set());
  const [continueWatching, setContinueWatching] = useState<LocalContinueWatching | null>(null);
  useEffect(() => NekoNative.subscribe(event => {
    if (event.type === 'bridge.response' && !event.ok && ['INVALID_SOURCE','INVALID_EPISODE'].includes(event.error?.code ?? '')) {
      setPlaybackError(event.error?.message ?? 'O Android não aceitou a fonte do episódio.');
      setSelectedEpisode(null);
    }
  }), []);
  const item = useMemo(() => providerAnime.data ? normalizeProviderAnime(providerAnime.data, slug, remoteMetadata.data, loadedMetadata) : legacyAnime.data, [legacyAnime.data, loadedMetadata, providerAnime.data, remoteMetadata.data, slug]);
  const selectedSeasonId = seasonId ?? item?.seasons[0]?.id ?? null;
  const selectedSeason = item?.seasons.find((season) => season.id === selectedSeasonId);
  const selectedProviderSeason = providerAnime.data?.seasons.find((season) => season.id === selectedSeasonId);
  const legacyEpisodeQuery = useQuery({ queryKey: ['episodes', selectedSeasonId, visible], queryFn: () => fetchEpisodes(selectedSeasonId!, 0, visible), enabled: Boolean(selectedSeasonId && !providerMode) });
  const providerResolution = useQuery({ queryKey: ['provider-resolution', providerId, providerAnime.data?.anime.reference, selectedEpisode?.reference, playAttempt], queryFn: () => fetchServerProviderResolution(providerId!, providerAnime.data!.anime.title, selectedEpisode!.seasonNumber, selectedEpisode!.number, providerAnime.data!.anime.reference, selectedEpisode!.reference), enabled: Boolean(providerMode && providerId && selectedEpisode), staleTime: 0, gcTime: 0, retry: false });

  useEffect(() => {
    setSeasonId(null);
    setVisible(60);
    setSelectedEpisode(null);
    setPlaybackError(null);
    setSavedWorkSlug(undefined);
    setSavedAnimeId(undefined);
    setLibraryState('idle');
    setLibraryError(null);
    setLoadedMetadata(null);
    setDataState('idle');
    setDataMessage(null);
  }, [providerId, providerReference, slug]);

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
      animeId: savedAnimeId ?? item.id,
      workSlug: savedWorkSlug ?? providerAnime.data?.workSlug,
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
    const opened = NekoNative.player.open(resolution.episode.id, { ...source, url: source.playbackUrl ?? source.url }, startPosition);
    if (opened) {
      markEpisodeViewed(resolution.episode);
      setSelectedEpisode(null);
      setPlaybackError(null);
    } else setPlaybackError('A reprodução desta fonte está disponível no aplicativo Android.');
  }, [providerResolution.data, selectedEpisode]);

  useEffect(() => {
    if (!item) return;
    const sync = () => {
      const local = readLocalContinueWatching(item.id);
      const saved = savedProgress.data?.find(value => value.animeId === item.id);
      setContinueWatching(local && (!saved || new Date(local.updatedAt) >= new Date(saved.updatedAt)) ? local : saved ? {...saved,imageUrl:saved.imageUrl ?? null} : null);
    };
    sync();
    window.addEventListener('neko-progress-updated', sync);
    return () => window.removeEventListener('neko-progress-updated', sync);
  }, [item?.id, savedProgress.data]);

  const loading = providerId ? providerAnime.isPending : legacyAnime.isPending;
  const error = providerId ? providerAnime.isError : legacyAnime.isError;
  if (loading) return <AppScreen><div className="neko-skeleton" /></AppScreen>;
  if (error || !item) return <AppScreen><p className="neko-error">{providerAnime.error?.message ?? 'Não foi possível carregar este anime no servidor selecionado.'}</p><button className="neko-secondary-button" onClick={() => void providerAnime.refetch()}>Tentar novamente</button><button className="neko-link" onClick={() => void navigate({to:'/buscar',search:{q:undefined}})}>Pesquisar neste servidor</button><button className="neko-link" onClick={() => void navigate({to:'/servidores'})}>Trocar servidor</button></AppScreen>;
  const currentItem = item;
  const savedLibraryItem = library.data?.find(value => value.animeId === (savedAnimeId ?? currentItem.id));
  const inLibrary = Boolean(savedLibraryItem) || libraryState === 'saved';
  const episodes = providerMode ? (selectedProviderSeason?.episodes ?? []) : (legacyEpisodeQuery.data?.items ?? []);
  const orderedEpisodes = [...episodes].sort((left, right) => (episodeNumber(left) - episodeNumber(right)) * (episodeOrder === 'asc' ? 1 : -1)).slice(0,visible);
  const totalEpisodes = providerMode ? (selectedProviderSeason?.episodes.length ?? 0) : (legacyEpisodeQuery.data?.total ?? 0);
  const backdropUrl = loadedMetadata?.backdropUrl ?? remoteMetadata.data?.backdropUrl ?? providerAnime.data?.identity?.backdropUrl;

  function openEpisode(episode: Episode | ServerEpisode, positionSeconds = 0) {
    setStartPosition(positionSeconds);
    setPlaybackError(null);
    if ('reference' in episode) { setPlayAttempt(value => value + 1); setSelectedEpisode(episode); return; }
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
    openEpisode(targetEpisode,continueWatching.positionSeconds);
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
    setLibraryError(null);
    try {
      if (inLibrary) {
        await removeLibraryItem(savedLibraryItem?.animeId ?? savedAnimeId ?? currentItem.id);
        setLibraryState('idle');
      } else if (providerAnime.data && providerId) {
        const saved = await saveProviderLibrary(providerId,providerAnime.data.anime.reference,providerAnime.data.workSlug);
        setSavedWorkSlug(saved.slug);
        setSavedAnimeId(saved.animeId);
        void queryClient.invalidateQueries({queryKey:['provider-anime']});
        setLibraryState('saved');
      } else { await setLibraryItem(currentItem.id,'watchlist'); setLibraryState('saved'); }
      await queryClient.invalidateQueries({queryKey:['me-library']});
    } catch (saveError) {
      setLibraryState('idle');
      if (saveError instanceof Error && saveError.message === 'AUTH_REQUIRED') void navigate({to:'/conta'});
      else setLibraryError(saveError instanceof Error ? saveError.message : 'Não foi possível alterar sua lista.');
    }
  }

  async function loadAnimeData() {
    if (!providerMode || !providerAnime.data || !providerId) return;
    setDataState('loading');
    setDataMessage(null);
    try {
      const clientMetadata = await fetchAniListMetadata(providerAnime.data.anime.title).catch(() => null) ?? remoteMetadata.data ?? null;
      const result = await saveProviderAnimeData(providerId, providerAnime.data.anime.reference, clientMetadata);
      setLoadedMetadata(result.identity);
      setSavedWorkSlug(result.anime.slug);
      setSavedAnimeId(result.anime.id);
      void queryClient.invalidateQueries({queryKey:['provider-anime']});
      void queryClient.invalidateQueries({queryKey:['me-library']});
      void queryClient.invalidateQueries({predicate:query=>String(query.queryKey[0]).startsWith('provider-catalog')});
      setDataState('loaded');
      setDataMessage('Metadados disponíveis aplicados e salvos. Campos ausentes continuam pendentes nas fontes.');
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === 'AUTH_REQUIRED') {
        void navigate({ to: '/conta' });
        return;
      }
      setDataState('error');
      setDataMessage(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os dados agora.');
    }
  }

  return (
    <AppScreen>
      {backdropUrl ? <div className="neko-anime-hero" style={{ backgroundImage: `linear-gradient(180deg, rgba(13, 10, 28, .18), var(--neko-bg) 92%), url(${backdropUrl})` }} aria-hidden="true" /> : null}
      {(selectedEpisode || playbackError) ? <PlaybackFeedback
        title={selectedEpisode ? `Episódio ${selectedEpisode.number}` : 'Reprodução'}
        error={playbackError ?? (providerResolution.isError ? providerResolution.error.message : null)}
        onClose={() => {setSelectedEpisode(null);setPlaybackError(null);}}
        onRetry={selectedEpisode ? () => {setPlaybackError(null);setPlayAttempt(value => value + 1);} : undefined}
      /> : null}
      <div className="neko-anime-detail-content">
        <Eyebrow>{contentTypeLabel(currentItem.type)} · {currentItem.year ?? providerAnime.data?.identity?.year ?? '—'}{providerMode ? ` · ${providerAnime.data!.server.name}` : ''}</Eyebrow>
        <ScreenHeader title={currentItem.title} subtitle={currentItem.titleEnglish ?? currentItem.titleRomaji ?? undefined} />
        {currentItem.imageUrl ? <img className="neko-anime-poster" src={currentItem.imageUrl} alt={`Capa de ${currentItem.title}`} /> : null}
        {providerAnime.data?.identity ? <div className="neko-external-meta"><span>MAL {providerAnime.data.identity.malId ?? '—'}</span><span>AniList {providerAnime.data.identity.anilistId ?? '—'}</span></div> : null}
        <div className="neko-chips"><span>{currentItem.status}</span>{currentItem.genres.slice(0, 4).map((genre) => <span key={genre}>{genre}</span>)}{currentItem.scoreBasisPoints ? <span>★ {(currentItem.scoreBasisPoints / 100).toFixed(2)}</span> : null}</div>
        <div className="neko-anime-actions">
          <button className="neko-primary-button neko-library-button" type="button" disabled={libraryState === 'saving'} onClick={() => void addToLibrary()}>{libraryState === 'saving' ? 'Adicionando...' : inLibrary ? '✓ Remover da minha lista' : '+ Adicionar à minha lista'}</button>
          <button className="neko-secondary-button neko-library-button" type="button" disabled={!providerMode || dataState === 'loading'} onClick={() => void loadAnimeData()}>{dataState === 'loading' ? 'Carregando...' : dataState === 'loaded' ? '✓ Dados salvos' : 'Carregar dados'}</button>
        </div>
        {libraryError ? <p className="neko-error">{libraryError}</p> : null}
        {dataMessage ? <p className={dataState === 'error' ? 'neko-error neko-data-message' : 'neko-data-message'}>{dataMessage}</p> : null}
        {currentItem.synopsis ? <p className="neko-synopsis">{currentItem.synopsis}</p> : null}
        <Section title="Temporadas"><div className="neko-season-tabs">{currentItem.seasons.map((season) => <button type="button" key={season.id} className={season.id === selectedSeasonId ? 'is-active' : ''} onClick={() => { setSeasonId(season.id); setVisible(60); }}>{season.title ?? `Temporada ${season.number}`}</button>)}</div></Section>
        <Section title="Episódios" action={<select className="neko-episode-order" value={episodeOrder} onChange={(event) => setEpisodeOrder(event.target.value as EpisodeOrder)} aria-label="Ordem dos episódios"><option value="asc">Mais antigos</option><option value="desc">Mais recentes</option></select>}>
          {!providerMode && legacyEpisodeQuery.isPending ? <div className="neko-skeleton short" /> : null}
          {continueWatching && providerMode ? <ContinueWatchingCard item={continueWatching} onClick={resumeWatching} /> : null}
          {episodes.length ? <><div className="neko-episode-grid">{orderedEpisodes.map((episode) => { const seasonNumber = 'seasonNumber' in episode ? episode.seasonNumber : selectedSeason?.number ?? 1; const watched = viewedEpisodes.has(viewedEpisodeKey(currentItem.id, seasonNumber, episodeNumber(episode))); return <button key={episode.id} className={`neko-episode-box${watched ? ' is-watched' : ''}`} type="button" onClick={() => openEpisode(episode)} aria-label={`Episódio ${episodeNumber(episode)}${watched ? ', já aberto' : ''}`}><span>{String(episodeNumber(episode)).padStart(2, '0')}</span></button>; })}</div>{orderedEpisodes.length < totalEpisodes ? <button className="neko-more" type="button" onClick={() => setVisible((value) => value + 60)}>Mostrar mais</button> : null}</> : providerMode || !legacyEpisodeQuery.isPending ? <p className="neko-account-notice">Nenhum episódio foi encontrado neste servidor.</p> : null}



        </Section>
      </div>
    </AppScreen>
  );
}

function normalizeProviderAnime(detail: Awaited<ReturnType<typeof fetchServerAnime>>, slug: string, remoteMetadata?: RemoteAnimeMetadata | null, loadedMetadata?: RemoteAnimeMetadata | null): AnimeDetail {
  const identity = detail.identity;
  const metadata = { ...identity };
  for (const source of [remoteMetadata, loadedMetadata]) for (const [key,value] of Object.entries(source ?? {})) {
    if (value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length)) Object.assign(metadata,{[key]:value});
  }
  const id = identity?.canonicalId ?? (metadata.malId ? `mal:${metadata.malId}` : metadata.anilistId ? `anilist:${metadata.anilistId}` : `provider:${detail.server.id}:${detail.anime.reference}`);
  return { id, slug: detail.workSlug ?? slug, title: metadata.canonicalTitle ?? detail.anime.title, titleEnglish: metadata.titleEnglish ?? null, titleRomaji: metadata.titleRomaji ?? null, titleNative: metadata.titleNative ?? null, synopsis: metadata.synopsis ?? null, type: metadata.postType ?? detail.postType, status: 'disponível', year: metadata.year ?? detail.anime.year ?? null, genres: metadata.genres ?? [], scoreBasisPoints: metadata.scoreBasisPoints ?? null, imageUrl: metadata.imageUrl ?? null, externalIds: [{ provider: detail.server.id, externalId: detail.anime.reference }, ...(metadata.malId ? [{ provider: 'myanimelist', externalId: String(metadata.malId) }] : []), ...(metadata.anilistId ? [{ provider: 'anilist', externalId: String(metadata.anilistId) }] : [])], seasons: detail.seasons.map((season) => ({ id: season.id, animeId: id, number: season.number, title: season.title, episodesCount: season.episodes.length })) };
}

function episodeNumber(episode: Episode | ServerEpisode): number { return episode.number; }
function contentTypeLabel(type: string): string { return type === 'filme' || type === 'movie' ? 'FILME' : type === 'manga' ? 'MANGÁ' : 'ANIME'; }
function viewedStorageKey(animeId: string) { return `nekoanimes.viewed-episodes.v2:${currentUserId()}:${animeId}`; }
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
