'use client';

import { useCallback, useEffect, useState } from 'react';

type AdCredentials = {
  maxSdkKey: string;
  maxBannerAdUnitId: string;
  maxAppOpenAdUnitId: string;
  maxInterstitialAdUnitId: string;
  admobAppId: string;
  admobBannerAdUnitId: string;
  admobAppOpenAdUnitId: string;
  admobInterstitialAdUnitId: string;
};
type AdsConfig = {
  enabled: boolean;
  engine: 'max' | 'admob' | 'levelplay';
  credentials: AdCredentials;
  banner: { enabled: boolean };
  appOpen: { enabled: boolean; minIntervalMinutes: number; skipFirstOpens: number };
  interstitial: { enabled: boolean; minIntervalMinutes: number; maxPerSession: number; pageTransitionFrequency: number; showOnEpisodeStart: boolean };
};
type ServerConfig = { id: string; enabled: boolean; recommended: boolean };
type UpdateConfig = { enabled: boolean; mode: 'direct' | 'play_store'; versionCode: number; versionName: string; apkUrl: string; sha256: string; required: boolean; storeUrl: string };
type AppConfig = { version: number; mode: 'streaming' | 'news'; ads: AdsConfig; servers: ServerConfig[]; updates: UpdateConfig; updatedAt: string };
type Report = { id: string; userId: string | null; email: string | null; category: string; message: string; route: string | null; appVersion: string | null; status: 'open' | 'in_progress' | 'resolved' | 'dismissed'; createdAt: string; updatedAt: string };
type Tab = 'app' | 'ads' | 'servers' | 'reports' | 'updates';

const panel: React.CSSProperties = { border: '1px solid #27272a', borderRadius: 16, padding: 20, background: '#16161d' };
const field: React.CSSProperties = { display: 'grid', gap: 7, color: '#d4d4d8' };
const control: React.CSSProperties = { minHeight: 42, border: '1px solid #3f3f46', borderRadius: 10, padding: '8px 10px', background: '#0d0d11', color: '#f4f4f5' };
const serverLabels: Record<string, string> = { goyabu: 'BR1', animesonlinecc: 'BR2', animesdigital: 'BR3' };
const categoryLabels: Record<string, string> = { bug: 'Erro geral', playback: 'Player', account: 'Conta', content: 'Conteúdo', other: 'Outro' };

