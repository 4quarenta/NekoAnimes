import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchManifest } from '../lib/api';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

export function HomePage() {
  const navigate = useNavigate();
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });

  if (manifest.isPending) return <AppScreen><div className="neko-skeleton" /><div className="neko-skeleton short" /></AppScreen>;
  if (manifest.isError) return <AppScreen><p className="neko-error">Não foi possível carregar a configuração.</p></AppScreen>;

  if (manifest.data.mode === 'news') {
    return (
      <AppScreen>
        <Eyebrow>Neko News</Eyebrow>
        <ScreenHeader title="Últimas notícias" subtitle="Anime, mangá, indústria e cultura em um feed direto." />
        <Section title="Destaques">
          <div className="neko-list">
            <TextRow title="Destaques do dia" meta="Notícias · Agora" trailing="›" />
            <TextRow title="Novidades de anime e mangá" meta="Lançamentos" trailing="›" />
            <TextRow title="Indústria e cultura" meta="Mercado" trailing="›" />
          </div>
        </Section>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="O que você vai assistir?" subtitle="Rápido, direto e sem uma parede de capas." />
      <button className="neko-search-launcher" type="button" onClick={() => void navigate({ to: '/buscar' })}>
        <span>⌕</span><span>Buscar anime...</span>
      </button>
      <Section title="Continuar assistindo" action={<button className="neko-link" onClick={() => void navigate({ to: '/lista' })}>Ver lista</button>}>
        <div className="neko-list">
          <TextRow title="Anime Alpha" meta="T1 · Episódio 4" trailing="42%" />
          <TextRow title="Anime Beta" meta="T2 · Episódio 8" trailing="71%" />
        </div>
      </Section>
      <Section title="Lançamentos de hoje">
        <div className="neko-list">
          <TextRow title="Anime Gamma" meta="Episódio 7 · 18:30" trailing="›" />
          <TextRow title="Anime Delta" meta="Episódio 11 · 21:00" trailing="›" />
        </div>
      </Section>
      <Section title="Explorar A–Z" action={<button className="neko-link" onClick={() => void navigate({ to: '/catalogo' })}>Abrir catálogo</button>}>
        <div className="neko-letter-preview">{'ABCDEFG'.split('').map((letter) => <span key={letter}>{letter}</span>)}</div>
      </Section>
    </AppScreen>
  );
}
