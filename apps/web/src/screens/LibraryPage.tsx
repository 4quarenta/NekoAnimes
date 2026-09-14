import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchLibrary } from '../lib/api';
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
      <ScreenHeader title="Minha lista" subtitle="As obras que você salvou nos favoritos." />
      <button className="neko-link" onClick={()=>void navigate({to:'/continuar'})}>Abrir continuar assistindo ›</button>
      <Section title="Minha lista">
        {library.isError ? <div role="alert"><p className="neko-error">{library.error.message}</p><button className="neko-secondary-button" onClick={()=>void library.refetch()}>Tentar novamente</button></div> : null}
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
