import { FormEvent, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { AppScreen, Eyebrow, ScreenHeader } from '../components/AppScreen';
import { submitReport } from '../lib/api';

export function ReportPage() {
  const location = useLocation();
  const [category, setCategory] = useState<'bug' | 'playback' | 'account' | 'content' | 'other'>('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setSent(false);
    try {
      await submitReport({ category, message, email: email || undefined, route: location.pathname, appVersion: import.meta.env.VITE_APP_VERSION });
      setMessage(''); setSent(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o report.'); }
    finally { setBusy(false); }
  }

  return <AppScreen><Eyebrow>NekoAnimes</Eyebrow><ScreenHeader title="Relatar um problema" subtitle="Ajude a melhorar o aplicativo descrevendo o que aconteceu." /><form className="neko-account-form" onSubmit={submit}><label>Tipo<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}><option value="bug">Erro geral</option><option value="playback">Player</option><option value="account">Conta</option><option value="content">Conteúdo</option><option value="other">Outro</option></select></label><label>O que aconteceu?<textarea required minLength={10} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Descreva os passos e a mensagem exibida." /></label><label>E-mail para retorno (opcional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar report'}</button>{sent ? <p>Report enviado. Obrigado por ajudar.</p> : null}{error ? <p className="neko-error">{error}</p> : null}</form></AppScreen>;
}
