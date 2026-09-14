import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchServers } from '../lib/api';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';
import { useServerPreference } from '../lib/server-preference';

export function ServersPage() {
  const servers = useQuery({ queryKey: ['servers'], queryFn: fetchServers, staleTime: 10 * 60 * 1000 });
  const selectedServerId = useServerPreference((state) => state.serverId);
  const setServerId = useServerPreference((state) => state.setServerId);

  useEffect(() => {
    if (!selectedServerId && servers.data?.servers[0]) setServerId(servers.data.servers[0].id);
  }, [selectedServerId, servers.data, setServerId]);

  return (
    <AppScreen>
      <Eyebrow>NekoAnimes</Eyebrow>
      <ScreenHeader title="Servidor padrão" subtitle="Escolha uma fonte. O catálogo, episódios e vídeos serão carregados somente dela." />
      <Section title="Servidores disponíveis">
        {servers.isPending ? <div className="neko-skeleton short" /> : null}
        {servers.isError ? <p className="neko-error">Não foi possível carregar os servidores agora.</p> : null}
        {servers.data?.servers.length ? (
          <div className="neko-server-options">
            {servers.data.servers.map((server) => {
              const selected = server.id === selectedServerId;
              return (
                <button key={server.id} type="button" className={selected ? 'neko-server-option is-selected' : 'neko-server-option'} onClick={() => setServerId(server.id)}>
                  <span className="neko-server-option-mark" aria-hidden="true">{selected ? '✓' : '○'}</span>
                  <span className="neko-server-option-copy">
                    <strong>{server.name}</strong>
                    <small>{server.baseUrl.replace(/^https?:\/\//, '')}</small>
                    <small>{server.capabilities.playback ? 'Suporta catálogo e reprodução' : 'Sem suporte a reprodução'}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : servers.data ? <EmptyState title="Nenhum servidor configurado" description="A API não retornou providers para este ambiente." /> : null}
      </Section>
      <p className="neko-account-notice">A preferência fica salva neste dispositivo. A disponibilidade de cada episódio será verificada ao abrir o vídeo.</p>
    </AppScreen>
  );
}
