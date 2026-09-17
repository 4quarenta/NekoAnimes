import { useNavigate } from '@tanstack/react-router';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader } from '../components/AppScreen';
import { WatchingList } from '../components/WatchingList';
import { useContinueWatching } from '../lib/use-continue-watching';

export function ContinueWatchingPage() {
  const navigate=useNavigate();
  const {items,pending}=useContinueWatching();
  return <AppScreen>
    <Eyebrow>NekoAnimes</Eyebrow>
    <ScreenHeader title="Continuar assistindo" subtitle="Seus episódios em andamento, salvos neste dispositivo." />
    <p className="neko-account-notice">O progresso fica disponível mesmo sem cadastro e não é enviado para uma conta.</p>
    {items.length?<WatchingList items={items}/>:<EmptyState title="Nada em andamento" description="Assista a um episódio para continuar daqui depois."/>}
    {pending?<p className="neko-account-notice">O progresso mais recente foi salvo localmente.</p>:null}
    <button className="neko-link" onClick={()=>void navigate({to:'/lista'})}>Abrir minha lista de favoritos ›</button>
  </AppScreen>;
}
