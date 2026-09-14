import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth, type AuthSession } from './auth';
import { fetchContinueWatching, type ContinueWatchingItem } from './api';
import { readLocalProgressItems, type LocalContinueWatching } from './local-progress';

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
  const latest = new Map<string,WatchingItem>();
  for (const item of [...(query.data ?? []),...local].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))) latest.set(item.animeId,item);
  const items = [...latest.values()].filter(item=>!item.completed&&item.positionSeconds>0).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  return {session,query,items,pending:local.some(item=>item.pendingSync)};
}
