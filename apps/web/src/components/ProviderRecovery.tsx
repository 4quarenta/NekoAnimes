import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ProviderRecovery as Recovery, ProviderWorkOption } from '@neko/contracts';
import { confirmProviderMatch, fetchProviderRecovery, fetchServerAnime } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { Eyebrow, PosterImage, ScreenHeader, Section, TextRow } from './AppScreen';

export function ProviderRecovery({ serverId, slug, onRetry }: { serverId: string; slug: string; onRetry: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setServerId = useServerPreference(state => state.setServerId);
  const recovery = useQuery({ queryKey: ['provider-recovery', serverId, slug], queryFn: ({ signal }) => fetchProviderRecovery(serverId, slug, signal), staleTime: 60_000, retry: false });
  const [candidate, setCandidate] = useState<ProviderWorkOption | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const data = recovery.data;

  async function switchToAvailable(option: ProviderWorkOption) {
    setSwitching(option.serverId); setSwitchError(null);
    try {
      // Revalidate the exact known reference before changing the default server.
      const detail = await fetchServerAnime(option.serverId, option.reference);
      if (detail.anime.reference.replace(/\/$/, '') !== option.reference.replace(/\/$/, '')) throw new Error('O servidor redirecionou para outro item. Tente novamente mais tarde.');
      queryClient.setQueryData(['provider-anime', option.serverId, option.reference, slug], detail);
      setServerId(option.serverId);
      await navigate({ to: '/anime/$slug', params: { slug }, search: { provider: option.serverId, ref: option.reference }, replace: true });
    } catch (error) { setSwitchError(error instanceof Error ? error.message : 'Não foi possível abrir este servidor agora.'); }
    finally { setSwitching(null); }
  }

  return <div className="neko-recovery">
    <Eyebrow>Minha lista · disponibilidade</Eyebrow>
    <ScreenHeader title="Vamos encontrar sua obra" subtitle="Sua obra continua salva. Vamos conferir as opções para abri-la." />
    {data ? <>
      <div className="neko-recovery-summary">
        <Cover src={data.work.imageUrl} title={data.work.title} />
        <div><strong>{data.work.title}</strong><p>Não foi possível abrir esta obra em <b>{data.server.name}</b>.</p><small>Seus favoritos e progresso continuam preservados.</small></div>
      </div>
      <Section title="Disponível em outro servidor">
        {data.available.map(option => <button type="button" key={option.serverId} className="neko-recovery-switch" disabled={switching !== null} onClick={() => void switchToAvailable(option)}>
          <span><strong>{option.serverName}</strong><small>Obra vinculada · página disponível</small></span><span>{switching === option.serverId ? 'Abrindo…' : 'Trocar servidor →'}</span>
        </button>)}
        {!data.available.length ? <p className="neko-recovery-hint">{data.availabilityFailed ? 'Não conseguimos verificar os servidores vinculados agora.' : 'Ainda não há outro servidor vinculado disponível.'}</p> : null}
        {switchError ? <p className="neko-error" role="alert">{switchError}</p> : null}
      </Section>
      <Section title={`Possíveis correspondências em ${data.server.name}`}>
        <p className="neko-recovery-hint">Buscamos automaticamente pelo título e seus nomes alternativos. Toque em um resultado para conferir se é a mesma obra.</p>
        <div className="neko-recovery-results">{data.matches.map(match => <TextRow key={match.reference} title={match.title} imageUrl={match.imageUrl} showImagePlaceholder meta={`${typeLabel(match.postType)} · ${match.serverName}`} trailing="Conferir ›" onClick={() => setCandidate(match)} />)}</div>
        {!data.matches.length ? <p className="neko-recovery-empty">{data.searchFailed ? 'O servidor não respondeu à busca. Isso não significa que a obra não existe nele.' : 'Nenhuma correspondência encontrada neste servidor.'}</p> : null}
        {data.searchFailed && data.matches.length ? <p className="neko-recovery-hint">A busca ficou incompleta; algumas consultas não responderam.</p> : null}
        <button type="button" className="neko-secondary-button" disabled={recovery.isFetching} onClick={() => void recovery.refetch()}>{recovery.isFetching ? 'Atualizando…' : 'Atualizar opções'}</button>
      </Section>
    </> : recovery.isPending ? <div role="status" className="neko-recovery-loading"><span className="neko-player-spinner" aria-hidden="true" /><p>Buscando correspondências e verificando seus servidores…</p></div> : <div role="alert" className="neko-recovery-empty"><p>{recovery.error?.message ?? 'Não foi possível consultar as opções agora.'}</p><button className="neko-secondary-button" onClick={() => void recovery.refetch()}>Tentar buscar novamente</button></div>}
    <button type="button" className="neko-link" onClick={onRetry}>Tentar abrir a obra novamente</button>
    {candidate && data ? <ConfirmMatch key={`${serverId}:${slug}:${candidate.reference}`} work={data.work} candidate={candidate} onClose={() => setCandidate(null)} /> : null}
  </div>;
}

function typeLabel(value: ProviderWorkOption['postType']) { return value === 'filme' ? 'Filme' : value === 'manga' ? 'Mangá' : 'Anime'; }
function Cover({ src, title }: { src: string | null | undefined; title: string }) {
  return src ? <PosterImage className="neko-recovery-cover" src={src} alt={`Capa de ${title}`} /> : <span className="neko-recovery-cover is-placeholder" aria-hidden="true">✦</span>;
}

function ConfirmMatch({ work, candidate, onClose }: { work: Recovery['work']; candidate: ProviderWorkOption; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const detail = useQuery({ queryKey: ['provider-candidate', candidate.serverId, candidate.reference], queryFn: () => fetchServerAnime(candidate.serverId, candidate.reference), retry: false, staleTime: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);

  async function confirm() {
    if (!detail.data || saving) return;
    setSaving(true); setError(null);
    try {
      const saved = await confirmProviderMatch(work.slug, candidate.serverId, detail.data.anime.reference, detail.data.anime.title);
      await Promise.all(['provider-anime', 'provider-catalog', 'provider-recovery', 'me-library', 'me-continue', 'anime'].map(key => queryClient.invalidateQueries({ queryKey: [key], refetchType: 'none' })));
      queryClient.setQueryData(['provider-anime', candidate.serverId, undefined, work.slug], saved);
      await navigate({ to: '/anime/$slug', params: { slug: work.slug }, search: { provider: candidate.serverId, ref: undefined }, replace: true });
      onClose();
    } catch (err) { setError(err instanceof Error && err.message === 'AUTH_REQUIRED' ? 'Entre na sua conta novamente para salvar o vínculo.' : err instanceof Error ? err.message : 'Não foi possível salvar o vínculo.'); }
    finally { setSaving(false); }
  }
  const preview = detail.data;
  return createPortal(<dialog ref={dialog} className="neko-match-dialog" aria-labelledby="neko-match-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header><h2 id="neko-match-title">É o mesmo item?</h2><button type="button" aria-label="Fechar comparação" disabled={saving} onClick={onClose}>×</button></header>
    <p>Confira o título, o tipo e a temporada antes de vincular.</p>
    <div className="neko-match-comparison">
      <article><small>Obra da sua lista</small><Cover src={work.imageUrl} title={work.title} /><strong>{work.title}</strong><span>{[typeLabel(work.postType), work.year].filter(Boolean).join(' · ')}</span>{work.malId ? <span>MAL #{work.malId}</span> : null}</article>
      <article><small>{candidate.serverName}</small><Cover src={preview?.anime.imageUrl ?? candidate.imageUrl} title={preview?.anime.title ?? candidate.title} /><strong>{preview?.anime.title ?? candidate.title}</strong><span>{[typeLabel(preview?.postType ?? candidate.postType), preview?.anime.year].filter(Boolean).join(' · ')}</span>{preview ? <span>{preview.seasons.length} temporada(s) · {preview.seasons.reduce((sum, season) => sum + season.episodes.length, 0)} episódios</span> : null}</article>
    </div>
    {detail.isPending ? <p role="status">Carregando os dados do resultado…</p> : null}
    {detail.isError ? <div role="alert"><p>Não foi possível conferir este resultado.</p><button className="neko-secondary-button" onClick={() => void detail.refetch()}>Tentar novamente</button></div> : null}
    <p className="neko-recovery-hint">{work.malId ? `Ao confirmar, os dois itens usarão o MAL #${work.malId}, os dados e o progresso da obra salva.` : 'Ao confirmar, os dois itens usarão a mesma obra salva e seu progresso. Ela ainda não possui MAL ID; nenhum ID será inventado.'}</p>
    {error ? <p role="alert" className="neko-error">{error}</p> : null}
    <div className="neko-match-actions">
      <button type="button" className="neko-primary-button" disabled={!preview || saving || detail.isFetching} onClick={() => void confirm()}>{saving ? 'Salvando vínculo…' : 'Sim, vincular e abrir'}</button>
      <button type="button" className="neko-secondary-button" disabled={saving} onClick={() => { onClose(); void navigate({ to: '/anime/$slug', params: { slug: `provider-${candidate.serverId}` }, search: { provider: candidate.serverId, ref: candidate.reference } }); }}>Não, abrir separadamente</button>
    </div>
  </dialog>, document.body);
}
