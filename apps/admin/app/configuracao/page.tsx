'use client';

import { useCallback, useEffect, useState } from 'react';

type AdsConfig = {
  enabled: boolean;
  engine: 'max' | 'admob' | 'levelplay';
  banner: { enabled: boolean };
  appOpen: { enabled: boolean; minIntervalMinutes: number; skipFirstOpens: number };
  interstitial: { enabled: boolean; minIntervalMinutes: number; maxPerSession: number; pageTransitionFrequency: number; showOnEpisodeStart: boolean };
};

type AppConfig = {
  version: number;
  mode: 'streaming' | 'news';
  ads: AdsConfig;
  updatedAt: string;
};

const panel: React.CSSProperties = {
  border: '1px solid #27272a',
  borderRadius: 16,
  padding: 20,
  background: '#16161d'
};

const field: React.CSSProperties = {
  display: 'grid',
  gap: 7,
  color: '#d4d4d8'
};

const control: React.CSSProperties = {
  minHeight: 42,
  border: '1px solid #3f3f46',
  borderRadius: 10,
  padding: '8px 10px',
  background: '#0d0d11',
  color: '#f4f4f5'
};

export default function ConfigurationPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [adminKey, setAdminKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [message, setMessage] = useState('Carregando...');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const storedKey = window.sessionStorage.getItem('neko-admin-key');
    if (storedKey) setAdminKey(storedKey);
    else setMessage('Informe a chave administrativa para acessar este painel.');
  }, []);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setMessage('Carregando...');
    const authorization = `Basic ${window.btoa(`admin:${adminKey}`)}`;
    const response = await fetch('/api/app-config', { cache: 'no-store', headers: { Authorization: authorization } });
    const body = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        window.sessionStorage.removeItem('neko-admin-key');
        setAdminKey('');
        setKeyInput('');
        setConfig(null);
        setMessage('Chave administrativa inválida.');
        return;
      }
      setMessage(body.message ?? 'Falha ao carregar configuração');
      return;
    }

    setConfig(body);
    setMessage('');
  }, [adminKey]);

  useEffect(() => {
    if (adminKey) void load();
  }, [load]);

  function authenticate() {
    const normalized = keyInput.trim();
    if (!normalized) {
      setMessage('Informe a chave administrativa.');
      return;
    }
    window.sessionStorage.setItem('neko-admin-key', normalized);
    setConfig(null);
    setAdminKey(normalized);
  }

  function logout() {
    window.sessionStorage.removeItem('neko-admin-key');
    setAdminKey('');
    setConfig(null);
    setKeyInput('');
    setMessage('Informe a chave administrativa para acessar este painel.');
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage('Salvando...');

    try {
      const response = await fetch('/api/app-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', Authorization: `Basic ${window.btoa(`admin:${adminKey}`)}` },
        body: JSON.stringify({ mode: config.mode, ads: config.ads })
      });
      const body = await response.json();

      if (!response.ok) {
        setMessage(body.message ?? 'Falha ao salvar configuração');
        return;
      }

      setConfig(body);
      setMessage(`Configuração v${body.version} salva.`);
    } finally {
      setSaving(false);
    }
  }

  if (!adminKey) {
    return (
      <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px' }}>
        <p style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700, letterSpacing: '0.18em' }}>NEKO ADMIN</p>
        <h1>Entrar no painel</h1>
        <p style={{ color: '#a1a1aa' }}>A chave é usada somente nesta sessão e não faz parte do código público.</p>
        <form onSubmit={(event) => { event.preventDefault(); authenticate(); }} style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          <label style={field}>
            Chave administrativa
            <input type="password" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} style={control} autoComplete="current-password" />
          </label>
          <button type="submit" style={{ ...control, cursor: 'pointer', background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 700 }}>Acessar</button>
        </form>
        <p style={{ color: '#a1a1aa' }}>{message}</p>
      </main>
    );
  }

  if (!config) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
        <h1>Configuração</h1>
        <p style={{ color: '#a1a1aa' }}>{message}</p>
        <button onClick={() => void load()} style={control}>Tentar novamente</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 80px' }}>
      <a href="/" style={{ color: '#a78bfa', textDecoration: 'none' }}>← Admin</a>
      <button type="button" onClick={logout} style={{ ...control, float: 'right', minHeight: 34, cursor: 'pointer' }}>Sair</button>
      <h1 style={{ marginBottom: 4 }}>Configuração do aplicativo</h1>
      <p style={{ marginTop: 0, color: '#a1a1aa' }}>
        Versão {config.version} · atualizada em {new Date(config.updatedAt).toLocaleString('pt-BR')}
      </p>

      <div style={{ display: 'grid', gap: 18, marginTop: 28 }}>
        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Experiência ativa</h2>
          <label style={{ ...field, maxWidth: 360 }}>
            Modo entregue pela configuração remota
            <select
              value={config.mode}
              onChange={(event) => setConfig({ ...config, mode: event.target.value as AppConfig['mode'] })}
              style={control}
            >
              <option value="streaming">Streaming</option>
              <option value="news">Somente notícias</option>
            </select>
          </label>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Monetização</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={config.ads.enabled}
              onChange={(event) => setConfig({
                ...config,
                ads: { ...config.ads, enabled: event.target.checked }
              })}
            />
            Anúncios habilitados
          </label>

          <div style={{ display: 'grid', gap: 16, marginTop: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={field}>
              Motor
              <select
                value={config.ads.engine}
                onChange={(event) => setConfig({
                  ...config,
                  ads: { ...config.ads, engine: event.target.value as AdsConfig['engine'] }
                })}
                style={control}
              >
                <option value="max">AppLovin MAX</option>
                <option value="admob">AdMob Mediation</option>
                <option value="levelplay">Unity LevelPlay</option>
              </select>
            </label>

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', alignSelf: 'end', minHeight: 42 }}>
              <input
                type="checkbox"
                checked={config.ads.banner.enabled}
                onChange={(event) => setConfig({
                  ...config,
                  ads: { ...config.ads, banner: { enabled: event.target.checked } }
                })}
              />
              Banner
            </label>
          </div>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>App Open</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={config.ads.appOpen.enabled}
              onChange={(event) => setConfig({
                ...config,
                ads: { ...config.ads, appOpen: { ...config.ads.appOpen, enabled: event.target.checked } }
              })}
            />
            Ativo
          </label>
          <div style={{ display: 'grid', gap: 16, marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <NumberField
              label="Intervalo mínimo (min)"
              value={config.ads.appOpen.minIntervalMinutes}
              onChange={(value) => setConfig({ ...config, ads: { ...config.ads, appOpen: { ...config.ads.appOpen, minIntervalMinutes: value } } })}
            />
            <NumberField
              label="Primeiras aberturas sem anúncio"
              value={config.ads.appOpen.skipFirstOpens}
              onChange={(value) => setConfig({ ...config, ads: { ...config.ads, appOpen: { ...config.ads.appOpen, skipFirstOpens: value } } })}
            />
          </div>
        </section>

        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>Interstitial</h2>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={config.ads.interstitial.enabled}
              onChange={(event) => setConfig({
                ...config,
                ads: { ...config.ads, interstitial: { ...config.ads.interstitial, enabled: event.target.checked } }
              })}
            />
            Ativo
          </label>
          <div style={{ display: 'grid', gap: 16, marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <NumberField
              label="Intervalo mínimo (min)"
              value={config.ads.interstitial.minIntervalMinutes}
              onChange={(value) => setConfig({ ...config, ads: { ...config.ads, interstitial: { ...config.ads.interstitial, minIntervalMinutes: value } } })}
            />
            <NumberField
              label="Máximo por sessão"
              value={config.ads.interstitial.maxPerSession}
              onChange={(value) => setConfig({ ...config, ads: { ...config.ads, interstitial: { ...config.ads.interstitial, maxPerSession: value } } })}
            />
            <NumberField
              label="A cada quantas transições"
              value={config.ads.interstitial.pageTransitionFrequency}
              onChange={(value) => setConfig({ ...config, ads: { ...config.ads, interstitial: { ...config.ads.interstitial, pageTransitionFrequency: value } } })}
            />
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
            <input
              type="checkbox"
              checked={config.ads.interstitial.showOnEpisodeStart}
              onChange={(event) => setConfig({ ...config, ads: { ...config.ads, interstitial: { ...config.ads.interstitial, showOnEpisodeStart: event.target.checked } } })}
            />
            Exibir ao iniciar episódio
          </label>
        </section>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          style={{ ...control, cursor: saving ? 'wait' : 'pointer', background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 700, paddingInline: 18 }}
        >
          {saving ? 'Salvando...' : 'Publicar configuração'}
        </button>
        <span style={{ color: '#a1a1aa' }}>{message}</span>
      </div>
    </main>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label style={field}>
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        style={control}
      />
    </label>
  );
}
