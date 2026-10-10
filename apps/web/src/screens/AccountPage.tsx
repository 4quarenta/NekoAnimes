import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { NekoNative } from '@neko/bridge-web';
import { AppScreen, Eyebrow, LoadingState, ScreenHeader, Section, TextRow } from '../components/AppScreen';
import { fetchManifest } from '../lib/api';
import { readLocalLibrary, subscribeToLocalLibrary } from '../lib/local-library';
import { readLocalProgressItems } from '../lib/local-progress';
import { readLocalSavedNews, subscribeToLocalSavedNews } from '../lib/local-saved-news';
import { useServerPreference } from '../lib/server-preference';
import { serverLabel } from '../lib/server-label';

export function AccountPage() {
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });

  if (manifest.isPending) return <AppScreen><LoadingState label="Carregando perfil…" /></AppScreen>;
  if (manifest.isError) return <AppScreen><p role="alert" className="neko-error">Não foi possível carregar o perfil.</p><button className="neko-secondary-button" onClick={() => void manifest.refetch()}>Tentar novamente</button></AppScreen>;

  return manifest.data.mode === 2 ? <ModeTwoAccount /> : <ModeOneAccount />;
}

function ModeOneAccount() {
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
      <ProfileActions reviewMessage={reviewMessage} requestReview={requestReview} />
    </AppScreen>
  );
}

function ModeTwoAccount() {
  const navigate = useNavigate();
  const [savedCount, setSavedCount] = useState(() => readLocalSavedNews().length);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => subscribeToLocalSavedNews(() => setSavedCount(readLocalSavedNews().length)), []);

  function requestReview() {
    setReviewMessage(NekoNative.appEvent('review_request')
      ? 'Abrindo a avaliação do aplicativo…'
      : 'A avaliação está disponível no aplicativo Android pela Google Play.');
  }

  return (
    <AppScreen>
      <Eyebrow>Neko News</Eyebrow>
      <ScreenHeader title="Perfil" subtitle="Suas preferências e notícias salvas ficam neste dispositivo." />
      <Section title="Sua atividade">
        <div className="neko-list">
          <TextRow title="Notícias salvas" meta={`${savedCount} ${savedCount === 1 ? 'notícia salva' : 'notícias salvas'}`} trailing="›" onClick={() => void navigate({ to: '/salvos' })} />
        </div>
      </Section>
      <ProfileActions reviewMessage={reviewMessage} requestReview={requestReview} />
    </AppScreen>
  );
}

function ProfileActions({ reviewMessage, requestReview }: { reviewMessage: string | null; requestReview: () => void }) {
  const navigate = useNavigate();
  return (
    <Section title="Preferências">
      <p className="neko-account-copy">O aplicativo não exige cadastro. Os dados pessoais desta tela permanecem armazenados localmente.</p>
      <button className="neko-secondary-button" type="button" onClick={() => void navigate({ to: '/reportar' })}>Relatar um problema</button>
      <button className="neko-secondary-button" type="button" onClick={() => void navigate({ to: '/privacidade' })}>Política de Privacidade</button>
      <button className="neko-secondary-button" type="button" onClick={requestReview}>Avaliar aplicativo</button>
      {reviewMessage ? <p className="neko-account-copy">{reviewMessage}</p> : null}
    </Section>
  );
}
