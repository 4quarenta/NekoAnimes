import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchContinueWatching, fetchLibrary } from '../lib/api';
import { auth, type AuthSession } from '../lib/auth';
import { AnimeListRow, AppScreen, EmptyState, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';

export function LibraryPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    void auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const library = useQuery({ queryKey: ['me-library', session?.user.id], queryFn: fetchLibrary, enabled: Boolean(session) });
  const watching = useQuery({ queryKey: ['me-continue', session?.user.id], queryFn: fetchContinueWatching, enabled: Boolean(session) });

  if (!session) {
    return (
      <AppScreen>
        <Eyebrow>NekoAnimes</Eyebrow>
        <ScreenHeader title="Minha lista" subtitle="Entre na sua conta para sincronizar lista e progresso entre dispositivos." />
        <button className="neko-primary-button" type="button" onClick={() => void navigate({ to: '/conta' })}>Entrar na conta</button>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Minha lista" subtitle="Continue de onde parou e organize o que quer assistir." />
      <Section title="Continuar assistindo">
        {watching.isPending ? <div className="neko-skeleton short" /> : null}
        {watching.data?.length ? (
          <div className="neko-list">
            {watching.data.map((item) => {
              const pct = item.durationSeconds > 0 ? Math.min(100, Math.round(item.positionSeconds / item.durationSeconds * 100)) : 0;
              return <AnimeListRow key={item.episodeId} title={item.title} meta={`T${item.seasonNumber} · Episódio ${item.episodeNumber}`} imageUrl={item.imageUrl} postType={item.type} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} trailing={`${pct}%`} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug }, search: { provider: undefined, ref: undefined } })} />;
            })}
          </div>
        ) : watching.data ? <EmptyState title="Nada em andamento" description="Seu progresso aparecerá aqui depois que começar a assistir." /> : null}
      </Section>
      <Section title="Minha lista">
        {library.isPending ? <div className="neko-skeleton short" /> : null}
        {library.data?.length ? (
          <div className="neko-list">
            {library.data.map((item) => <AnimeListRow key={item.animeId} title={item.title} meta={[item.year, labelStatus(item.status)].filter(Boolean).join(' · ')} imageUrl={item.imageUrl} postType={item.type} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug }, search: { provider: undefined, ref: undefined } })} />)}
          </div>
        ) : library.data ? <EmptyState title="Sua lista está vazia" description="Adicione um anime pela página de detalhes para encontrá-lo aqui." /> : null}
      </Section>
    </AppScreen>
  );
}

function labelStatus(status: string) {
  return ({ watchlist: 'Quero assistir', watching: 'Assistindo', completed: 'Concluído', paused: 'Pausado', dropped: 'Abandonado' } as Record<string, string>)[status] ?? status;
}
