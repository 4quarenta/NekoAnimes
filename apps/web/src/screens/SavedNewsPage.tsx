import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, TextRow } from '../components/AppScreen';
import { readLocalSavedNews, subscribeToLocalSavedNews, type LocalSavedNewsItem } from '../lib/local-saved-news';

export function SavedNewsPage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<LocalSavedNewsItem[]>(() => readLocalSavedNews());

  useEffect(() => subscribeToLocalSavedNews(() => setSaved(readLocalSavedNews())), []);

  return (
    <AppScreen>
      <Eyebrow>Neko News</Eyebrow>
      <ScreenHeader title="Salvos" subtitle="Notícias salvas neste dispositivo." />
      <p className="neko-account-notice">Seus salvos funcionam sem cadastro e ficam armazenados localmente.</p>
      {saved.length ? (
        <div className="neko-list neko-results">
          {saved.map((item) => <TextRow key={item.id} title={item.title} meta={`${item.category} · ${item.sourceName}`} trailing="›" onClick={() => void navigate({ to: '/noticias/$slug', params: { slug: item.slug } })} />)}
        </div>
      ) : <EmptyState title="Nada salvo ainda" description="Abra uma notícia e toque em Salvar para encontrá-la aqui." />}
    </AppScreen>
  );
}
