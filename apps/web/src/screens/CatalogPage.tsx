import { useState } from 'react';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const sample = [
  ['Anime Alpha', '2026 · Ação · Em exibição'],
  ['Anime Arc', '2025 · Fantasia · Completo'],
  ['Anime Aurora', '2026 · Drama · Em exibição']
] as const;

export function CatalogPage() {
  const [letter, setLetter] = useState('A');

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Catálogo A–Z" subtitle="Encontre rapidamente pelo nome, sem depender de capas." />
      <div className="neko-letter-strip" aria-label="Filtrar por letra">
        {letters.map((item) => (
          <button
            type="button"
            key={item}
            className={item === letter ? 'is-active' : ''}
            onClick={() => setLetter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <Section title={`Letra ${letter}`}>
        <div className="neko-list">
          {sample.map(([title, meta]) => <TextRow key={title} title={title.replace('A', letter)} meta={meta} trailing="›" />)}
        </div>
      </Section>
    </AppScreen>
  );
}
