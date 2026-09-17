import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { AnimeListRow, AppScreen, EmptyState, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';
import { readLocalLibrary, subscribeToLocalLibrary, type LocalLibraryItem } from '../lib/local-library';

export function LibraryPage() {
  const navigate = useNavigate();
  const [library, setLibrary] = useState<LocalLibraryItem[]>(() => readLocalLibrary());

  useEffect(() => subscribeToLocalLibrary(() => setLibrary(readLocalLibrary())), []);

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Minha lista" subtitle="As obras que você salvou neste dispositivo." />
      <button className="neko-link" onClick={() => void navigate({ to: '/continuar' })}>Abrir continuar assistindo ›</button>
      <p className="neko-account-notice">Sua lista funciona sem cadastro e fica armazenada localmente neste aparelho.</p>
      <Section title="Minha lista">
        {library.length ? (
          <div className="neko-list">
            {library.map((item) => <AnimeListRow key={`${item.providerId ?? 'local'}:${item.animeId}:${item.reference ?? ''}`} title={item.title} meta={item.year ? String(item.year) : undefined} imageUrl={item.imageUrl} postType={item.type} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} releaseLabel={item.releaseLabel} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.workSlug ?? item.slug }, search: { provider: item.providerId, ref: item.reference } })} />)}
          </div>
        ) : <EmptyState title="Sua lista está vazia" description="Adicione uma obra pela página de detalhes para encontrá-la aqui." />}
      </Section>
    </AppScreen>
  );
}
