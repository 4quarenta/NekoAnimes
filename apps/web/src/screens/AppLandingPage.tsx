import { useQuery } from '@tanstack/react-query';
import { fetchAndroidUpdate } from '../lib/api';

const playStoreUrl = import.meta.env.VITE_PLAY_STORE_URL
  ?? 'https://play.google.com/store/apps/details?id=com.nekoanimes.app';

export function AppLandingPage() {
  const update = useQuery({
    queryKey: ['public-android-update'],
    queryFn: fetchAndroidUpdate,
    staleTime: 5 * 60 * 1000
  });

  return <main className="neko-landing">
    <nav className="neko-landing-nav" aria-label="Links institucionais">
      <img src="/brand/nekoanimes-logo.png" alt="NekoAnimes" />
      <div>
        <a href="/privacidade">Privacidade</a>
        <a href="/reportar">Contato</a>
      </div>
    </nav>

    <section className="neko-landing-hero">
      <div className="neko-landing-copy">
        <span className="neko-landing-kicker">Aplicativo Android</span>
        <h1>Seu catálogo de animes, organizado em um só lugar.</h1>
        <p>Pesquise obras, explore categorias, salve seus favoritos e continue do episódio em que parou em uma experiência criada para Android.</p>
        <div className="neko-landing-actions">
          <a className="neko-store-button" href={playStoreUrl} target="_blank" rel="noreferrer">
            <span aria-hidden="true">▶</span>
            <span><small>Disponível na</small><strong>Google Play</strong></span>
          </a>
          {update.data?.apkUrl ? <a className="neko-apk-button" href={update.data.apkUrl}>Baixar APK de teste</a> : null}
        </div>
        {update.isPending ? <p className="neko-landing-status">Consultando a versão disponível…</p> : null}
        {update.data ? <p className="neko-landing-status">Versão Android {update.data.versionName}</p> : null}
      </div>
      <div className="neko-landing-device" aria-label="Prévia do aplicativo NekoAnimes">
        <div className="neko-landing-device-top" />
        <img src="/brand/nekoanimes-icon.png" alt="" aria-hidden="true" />
        <strong>Encontre seu próximo anime</strong>
        <span>Busca, categorias e listas pessoais.</span>
        <div className="neko-landing-preview-row"><i /><b>Catálogo organizado</b></div>
        <div className="neko-landing-preview-row"><i /><b>Continuar assistindo</b></div>
        <div className="neko-landing-preview-row"><i /><b>Favoritos no aparelho</b></div>
      </div>
    </section>

    <section className="neko-landing-features" aria-label="Recursos do aplicativo">
      <article><span>⌕</span><h2>Descubra</h2><p>Busca e categorias para encontrar títulos com rapidez.</p></article>
      <article><span>♡</span><h2>Organize</h2><p>Favoritos e progresso ficam disponíveis no próprio aparelho.</p></article>
      <article><span>▷</span><h2>Assista</h2><p>Player Android integrado com retomada e navegação entre episódios.</p></article>
    </section>

    <footer className="neko-landing-footer">
      <span>© 2026 NekoAnimes</span>
      <div><a href="/privacidade">Política de Privacidade</a><a href="/reportar">Suporte e remoção</a></div>
    </footer>
  </main>;
}
