import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Session } from '@supabase/supabase-js';
import { fetchSavedNews } from '../lib/api';
import { supabase } from '../lib/supabase';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, TextRow } from '../components/AppScreen';

export function SavedNewsPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const saved = useQuery({ queryKey: ['me-saved-news', session?.user.id], queryFn: fetchSavedNews, enabled: Boolean(session) });

  if (!session) {
    return (
      <AppScreen>
        <Eyebrow>Neko News</Eyebrow>
        <ScreenHeader title="Salvos" subtitle="Entre na sua conta para sincronizar notícias salvas entre dispositivos." />
        <button className="neko-primary-button" type="button" onClick={() => void navigate({ to: '/conta' })}>Entrar na conta</button>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Eyebrow>Neko News</Eyebrow>
      <ScreenHeader title="Salvos" subtitle="Notícias sincronizadas com sua conta." />
      {saved.isPending ? <div className="neko-skeleton short" /> : null}
      {saved.data?.length ? (
        <div className="neko-list neko-results">
          {saved.data.map((item) => <TextRow key={item.id} title={item.title} meta={`${item.category} · ${item.sourceName}`} trailing="›" onClick={() => void navigate({ to: '/noticias/$slug', params: { slug: item.slug } })} />)}
        </div>
      ) : saved.data ? <EmptyState title="Nada salvo ainda" description="Abra uma notícia e toque em Salvar para encontrá-la aqui." /> : null}
    </AppScreen>
  );
}
