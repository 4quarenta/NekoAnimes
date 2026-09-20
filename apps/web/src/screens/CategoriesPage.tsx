import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AnimeListRow, AppScreen, EmptyState, Eyebrow, ScreenHeader, Section } from '../components/AppScreen';
import { fetchProviderCategories, fetchProviderCatalog } from '../lib/api';
import { useServerPreference } from '../lib/server-preference';
import { serverLabel } from '../lib/server-label';
import { providerSlug } from '../lib/provider-links';

export function CategoriesPage() {
  const navigate = useNavigate();
  const serverId = useServerPreference(state => state.serverId);
  const genres = useQuery({queryKey:['provider-categories',serverId],queryFn:()=>fetchProviderCategories(serverId!),enabled:Boolean(serverId),staleTime:15*60*1000});
  return <AppScreen>
    <Eyebrow>{serverLabel(serverId)}</Eyebrow>
    <ScreenHeader title="Categorias" subtitle="Categorias publicadas pelo servidor atual." />
    <Section title="Todas as categorias">
      {genres.isPending ? <div className="neko-category-loading" role="status" aria-live="polite"><span className="neko-spinner" aria-hidden="true" /><span>Carregando categorias…</span></div> : null}
      {genres.isError ? <><p className="neko-error">{genres.error.message}</p><button className="neko-secondary-button" onClick={()=>void genres.refetch()}>Tentar novamente</button></> : null}
      <div className="neko-category-grid">{genres.data?.items.map(genre=><button key={genre.id} className="neko-category-card" onClick={()=>void navigate({to:'/categorias/$genreId',params:{genreId:genre.id},search:{page:undefined,server:serverId??undefined}})}><span className="neko-category-mark" aria-hidden="true">✦</span><strong>{genre.name}</strong><small>Ver títulos</small></button>)}</div>
    </Section>
  </AppScreen>;
}
export function CategoryDetailPage() {
  const serverId = useServerPreference(state=>state.serverId);
  const {genreId} = useParams({from:'/categorias/$genreId'});
  return <CategoryItems key={`${serverId}:${genreId}`} serverId={serverId} genreId={genreId} />;
}
function CategoryItems({serverId,genreId}:{serverId:string|null;genreId:string}) {
  const navigate=useNavigate();
  const search=useSearch({from:'/categorias/$genreId'});
  const page=search.server&&search.server!==serverId?1:search.page??1;
  const genres=useQuery({queryKey:['provider-categories',serverId],queryFn:()=>fetchProviderCategories(serverId!),enabled:Boolean(serverId),staleTime:15*60*1000});
  const genre=genres.data?.items.find(item=>item.id===genreId);
  const anime=useQuery({queryKey:['provider-catalog-genre',serverId,genreId,page],queryFn:()=>fetchProviderCatalog(serverId!,{genre:genreId,page}),enabled:Boolean(serverId&&genre),staleTime:2*60*1000});
  const changePage=(value:number)=>{void navigate({to:'/categorias/$genreId',params:{genreId},search:{page:value,server:serverId??undefined}});};
  return <AppScreen>
    <button className="neko-link neko-category-back" onClick={()=>void navigate({to:'/categorias'})}>‹ Todas as categorias</button>
    <Eyebrow>{serverLabel(anime.data?.server.id)}</Eyebrow>
    <ScreenHeader title={genre?.name ?? 'Categoria'} subtitle="Títulos disponíveis nesta categoria do servidor." />
    {genres.isError ? <p className="neko-error">{genres.error.message}</p> : null}
    {genres.data && !genre ? <EmptyState title="Categoria indisponível" description="Esta categoria não existe no servidor atual. Escolha outra categoria." /> : null}
    {(genres.isPending || (genre && (anime.isPending || anime.isFetching))) ? <div className="neko-category-loading" role="status" aria-live="polite"><span className="neko-spinner" aria-hidden="true" /><span>{genres.isPending ? 'Carregando categorias…' : 'Carregando itens…'}</span></div> : null}
    {anime.isError ? <><p className="neko-error">{anime.error.message}</p><button className="neko-secondary-button" onClick={()=>void anime.refetch()}>Tentar novamente</button></> : null}
    <div className="neko-list">{anime.data?.items.map(item=><AnimeListRow key={item.reference} title={item.title} imageUrl={item.imageUrl} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} postType={item.postType} releaseLabel={item.releaseLabel} meta={serverLabel(item.serverId)} onClick={()=>void navigate({to:'/anime/$slug',params:{slug:item.workSlug??providerSlug(item)},search:{provider:item.serverId,ref:item.reference}})} />)}</div>
    {anime.data && !anime.data.items.length ? <EmptyState title="Nenhum título nesta página" description="O servidor não retornou itens. Volte à página anterior ou tente novamente." /> : null}
    {genre ? <div className="neko-pagination" aria-label="Paginação"><button disabled={page===1||anime.isFetching} onClick={()=>changePage(page-1)}>‹ Anterior</button><span>Página {page}</span><button disabled={!anime.data?.hasNextPage||anime.isFetching} onClick={()=>changePage(page+1)}>Próxima ›</button></div> : null}
  </AppScreen>;
}
