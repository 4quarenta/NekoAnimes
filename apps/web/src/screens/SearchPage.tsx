import { useState } from 'react';
import { AppScreen, Eyebrow, EmptyState, ScreenHeader, TextRow } from '../components/AppScreen';

const items = [
  ['Attack on Titan', '2013 · Ação · Completo'],
  ['Blue Lock', '2022 · Esporte · Em exibição'],
  ['Frieren', '2023 · Fantasia · Completo'],
  ['Jujutsu Kaisen', '2020 · Ação · Em exibição']
] as const;

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const normalized = normalize(query);
  const results = normalized.length < 2 ? [] : items.filter(([title]) => normalize(title).includes(normalized));

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Buscar" subtitle="Nome, título alternativo ou termo do catálogo." />
      <label className="neko-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar anime..."
          autoComplete="off"
          inputMode="search"
        />
      </label>
      {normalized.length < 2 ? (
        <EmptyState title="Digite para pesquisar" description="A busca começa a partir de 2 caracteres." />
      ) : results.length ? (
        <div className="neko-list neko-results">
          {results.map(([title, meta]) => <TextRow key={title} title={title} meta={meta} trailing="›" />)}
        </div>
      ) : (
        <EmptyState title="Nenhum resultado" description="Tente outro nome ou título alternativo." />
      )}
    </AppScreen>
  );
}
