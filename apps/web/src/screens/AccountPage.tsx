import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { AppScreen, Eyebrow, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { readLocalLibrary, subscribeToLocalLibrary } from '../lib/local-library';
import { readLocalProgressItems } from '../lib/local-progress';
import { useServerPreference } from '../lib/server-preference';
import { serverLabel } from '../lib/server-label';

export function AccountPage() {
  const navigate = useNavigate();
  const serverId = useServerPreference((state) => state.serverId);
  const [libraryCount, setLibraryCount] = useState(() => readLocalLibrary().length);
  const [continueCount, setContinueCount] = useState(() => readLocalProgressItems().filter((item) => !item.completed).length);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setLibraryCount(readLocalLibrary().length);
      setContinueCount(readLocalProgressItems().filter((item) => !item.completed).length);
    };
    const unsubscribe = subscribeToLocalLibrary(refresh);
    window.addEventListener('neko-progress-updated', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('neko-progress-updated', refresh);
    };
  }, []);

  function requestReview() {
    setReviewMessage(NekoNative.appEvent('review_request')
      ? 'Abrindo a avaliação do aplicativo…'
      : 'A avaliação está disponível no aplicativo Android pela Google Play.');
  }

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Perfil" subtitle="Suas preferências e dados ficam neste dispositivo." />
      <Section title="Sua atividade">
        <div className="neko-list">
          <TextRow title="Minha lista" meta={`${libraryCount} ${libraryCount === 1 ? 'obra salva' : 'obras salvas'}`} trailing="›" onClick={() => void navigate({ to: '/lista' })} />
          <TextRow title="Continuar assistindo" meta={`${continueCount} ${continueCount === 1 ? 'episódio em andamento' : 'episódios em andamento'}`} trailing="›" onClick={() => void navigate({ to: '/continuar' })} />
          <TextRow title="Servidor padrão" meta={serverId ? serverLabel(serverId) : 'Não selecionado'} trailing="›" onClick={() => void navigate({ to: '/servidores' })} />
        </div>
      </Section>
      <Section title="Preferências">
        <p className="neko-account-copy">Não é necessário criar uma conta para usar favoritos e continuar assistindo. Esses dados são armazenados localmente.</p>
        <button className="neko-secondary-button" type="button" onClick={() => void navigate({ to: '/reportar' })}>Relatar um problema</button>
        <button className="neko-secondary-button" type="button" onClick={requestReview}>Avaliar aplicativo</button>
        {reviewMessage ? <p className="neko-account-copy">{reviewMessage}</p> : null}
      </Section>
    </AppScreen>
  );
}
