import { FormEvent, useEffect, useState } from 'react';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { auth, hasAuth, type AuthSession } from '../lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchMe, fetchLibrary, fetchContinueWatching, fetchSavedNews, fetchServers } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { readLocalProgressItems } from '../lib/local-progress';
import { syncPendingProgress } from '../lib/progress-sync';

export function AccountPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    void auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    const { error } = registering
      ? await auth.signUp({ email: email.trim(), password })
      : await auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    setMessage(error ? (registering ? 'Não foi possível criar a conta.' : 'Não foi possível entrar. Confira e-mail e senha.') : (registering ? 'Conta criada.' : 'Sessão iniciada.'));
  }

  if (!hasAuth) {
    return <AppScreen><Eyebrow>NekoAnimes</Eyebrow><ScreenHeader title="Conta" subtitle="A API de autenticação do ambiente ainda não foi configurada." /><div className="neko-account-notice">Conta indisponível neste ambiente de desenvolvimento.</div></AppScreen>;
  }

  if (!session) {
    return (
      <AppScreen>
        <Eyebrow>NekoAnimes</Eyebrow>
        <ScreenHeader title={registering ? 'Criar conta' : 'Entrar'} subtitle="Sincronize sua lista, progresso e notícias salvas entre dispositivos." />
        <form className="neko-account-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Senha<input type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? 'Aguarde...' : registering ? 'Criar conta' : 'Entrar'}</button>
          {message ? <p>{message}</p> : null}
          <button className="neko-link-button" type="button" onClick={() => { setRegistering((value) => !value); setMessage(''); }}>{registering ? 'Já tenho uma conta' : 'Criar uma conta de teste'}</button>
        </form>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Sua conta" subtitle={session.user.email ?? 'Conta conectada'} />
      <AccountOverview key={session.user.id} userId={session.user.id} />
      <button className="neko-danger-button" type="button" onClick={() => void auth.signOut()}>Sair da conta</button>
    </AppScreen>
  );
}

function AccountOverview({userId}:{userId:string}) {
  const navigate=useNavigate();
  const serverId=useServerPreference(state=>state.serverId);
  const profile=useQuery({queryKey:['me-profile',userId],queryFn:async()=>{
    const [me,library,watching,news]=await Promise.all([fetchMe(),fetchLibrary(),fetchContinueWatching(),fetchSavedNews()]);
    return {me,library,watching,news};
  }});
  const servers=useQuery({queryKey:['servers'],queryFn:fetchServers});
  const [pending,setPending]=useState(()=>readLocalProgressItems().filter(item=>item.pendingSync).length);
  const [syncing,setSyncing]=useState(false);
  useEffect(()=>{
    const update=()=>setPending(readLocalProgressItems().filter(item=>item.pendingSync).length);
    window.addEventListener('neko-progress-synced',update);window.addEventListener('neko-progress-updated',update);
    return()=>{window.removeEventListener('neko-progress-synced',update);window.removeEventListener('neko-progress-updated',update);};
  },[]);
  return <>
    <Section title="Sua atividade">
      {profile.isPending?<div className="neko-skeleton short"/>:null}
      {profile.isError?<p className="neko-error">Não foi possível consultar sua conta. Seus dados não foram apagados.</p>:null}
      <div className="neko-list">
        <TextRow title="Minha lista" meta={profile.data?`${profile.data.library.length} obras salvas`:'Abrir favoritos'} trailing="›" onClick={()=>void navigate({to:'/lista'})}/>
        <TextRow title="Continuar assistindo" meta={profile.data?`${profile.data.watching.length} obras em andamento`:'Consultar progresso'} trailing="›" onClick={()=>void navigate({to:'/lista'})}/>
        <TextRow title="Notícias salvas" meta={profile.data?`${profile.data.news.length} notícias`:'Abrir notícias salvas'} trailing="›" onClick={()=>void navigate({to:'/salvos'})}/>
        <TextRow title="Servidor padrão" meta={servers.data?.servers.find(server=>server.id===serverId)?.name??'Não selecionado'} trailing="›" onClick={()=>void navigate({to:'/servidores'})}/>
      </div>
    </Section>
    <Section title="Sincronização">
      <p className={pending?'neko-error':'neko-account-copy'}>{pending?`${pending} progresso(s) aguardando envio neste dispositivo.`:profile.data?'Conta consultada com sucesso. Nenhum envio local pendente.':'Aguardando confirmação da API.'}</p>
      {profile.dataUpdatedAt?<p className="neko-account-copy">Última consulta: {new Date(profile.dataUpdatedAt).toLocaleTimeString('pt-BR')}</p>:null}
      <button className="neko-secondary-button" disabled={syncing||profile.isFetching} onClick={()=>{setSyncing(true);void syncPendingProgress().then(()=>profile.refetch()).finally(()=>setSyncing(false));}}>{syncing?'Sincronizando…':'Sincronizar e atualizar'}</button>
    </Section>
  </>;
}