export default function ConfigurationPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [adminKey, setAdminKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [message, setMessage] = useState('Carregando...');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('app');
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    const storedKey = window.sessionStorage.getItem('neko-admin-key');
    if (storedKey) setAdminKey(storedKey);
    else setMessage('Informe a chave administrativa para acessar este painel.');
  }, []);

  const logout = useCallback(() => {
    window.sessionStorage.removeItem('neko-admin-key');
    setAdminKey('');
    setConfig(null);
    setKeyInput('');
    setMessage('Informe a chave administrativa para acessar este painel.');
  }, []);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setMessage('Carregando...');
    const response = await fetch('/api/app-config', { cache: 'no-store', headers: authHeaders(adminKey) });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) logout();
      else setMessage(body.message ?? 'Falha ao carregar configuração');
      return;
    }
    setConfig(body);
    setMessage('');
  }, [adminKey, logout]);

  useEffect(() => { if (adminKey) void load(); }, [adminKey, load]);

  const loadReports = useCallback(async () => {
    if (!adminKey) return;
    setReportsLoading(true);
    try {
      const response = await fetch('/api/reports', { cache: 'no-store', headers: authHeaders(adminKey) });
      const body = await response.json();
      if (response.status === 401) { logout(); return; }
      if (!response.ok) throw new Error(body.message ?? 'Falha ao carregar reports');
      setReports(body);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar reports');
    } finally { setReportsLoading(false); }
  }, [adminKey, logout]);

  useEffect(() => { if (tab === 'reports') void loadReports(); }, [tab, loadReports]);

  function authenticate() {
    const normalized = keyInput.trim();
    if (!normalized) { setMessage('Informe a chave administrativa.'); return; }
    window.sessionStorage.setItem('neko-admin-key', normalized);
    setConfig(null);
    setAdminKey(normalized);
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage('Salvando...');
    try {
      const response = await fetch('/api/app-config', {
        method: 'PUT',
        headers: { ...authHeaders(adminKey), 'content-type': 'application/json' },
        body: JSON.stringify({ mode: config.mode, ads: config.ads, servers: config.servers, updates: config.updates })
      });
      const body = await response.json();
      if (response.status === 401) { logout(); return; }
      if (!response.ok) { setMessage(body.message ?? 'Falha ao salvar configuração'); return; }
      setConfig(body);
      setMessage(`Configuração v${body.version} salva.`);
    } finally { setSaving(false); }
  }

  async function updateReport(id: string, status: Report['status']) {
    const response = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { ...authHeaders(adminKey), 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (response.status === 401) { logout(); return; }
    if (!response.ok) { const body = await response.json().catch(() => ({})); setMessage(body.message ?? 'Falha ao atualizar report'); return; }
    setReports((current) => current.map((item) => item.id === id ? { ...item, status } : item));
  }

  if (!adminKey) return <Login keyInput={keyInput} setKeyInput={setKeyInput} authenticate={authenticate} message={message} />;
  if (!config) return <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}><h1>Configuração</h1><p style={{ color: '#a1a1aa' }}>{message}</p><button onClick={() => void load()} style={control}>Tentar novamente</button></main>;

  const tabs: [Tab, string][] = [['app', 'Aplicativo'], ['ads', 'Anúncios'], ['servers', 'Servidores'], ['reports', 'Reports'], ['updates', 'Atualizações']];
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 20px 80px' }}>
      <a href="/" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Admin</a>
      <button type="button" onClick={logout} style={{ ...control, float: 'right', minHeight: 34, cursor: 'pointer' }}>Sair</button>
      <p style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', marginBottom: 8 }}>NEKO ADMIN</p>
      <h1 style={{ margin: 0 }}>Painel operacional</h1>
      <p style={{ marginTop: 8, color: '#a1a1aa' }}>Configuração v{config.version} · {new Date(config.updatedAt).toLocaleString('pt-BR')}</p>
      <nav aria-label="Módulos administrativos" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '26px 0 20px' }}>
        {tabs.map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} style={{ ...control, cursor: 'pointer', background: tab === id ? '#7c3aed' : '#0d0d11', borderColor: tab === id ? '#7c3aed' : '#3f3f46', fontWeight: 700 }}>{label}</button>)}
      </nav>
      {tab === 'app' ? <AppTab config={config} setConfig={setConfig} /> : null}
      {tab === 'ads' ? <AdsTab config={config} setConfig={setConfig} /> : null}
      {tab === 'servers' ? <ServersTab config={config} setConfig={setConfig} /> : null}
      {tab === 'updates' ? <UpdatesTab config={config} setConfig={setConfig} /> : null}
      {tab === 'reports' ? <ReportsTab reports={reports} loading={reportsLoading} onRefresh={() => void loadReports()} onUpdate={updateReport} /> : null}
      {tab !== 'reports' ? <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}><button type="button" disabled={saving} onClick={() => void save()} style={{ ...control, cursor: saving ? 'wait' : 'pointer', background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 700, paddingInline: 18 }}>{saving ? 'Salvando...' : 'Publicar configuração'}</button><span style={{ color: '#a1a1aa' }}>{message}</span></div> : <p style={{ color: '#a1a1aa', marginTop: 24 }}>{message}</p>}
    </main>
  );
}

function Login({ keyInput, setKeyInput, authenticate, message }: { keyInput: string; setKeyInput: (value: string) => void; authenticate: () => void; message: string }) {
  return <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}><p style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em' }}>NEKO ADMIN</p><h1>Entrar no painel</h1><p style={{ color: '#a1a1aa' }}>A chave é usada somente nesta sessão e não faz parte do código público.</p><form onSubmit={(event) => { event.preventDefault(); authenticate(); }} style={{ display: 'grid', gap: 12, marginTop: 24 }}><label style={field}>Chave administrativa<input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} style={control} autoComplete="current-password" /></label><button type="submit" style={{ ...control, cursor: 'pointer', background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 700 }}>Acessar</button></form><p style={{ color: '#a1a1aa' }}>{message}</p></main>;
}

function AppTab({ config, setConfig }: { config: AppConfig; setConfig: (value: AppConfig) => void }) {
  return <section style={panel}><h2 style={{ marginTop: 0 }}>Experiência ativa</h2><label style={{ ...field, maxWidth: 360 }}>Modo entregue pela configuração remota<select value={config.mode} onChange={(event) => setConfig({ ...config, mode: event.target.value as AppConfig['mode'] })} style={control}><option value="streaming">Streaming</option><option value="news">Somente notícias</option></select></label><p style={{ color: '#a1a1aa', marginBottom: 0 }}>A publicação é versionada e o Android consulta o manifesto remoto ao iniciar.</p></section>;
}

