import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';

export function LibraryPage() {
  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Minha lista" subtitle="Continue de onde parou e organize o que quer assistir." />
      <Section title="Continuar assistindo">
        <div className="neko-list">
          <TextRow title="Anime Alpha" meta="T1 · Episódio 4 de 12" trailing="42%" />
          <TextRow title="Anime Beta" meta="T2 · Episódio 8 de 24" trailing="71%" />
        </div>
      </Section>
      <Section title="Quero assistir">
        <div className="neko-list">
          <TextRow title="Anime Gamma" meta="2026 · Fantasia" trailing="›" />
        </div>
      </Section>
    </AppScreen>
  );
}
