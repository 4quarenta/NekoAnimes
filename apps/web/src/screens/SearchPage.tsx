import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { fetchManifest, fetchNews, fetchProviderCatalog } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { serverLabel } from '../lib/server-label';
import { providerSlug } from '../lib/provider-links';
import { AnimeListRow, AppScreen, Eyebrow, EmptyState, ScreenHeader, TextRow } from '../components/AppScreen';

export function SearchPage() {
  const search=useSearch({from:'/buscar'});
  const [query, setQuery] = useState(search.q??'');
  const [debounced,setDebounced]=useState(query);
  useEffect(()=>setQuery(search.q??''),[search.q]);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(query),350);return()=>clearTimeout(timer);},[query]);
  const navigate = useNavigate();
  const serverId = useServerPreference((state) => state.serverId);
  const normalized = debounced.trim();
  const manifest = useQuery({ queryKey: ['app-manifest'], queryFn: fetchManifest });
  const isModeTwo = manifest.data?.mode === 2;

  const catalogResults = useQuery({
    queryKey: ['provider-catalog-search', serverId, normalized],
    queryFn: ({signal}) => fetchProviderCatalog(serverId!, { query: normalized, limit: 50 },signal),
    enabled: !isModeTwo && normalized.length >= 2 && Boolean(serverId)
  });
  const newsResults = useQuery({
    queryKey: ['news-search', normalized],
    queryFn: () => fetchNews({ query: normalized, limit: 50 }),
    enabled: isModeTwo && normalized.length >= 2
  });

  if (manifest.isPending) return <AppScreen><div className="neko-skeleton" /></AppScreen>;
  if (manifest.isError) return <AppScreen><p role="alert" className="neko-error">Não foi possível carregar a configuração da busca.</p><button className="neko-secondary-button" onClick={()=>void manifest.refetch()}>Tentar novamente</button></AppScreen>;

  return (
    <AppScreen>
      {isModeTwo ? <Eyebrow>Neko News</Eyebrow> : null}
      <ScreenHeader
        title="Buscar"
        subtitle={isModeTwo ? 'Pesquise por título, resumo ou fonte.' : 'Nome, título em inglês ou título romanizado.'}
      />
      <label className="neko-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => {const q=event.target.value;setQuery(q);void navigate({to:'/buscar',search:{q:q||undefined},replace:true,resetScroll:false});}}
          placeholder={isModeTwo ? 'Buscar notícia...' : 'Buscar anime...'}
          autoComplete="off"
          inputMode="search"
      />
      </label>
      {(isModeTwo?newsResults:catalogResults).isError?<div role="alert"><p className="neko-error">Não foi possível consultar este servidor. Tente novamente ou troque a fonte.</p><button className="neko-secondary-button" onClick={()=>void (isModeTwo?newsResults:catalogResults).refetch()}>Tentar novamente</button>{!isModeTwo?<button className="neko-link" onClick={()=>void navigate({to:'/servidores'})}>Trocar servidor</button>:null}</div>:null}
      {normalized.length < 2 ? <EmptyState title="Digite para pesquisar" description="A busca começa a partir de 2 caracteres." /> : null}
      {isModeTwo ? (
        <>
          {newsResults.isPending && normalized.length >= 2 ? <div className="neko-skeleton short" /> : null}
          {newsResults.data?.items.length ? (
            <div className="neko-list neko-results">
              {newsResults.data.items.map((item) => (
                <TextRow key={item.id} title={item.title} meta={`${item.category} · ${item.sourceName}`} trailing="›" onClick={() => void navigate({ to: '/noticias/$slug', params: { slug: item.slug } })} />
              ))}
            </div>
          ) : newsResults.data ? <EmptyState title="Nenhuma notícia encontrada" description="Tente outro termo de pesquisa." /> : null}
        </>
      ) : (
        <>
          {catalogResults.isPending && normalized.length >= 2 ? <div className="neko-skeleton short" /> : null}
          {catalogResults.data?.items.length ? (
            <div className="neko-list neko-results">
              {catalogResults.data.items.map((item) => <AnimeListRow key={item.reference} title={item.title} imageUrl={item.imageUrl} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} postType={item.postType} releaseLabel={item.releaseLabel} meta={serverLabel(catalogResults.data.server.id)} onClick={() => void navigate({ to: '/anime/$slug', params: { slug: item.workSlug??providerSlug(item) }, search: { provider: item.serverId, ref: item.reference } })} />)}
            </div>
          ) : catalogResults.data ? <EmptyState title="Nenhum resultado" description="Tente outro nome ou título alternativo." /> : null}
        </>
      )}
    </AppScreen>
  );
}
