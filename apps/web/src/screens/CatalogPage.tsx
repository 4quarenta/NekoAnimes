import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { fetchCatalog } from '../lib/api';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function CatalogPage() {
  const [letter, setLetter] = useState('A');
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: ['catalog', letter], queryFn: () => fetchCatalog({ letter, limit: 100 }) });

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Catálogo A–Z" subtitle="Encontre rapidamente pelo nome, sem depender de capas." />
      <div className="neko-letter-strip" aria-label="Filtrar por letra">
        {letters.map((item) => <button type="button" key={item} className={item === letter ? 'is-active' : ''} onClick={() => setLetter(item)}>{item}</button>)}
      </div>
      <Section title={`Letra ${letter}`}>
        {catalog.isPending ? <div className="neko-skeleton short" /> : null}
        {catalog.data?.items.length ? (
          <div className="neko-list">
            {catalog.data.items.map((item) => (
              <TextRow key={item.id} title={item.title} meta={[item.year, item.genres[0], item.status].filter(Boolean).join(' · ')} trailing="›" onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.slug } })} />
            ))}
          </div>
        ) : catalog.data ? <EmptyState title="Nenhum título" description={`Ainda não há títulos na letra ${letter}.`} /> : null}
      </Section>
    </AppScreen>
  );
}
