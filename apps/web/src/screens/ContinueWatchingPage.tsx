import { useNavigate } from '@tanstack/react-router';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader } from '../components/AppScreen';
import { WatchingList } from '../components/WatchingList';
import { useContinueWatching } from '../lib/use-continue-watching';
import { syncPendingProgress } from '../lib/progress-sync';

export function ContinueWatchingPage() {
  const navigate=useNavigate();
  const {session,query,items,pending}=useContinueWatching();
  return <AppScreen>
    <Eyebrow>NekoAnimes</Eyebrow>
    <ScreenHeader title="Continuar assistindo" subtitle="Seus episódios em andamento, separados dos favoritos." />
    {!session?<p className="neko-account-notice">O progresso fica neste dispositivo. <button className="neko-link" onClick={()=>void navigate({to:'/conta'})}>Entrar para sincronizar</button></p>:null}
    {query.isFetching&&!items.length?<div className="neko-skeleton short"/>:null}
    {query.isError?<div role="alert"><p className="neko-error">Não foi possível consultar o progresso da conta. Os registros locais continuam aqui.</p><button className="neko-secondary-button" onClick={()=>void query.refetch()}>Tentar novamente</button></div>:null}
    {items.length?<WatchingList items={items}/>:!query.isFetching?<EmptyState title="Nada em andamento" description="Assista a um episódio para continuar daqui depois."/>:null}
    {pending&&session?<p className="neko-account-notice">Há progresso aguardando envio. <button className="neko-secondary-button" onClick={()=>void syncPendingProgress()}>Sincronizar agora</button></p>:null}
    <button className="neko-link" onClick={()=>void navigate({to:'/lista'})}>Abrir minha lista de favoritos ›</button>
  </AppScreen>;
}
