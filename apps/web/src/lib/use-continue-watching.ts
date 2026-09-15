import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth, type AuthSession } from './auth';
import { fetchContinueWatching, type ContinueWatchingItem } from './api';
import { readLocalProgressItems, type LocalContinueWatching } from './local-progress';
import { releaseLabelForTitle } from '@neko/contracts';

export type WatchingItem = ContinueWatchingItem & Partial<LocalContinueWatching>;
export function useContinueWatching() {
  const [session,setSession] = useState<AuthSession|null>(null);
  const [local,setLocal] = useState<LocalContinueWatching[]>([]);
  useEffect(() => {
    void auth.getSession().then(({data}) => setSession(data.session));
    const {data} = auth.onAuthStateChange((_event,next) => setSession(next));
    return () => data.subscription.unsubscribe();
  },[]);
  useEffect(() => {
    const refresh = () => setLocal(readLocalProgressItems());
    refresh();
    window.addEventListener('neko-progress-updated',refresh);
    window.addEventListener('neko-progress-synced',refresh);
    return () => {window.removeEventListener('neko-progress-updated',refresh);window.removeEventListener('neko-progress-synced',refresh);};
  },[session?.user.id]);
  const query = useQuery({queryKey:['me-continue',session?.user.id],queryFn:fetchContinueWatching,enabled:Boolean(session)});
  const remoteByAnime = new Map((query.data ?? []).map(item => [item.animeId, item]));
  const localByAnime = new Map(local.map(item => [item.animeId, item]));
  const animeIds = new Set([...remoteByAnime.keys(), ...localByAnime.keys()]);
  const items = [...animeIds].map(animeId => mergeWatchingItem(remoteByAnime.get(animeId), localByAnime.get(animeId)))
    .filter(item=>!item.completed&&item.positionSeconds>0)
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return {session,query,items,pending:local.some(item=>item.pendingSync)};
}

function mergeWatchingItem(remote: ContinueWatchingItem | undefined, local: LocalContinueWatching | undefined): WatchingItem {
  if (!remote && !local) throw new Error('Progresso inválido');
  const latest = remote && local && local.updatedAt > remote.updatedAt ? local : remote ?? local!;
  const releaseLabel = remote?.releaseLabel ?? local?.releaseLabel ?? releaseLabelForTitle(local?.title) ?? releaseLabelForTitle(remote?.title);
  if (!remote) return { ...latest, releaseLabel };
  // Local progress wins for position/timestamp, while the server is the
  // authority for canonical metadata after "Carregar dados" is applied.
  return {
    ...latest,
    animeId: remote.animeId,
    slug: remote.slug,
    title: remote.title,
    imageUrl: remote.imageUrl ?? local?.imageUrl ?? null,
    type: remote.type ?? local?.type,
    genres: remote.genres?.length ? remote.genres : local?.genres,
    scoreBasisPoints: remote.scoreBasisPoints ?? local?.scoreBasisPoints,
    workSlug: local?.workSlug ?? remote.slug,
    releaseLabel
  };
}
