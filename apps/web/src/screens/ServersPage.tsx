import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchServerHealth, fetchServers } from '../lib/api';
import { AppScreen, EmptyState, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';
import { useServerPreference } from '../lib/server-preference';
import { serverLabel } from '../lib/server-label';

export function ServersPage() {
  const servers = useQuery({ queryKey: ['servers'], queryFn: fetchServers, staleTime: 10 * 60 * 1000 });
  const health = useQuery({ queryKey: ['servers-health'], queryFn: fetchServerHealth, staleTime: 60 * 1000, refetchInterval: 60 * 1000 });
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
              const status = health.data?.servers.find(item => item.server.id === server.id)?.status;
              return (
                <button key={server.id} type="button" className={selected ? 'neko-server-option is-selected' : 'neko-server-option'} onClick={() => setServerId(server.id)} aria-label={`${serverLabel(server.id)}${server.id === 'goyabu' ? ', recomendado' : ''}, ${status === 'ok' ? 'online' : status === 'unavailable' ? 'offline' : 'status não verificado'}`}>
                  <span className="neko-server-option-mark" aria-hidden="true">{selected ? '✓' : '○'}</span>
                  <span className="neko-server-option-copy">
                    <strong>{serverLabel(server.id)} {server.id === 'goyabu' ? <span className="neko-recommended-badge">Recomendado</span> : null}</strong>
                    <small className={status === 'ok' ? 'neko-server-status is-online' : status === 'unavailable' ? 'neko-server-status is-offline' : 'neko-server-status'}><span aria-hidden="true">●</span> {status === 'ok' ? 'Online' : status === 'unavailable' ? 'Offline' : health.isFetching ? 'Verificando…' : 'Status não verificado'}</small>
                    <small>{server.capabilities.playback ? 'Catálogo e reprodução disponíveis' : 'Reprodução indisponível'}</small>
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