function AdsTab({ config, setConfig }: { config: AppConfig; setConfig: (value: AppConfig) => void }) {
  const ads = config.ads;
  const setAds = (next: AdsConfig) => setConfig({ ...config, ads: next });
  const setCredential = (key: keyof AdCredentials, value: string) => setAds({ ...ads, credentials: { ...ads.credentials, [key]: value } });
  return <div style={{ display: 'grid', gap: 18 }}>
    <section style={panel}><h2 style={{ marginTop: 0 }}>Anúncios</h2><Toggle label="Anúncios habilitados" value={ads.enabled} onChange={(value) => setAds({ ...ads, enabled: value })} /><div style={{ display: 'grid', gap: 16, marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}><label style={field}>Motor<select value={ads.engine} onChange={(event) => setAds({ ...ads, engine: event.target.value as AdsConfig['engine'] })} style={control}><option value="max">AppLovin MAX</option><option value="admob">Google AdMob</option><option value="levelplay">Unity LevelPlay</option></select></label><Toggle label="Banner" value={ads.banner.enabled} onChange={(value) => setAds({ ...ads, banner: { enabled: value } })} /></div></section>
    <section style={panel}><h2 style={{ marginTop: 0 }}>App Open</h2><Toggle label="Ativo" value={ads.appOpen.enabled} onChange={(value) => setAds({ ...ads, appOpen: { ...ads.appOpen, enabled: value } })} /><div style={{ display: 'grid', gap: 16, marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}><NumberField label="Intervalo mínimo (min)" value={ads.appOpen.minIntervalMinutes} onChange={(value) => setAds({ ...ads, appOpen: { ...ads.appOpen, minIntervalMinutes: value } })} /><NumberField label="Primeiras aberturas sem anúncio" value={ads.appOpen.skipFirstOpens} onChange={(value) => setAds({ ...ads, appOpen: { ...ads.appOpen, skipFirstOpens: value } })} /></div></section>
    <section style={panel}><h2 style={{ marginTop: 0 }}>Interstitial</h2><Toggle label="Ativo" value={ads.interstitial.enabled} onChange={(value) => setAds({ ...ads, interstitial: { ...ads.interstitial, enabled: value } })} /><div style={{ display: 'grid', gap: 16, marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}><NumberField label="Intervalo mínimo (min)" value={ads.interstitial.minIntervalMinutes} onChange={(value) => setAds({ ...ads, interstitial: { ...ads.interstitial, minIntervalMinutes: value } })} /><NumberField label="Máximo por sessão" value={ads.interstitial.maxPerSession} onChange={(value) => setAds({ ...ads, interstitial: { ...ads.interstitial, maxPerSession: value } })} /><NumberField label="A cada quantas transições" value={ads.interstitial.pageTransitionFrequency} onChange={(value) => setAds({ ...ads, interstitial: { ...ads.interstitial, pageTransitionFrequency: value } })} /></div><Toggle label="Exibir ao iniciar episódio" value={ads.interstitial.showOnEpisodeStart} onChange={(value) => setAds({ ...ads, interstitial: { ...ads.interstitial, showOnEpisodeStart: value } })} /></section>
    <section style={panel}><h2 style={{ marginTop: 0 }}>Chaves e identificadores</h2><p style={{ color: '#a1a1aa' }}>IDs e SDK keys são aplicados no próximo build Android. Não coloque aqui senhas, tokens privados ou credenciais de servidor.</p><div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>{(Object.keys(ads.credentials) as (keyof AdCredentials)[]).map((key) => <label key={key} style={field}>{credentialLabel(key)}<input type="text" value={ads.credentials[key]} onChange={(event) => setCredential(key, event.target.value)} style={control} autoComplete="off" /></label>)}</div></section>
  </div>;
}

function ServersTab({ config, setConfig }: { config: AppConfig; setConfig: (value: AppConfig) => void }) {
  return <section style={panel}><h2 style={{ marginTop: 0 }}>Servidores</h2><p style={{ color: '#a1a1aa' }}>Servidor desativado deixa de aparecer nas buscas, categorias, catálogo e resolução de episódios.</p><div style={{ display: 'grid', gap: 12 }}>{config.servers.map((server) => <div key={server.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: 14, border: '1px solid #27272a', borderRadius: 12 }}><div><strong>{serverLabels[server.id] ?? server.id}</strong><span style={{ color: '#a1a1aa', marginLeft: 10 }}>{server.id}</span>{server.recommended ? <span style={{ color: '#c4b5fd', marginLeft: 10 }}>Recomendado</span> : null}</div><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={server.enabled} onChange={(event) => setConfig({ ...config, servers: config.servers.map((item) => item.id === server.id ? { ...item, enabled: event.target.checked } : item) })} />Online no app</label></div>)}</div></section>;
}

function UpdatesTab({ config, setConfig }: { config: AppConfig; setConfig: (value: AppConfig) => void }) {
  const update = config.updates;
  const setUpdate = (next: Partial<UpdateConfig>) => setConfig({ ...config, updates: { ...update, ...next } });
  return <section style={panel}><h2 style={{ marginTop: 0 }}>Atualizações Android</h2><Toggle label="Canal de atualização habilitado" value={update.enabled} onChange={(value) => setUpdate({ enabled: value })} /><div style={{ display: 'grid', gap: 16, marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}><label style={field}>Distribuição<select value={update.mode} onChange={(event) => setUpdate({ mode: event.target.value as UpdateConfig['mode'] })} style={control}><option value="direct">Link direto (APK/R2)</option><option value="play_store">Google Play Store</option></select></label><NumberField label="versionCode" value={update.versionCode} onChange={(value) => setUpdate({ versionCode: value })} /><label style={field}>versionName<input value={update.versionName} onChange={(event) => setUpdate({ versionName: event.target.value })} style={control} /></label></div>{update.mode === 'direct' ? <div style={{ display: 'grid', gap: 16, marginTop: 16 }}><label style={field}>URL pública do APK<input value={update.apkUrl} onChange={(event) => setUpdate({ apkUrl: event.target.value })} style={control} placeholder="https://...r2.dev/android/...apk" /></label><label style={field}>SHA-256 real do APK<input value={update.sha256} onChange={(event) => setUpdate({ sha256: event.target.value })} style={control} /></label></div> : <label style={{ ...field, marginTop: 16 }}>URL da Play Store<input value={update.storeUrl} onChange={(event) => setUpdate({ storeUrl: event.target.value })} style={control} placeholder="https://play.google.com/store/apps/details?id=com.nekoanimes.app" /></label>}<label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}><input type="checkbox" checked={update.required} onChange={(event) => setUpdate({ required: event.target.checked })} />Forçar atualização quando houver versão maior</label><p style={{ color: '#a1a1aa', marginBottom: 0 }}>Link direto usa SHA-256 e abre o instalador nativo. Play Store abre a loja; o Google decide o fluxo de atualização.</p></section>;
}

function ReportsTab({ reports, loading, onRefresh, onUpdate }: { reports: Report[]; loading: boolean; onRefresh: () => void; onUpdate: (id: string, status: Report['status']) => Promise<void> }) {
  return <section style={panel}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>Reports de usuários</h2><p style={{ color: '#a1a1aa', marginBottom: 0 }}>Erros enviados pelo aplicativo e pela versão web.</p></div><button type="button" onClick={onRefresh} style={{ ...control, cursor: 'pointer' }}>{loading ? 'Carregando...' : 'Atualizar'}</button></div>{!loading && !reports.length ? <p style={{ color: '#a1a1aa', marginTop: 24 }}>Nenhum report recebido.</p> : <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>{reports.map((report) => <article key={report.id} style={{ border: '1px solid #27272a', borderRadius: 12, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{categoryLabels[report.category] ?? report.category}</strong><select value={report.status} onChange={(event) => void onUpdate(report.id, event.target.value as Report['status'])} style={{ ...control, minHeight: 34, paddingBlock: 4 }}><option value="open">Aberto</option><option value="in_progress">Em andamento</option><option value="resolved">Resolvido</option><option value="dismissed">Descartado</option></select></div><p style={{ whiteSpace: 'pre-wrap' }}>{report.message}</p><small style={{ color: '#a1a1aa' }}>{report.email ?? 'sem e-mail'} · {report.route ?? 'rota não informada'} · {report.appVersion ?? 'versão não informada'} · {new Date(report.createdAt).toLocaleString('pt-BR')}</small></article>)}</div>}</section>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 42 }}><input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />{label}</label>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label style={field}>{label}<input type="number" min={0} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} style={control} /></label>; }
function credentialLabel(key: keyof AdCredentials) { return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()); }
function authHeaders(key: string) { return { Authorization: `Basic ${window.btoa(`admin:${key}`)}` }; }
