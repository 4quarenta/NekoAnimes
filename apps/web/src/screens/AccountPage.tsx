import { FormEvent, useEffect, useState } from 'react';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { auth, hasAuth, type AuthSession } from '../lib/auth';

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
      <Section title="Sincronização"><div className="neko-list"><TextRow title="Minha lista" meta="Sincronizada com sua conta" trailing="✓" /><TextRow title="Progresso" meta="Continue em outro dispositivo" trailing="✓" /><TextRow title="Notícias salvas" meta="Disponíveis após login" trailing="✓" /></div></Section>
      <Section title="Privacidade"><p className="neko-account-copy">Preferências de anúncios e consentimento serão acessíveis aqui quando a monetização estiver ativa.</p></Section>
      <button className="neko-danger-button" type="button" onClick={() => void auth.signOut()}>Sair da conta</button>
    </AppScreen>
  );
}
