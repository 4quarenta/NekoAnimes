import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { hasSupabaseAuth, supabase } from '../lib/supabase';

export function AccountPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    setMessage(error ? 'Não foi possível entrar. Confira e-mail e senha.' : 'Sessão iniciada.');
  }

  if (!hasSupabaseAuth) {
    return <AppScreen><Eyebrow>NekoAnimes</Eyebrow><ScreenHeader title="Conta" subtitle="A autenticação está preparada, mas o projeto Supabase do NekoAnimes ainda não foi configurado." /><div className="neko-account-notice">Conta indisponível neste ambiente de desenvolvimento.</div></AppScreen>;
  }

  if (!session) {
    return (
      <AppScreen>
        <Eyebrow>NekoAnimes</Eyebrow>
        <ScreenHeader title="Entrar" subtitle="Sincronize sua lista, progresso e notícias salvas entre dispositivos." />
        <form className="neko-account-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Senha<input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button type="submit" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
          {message ? <p>{message}</p> : null}
        </form>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Sua conta" subtitle={session.user.email ?? 'Conta conectada'} />
      <Section title="Sincronização"><div className="neko-list"><TextRow title="Minha lista" meta="Sincronizada com sua conta" trailing="✓" /><TextRow title="Progresso" meta="Continue em outro dispositivo" trailing="✓" /><TextRow title="Notícias salvas" meta="Disponíveis após login" trailing="✓" /></div></Section>
      <Section title="Privacidade"><p className="neko-account-copy">Preferências de anúncios e consentimento serão acessíveis aqui quando a monetização estiver ativa.</p></Section>
      <button className="neko-danger-button" type="button" onClick={() => void supabase.auth.signOut()}>Sair da conta</button>
    </AppScreen>
  );
}
