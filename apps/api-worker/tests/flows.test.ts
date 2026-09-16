import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import app from '../src/index';
import { persistIdentity, readStoredIdentity, fillMetadata, enrichProviderCatalog, CATALOG_METADATA_BATCH_SIZE } from '../src/catalog-store';
import type { ServerAnimeMatch } from '../src/server-providers';
import { extractProviderCategories, providerEpisodeId, browseProvider, searchProvider } from '../src/server-providers';
import { ProviderProgressSchema, releaseLabelForTitle, sameAnimeTitle } from '@neko/contracts';
import { parseLoadedProviderMetadata, mergeLoadedMetadata, resolveProviderIdentity } from '../src/provider-identity';
import type { ProviderMetadata } from '../src/provider-identity';

let sqlite: DatabaseSync;
let db: D1Database;
let upstream: string[];
let metadataQueries: number[];
const metadata: ProviderMetadata = {canonicalId:'test:work',canonicalTitle:'Contract Anime',malId:912345,anilistId:null,postType:'anime',status:'finished',synopsis:'Saved synopsis',titleEnglish:null,titleRomaji:'Contract Anime',titleNative:null,year:2025,genres:['Action'],scoreBasisPoints:850,imageUrl:'https://example.com/poster.jpg',backdropUrl:null,source:'mapping'};
beforeEach(()=>{
  sqlite?.close();
  sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_initial.sql','utf8'));
  sqlite.exec(readFileSync('migrations/0004_anime_metadata.sql','utf8'));
  sqlite.exec(readFileSync('migrations/0005_numeric_app_mode.sql','utf8'));
  const prepare=(sql:string,values:unknown[]=[])=>({
    bind:(...args:unknown[])=>prepare(sql,args),
    first:async()=>sqlite.prepare(sql).get(...values as never[])??null,
    all:async()=>{if(sql.includes('AS reference FROM anime_external_ids'))metadataQueries.push(values.length);return {results:sqlite.prepare(sql).all(...values as never[]),success:true};},
    run:async()=>sqlite.prepare(sql).run(...values as never[])
  });
  db={prepare,batch:async(statements:Array<{run:()=>Promise<unknown>}>)=>{sqlite.exec('BEGIN');try{const rows=[];for(const statement of statements)rows.push(await statement.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
  Object.assign(globalThis,{caches:{default:{match:async()=>undefined,put:async()=>undefined}}});
  upstream=[];
  metadataQueries=[];
  globalThis.fetch=async (input)=>{
    const url=new URL(String(input));upstream.push(url.toString());
    if(url.hostname==='api.jikan.moe')return Response.json({data:[],pagination:{has_next_page:false}});
    if(url.hostname==='graphql.anilist.co')return Response.json({data:{Page:{media:[]}}});
    if(url.searchParams.has('s'))return new Response('<a href="/anime/contract-anime/">Contract Anime</a><a href="/anime/contract-anime-ii/">Contract Anime II</a>');
    if(url.pathname.replace(/\/$/,'')==='/anime/contract-anime'||url.pathname==='/anime/a/contract-anime')return new Response('<h1>Contract Anime</h1><a href="/episodio/contract-anime-episodio-1/">Episódio 1</a><a href="/episodio/contract-anime-episodio-2/">Episódio 2</a>');
    if(url.pathname==='/')return new Response('<a href="/generos/">Gêneros</a>');
    if(url.pathname==='/wp-json/cronos/v1/animes/filter')return Response.json({success:true,total_pages:3,animes:[{title:`Page ${url.searchParams.get('page')}`,url:'https://goyabu.io/anime/page-two'}]});
    if(url.pathname==='/generos/')return new Response('<a href="/genero/acao" title="Ação"></a>');
    if(url.pathname.startsWith('/genero/acao'))return new Response(Array.from({length:30},(_,i)=>(i===0||i===2)?`<a href="/anime/item-${i}/"><figure><img class="cover" src="https://animesonlinecc.to/wp-content/uploads/item-${i}.jpg"><span class="title">Item ${i}</span></figure></a>`:`<a href="/anime/item-${i}/">Item ${i}</a>`).join('')+'<a href="/genero/acao/page/2/">Próxima</a>');
    return new Response('',{status:404});
  };
});
async function user(id='user1') {
  const token=`token-${id}`;
  const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('base64url');
  sqlite.prepare('INSERT INTO users(id,email,password_salt,password_hash) VALUES(?,?,?,?)').run(id,`${id}@example.invalid`,'salt','hash');
  sqlite.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest,id,'2099-01-01T00:00:00Z');
  return token;
}
async function request(path:string,token?:string,body?:unknown,method=body?'PUT':'GET') {
  const res=await app.request(`https://api.test${path}`,{method,headers:{...(token?{authorization:`Bearer ${token}`} : {}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})},{DB:db,WEB_APP_URL:'https://web.test'},{waitUntil:()=>undefined,passThroughOnException:()=>undefined} as never);
  return {status:res.status,body:await res.json() as any};
}
test('shared title matching preserves sequel numbers and is not fuzzy',()=>{
  assert.equal(sameAnimeTitle('Contract Anime Dublado','Contract Anime'),true);
  assert.equal(sameAnimeTitle('Mob Psycho 100','Mob Psycho'),false);
  assert.equal(sameAnimeTitle('Contract Anime II','Contract Anime'),false);
});

test('release labels stay visible while identity matching ignores them',()=>{
  assert.equal(releaseLabelForTitle('Beyblade - Dublado'),'Dublado');
  assert.equal(releaseLabelForTitle('Beyblade Legendado'),'Legendado');
  assert.equal(releaseLabelForTitle('Beyblade'),null);
});

test('provider search removes release labels before requesting the provider',async()=>{
  const result=await searchProvider('animesonlinecc','Contract Anime Dublado');
  assert.equal(result[0]?.title,'Contract Anime');
  const searchUrls=upstream.filter(url=>url.includes('animesonlinecc.to/?s='));
  assert.equal(searchUrls.length,1);
  assert.equal(new URL(searchUrls[0]).searchParams.get('s'),'Contract Anime');
});

test('MAL and AniList lookups ignore dublado in provider titles',async()=>{
  const calls:string[]=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));calls.push(url.toString());
    if(url.hostname==='api.jikan.moe') return Response.json({data:[{mal_id:123,title:'Contract Anime',title_english:null,title_japanese:null,synopsis:'Synopsis',type:'TV',status:'Finished Airing',year:2025,score:8.5,episodes:12,genres:[{name:'Action'}],images:{jpg:{large_image_url:'https://example.com/poster.jpg'}}}]});
    if(url.hostname==='graphql.anilist.co') return Response.json({data:{Media:null,Page:{media:[]}}});
    return originalFetch(input,init);
  };
  const context={env:{DB:db},executionCtx:{waitUntil:()=>undefined}} as never;
  const identity=await resolveProviderIdentity(context,{serverId:'goyabu',reference:'/anime/contract-anime-dublado',title:'Contract Anime Dublado',fallbackPostType:'anime',refresh:true});
  assert.equal(identity.malId,123);assert.equal(identity.canonicalTitle,'Contract Anime');assert.equal(identity.imageUrl,'https://example.com/poster.jpg');
  const jikan=new URL(calls.find(url=>url.includes('api.jikan.moe/v4/anime?'))!);
  assert.equal(jikan.searchParams.get('q'),'contract anime');
  globalThis.fetch=originalFetch;
});
test('categories use provider links, title attributes and exclude other hosts/letters',()=>{
  const items=extractProviderCategories('animesdigital','<a href="/genero/acao" title="Ação"></a><a href="/genero/comedia" title="Comédia"></a><a href="/genero/ficcao-cientifica" title="Ficção Científica"></a><a href="/genero/acao-comedia-ficcao-cientifica" title="Ação Comédia Ficção Científica"></a><a href="/genero/letra-a/">A</a><a href="https://other.test/genero/drama">Drama</a>');
  assert.deepEqual(items,[
    {id:'acao',name:'Ação',reference:'/genero/acao'},
    {id:'comedia',name:'Comédia',reference:'/genero/comedia'},
    {id:'ficcao-cientifica',name:'Ficção Científica',reference:'/genero/ficcao-cientifica'}
  ]);
});
test('native episode ids differ between works and normalize trailing slash',()=>{
  assert.notEqual(providerEpisodeId('goyabu','/episodio/a-1'),providerEpisodeId('goyabu','/episodio/b-1'));
  assert.equal(providerEpisodeId('goyabu','/episodio/a-1/'),providerEpisodeId('goyabu','/episodio/a-1'));
});
test('provider pagination keeps the full upstream page even if UI requests 24',async()=>{
  const result=await browseProvider('animesonlinecc',{genre:'acao',page:1,limit:24});
  assert.equal(result.items.length,30);assert.equal(result.hasNextPage,true);
  assert.ok(upstream.some(url=>url.endsWith('/genero/acao/')));
});
test('Goyabu pagination follows its public JSON contract instead of empty HTML pages',async()=>{
  const result=await browseProvider('goyabu',{genre:'acao',page:2});
  assert.equal(result.items[0]?.title,'Page 2');assert.equal(result.hasNextPage,true);
  assert.ok(upstream.some(url=>url.includes('/wp-json/cronos/v1/animes/filter?')&&url.includes('page=2')));
});
test('persisted metadata survives missing enrichment; conflicts cannot steal mappings',async()=>{
  await persistIdentity(db,metadata,'goyabu','/anime/contract-anime/');
  const merged=fillMetadata(metadata,{synopsis:null,imageUrl:null,genres:[]});
  assert.equal(merged.imageUrl,metadata.imageUrl);
  await persistIdentity(db,{...metadata,canonicalId:'other',malId:777},'animesonlinecc','/anime/other');
  await assert.rejects(()=>persistIdentity(db,{...metadata,malId:777},'goyabu','/anime/contract-anime/'));
  assert.equal((await readStoredIdentity(db,'goyabu','/anime/contract-anime'))?.canonicalId,'test:work');
});
test('carregar dados persists the explicit metadata and catalog returns it after leaving detail',async()=>{
  const token=await user();
  const loaded=parseLoadedProviderMetadata({
    canonicalTitle:'Contract Anime Definitivo',
    synopsis:'Sinopse sincronizada',
    imageUrl:'https://cdn.example.invalid/contract.jpg',
    backdropUrl:'https://cdn.example.invalid/contract-backdrop.jpg',
    genres:['Action','Drama'],
    scoreBasisPoints:975,
    postType:'anime'
  });
  const response=await request('/v1/catalog/provider-data',token,{serverId:'goyabu',reference:'/anime/contract-anime',metadata:loaded},'POST');
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.identity.canonicalTitle,'Contract Anime Definitivo');
  assert.equal(response.body.identity.imageUrl,'https://cdn.example.invalid/contract.jpg');
  const catalog=await request('/v1/servers/goyabu/catalog?q=Contract%20Anime');
  assert.equal(catalog.status,200,JSON.stringify(catalog.body));
  assert.equal(catalog.body.items[0].title,'Contract Anime Definitivo');
  assert.equal(catalog.body.items[0].imageUrl,'https://cdn.example.invalid/contract.jpg');
  assert.deepEqual(catalog.body.items[0].genres,['Action','Drama']);
  assert.equal(catalog.body.items[0].scoreBasisPoints,975);
  const replaced=mergeLoadedMetadata({...metadata,imageUrl:'https://old.invalid/poster.jpg',synopsis:'old'},loaded);
  assert.equal(replaced.imageUrl,'https://cdn.example.invalid/contract.jpg');
  assert.equal(replaced.synopsis,'Sinopse sincronizada');
});
test('favorite from server 1 opens episodes from server 2, with the same identity',async()=>{
  await persistIdentity(db,metadata,'goyabu','/anime/contract-anime/');
  const token=await user();
  const favorite=await request('/v1/me/provider-library',token,{serverId:'goyabu',reference:'/anime/contract-anime/'});
  assert.equal(favorite.status,200,JSON.stringify(favorite.body));
  const target=await request(`/v1/servers/animesonlinecc/anime?slug=${encodeURIComponent(favorite.body.slug)}`);
  assert.equal(target.status,200,JSON.stringify(target.body));
  assert.equal(target.body.identity.canonicalId,'test:work');
  assert.equal(target.body.server.id,'animesonlinecc');
  assert.equal(target.body.seasons[0].episodes.length,2);
  const saved=await request('/v1/me/provider-library',token,{serverId:'animesonlinecc',reference:target.body.anime.reference,workSlug:favorite.body.slug});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal((await request('/v1/me/library',token)).body.length,1);
  const search=await request('/v1/servers/animesonlinecc/anime?ref=/anime/contract-anime/');
  assert.equal(search.body.identity.canonicalId,target.body.identity.canonicalId);
});

test('recovery searches automatically without linking, and checks the exact available server',async()=>{
  const saved=await persistIdentity(db,metadata,'goyabu','/anime/contract-anime/');
  const result=await request(`/v1/servers/animesonlinecc/recovery?slug=${encodeURIComponent(saved.slug)}`);
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.work.malId,metadata.malId);
  assert.equal(result.body.available[0].serverId,'goyabu');
  assert.equal(result.body.available[0].reference,'/anime/contract-anime');
  assert.ok(result.body.matches.some((item:any)=>item.title==='Contract Anime'));
  assert.ok(result.body.matches.every((item:any)=>item.serverId==='animesonlinecc'));
  assert.ok(upstream.some(url=>url.startsWith('https://goyabu.io/anime/contract-anime')));
  assert.equal(await readStoredIdentity(db,'animesonlinecc','/anime/contract-anime'),null);
});

test('confirmed alias persists the original MAL, metadata, library and progress after reopening',async()=>{
  const saved=await persistIdentity(db,metadata,'goyabu','/anime/contract-anime');
  const token=await user();
  await request(`/v1/me/library/${metadata.canonicalId}`,token,{});
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>String(input).includes('/anime/contract-alias')
    ? new Response('<h1>Outro nome da obra</h1><a href="/episodio/contract-anime-episodio-1/">Episódio 1</a>') : originalFetch(input,init);
  const body={serverId:'animesonlinecc',reference:'/anime/contract-alias/',workSlug:saved.slug,expectedTitle:'Outro nome da obra',confirmed:true};
  const first=await request('/v1/me/provider-links',token,body,'POST');
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.identity.malId,912345);
  assert.equal(first.body.identity.canonicalId,metadata.canonicalId);
  assert.equal(first.body.identity.imageUrl,metadata.imageUrl);
  assert.equal((await request('/v1/me/provider-links',token,body,'POST')).status,200);
  const reopened=await request(`/v1/servers/animesonlinecc/anime?slug=${encodeURIComponent(saved.slug)}`);
  assert.equal(reopened.status,200,JSON.stringify(reopened.body));
  assert.equal(reopened.body.anime.title,'Outro nome da obra');
  const searched=await request('/v1/servers/animesonlinecc/anime?ref=/anime/contract-alias/');
  assert.equal(searched.body.identity.canonicalId,metadata.canonicalId);
  const progress=await request('/v1/me/provider-progress',token,{serverId:body.serverId,reference:body.reference,workSlug:saved.slug,episodeReference:'/episodio/contract-anime-episodio-1',seasonNumber:1,episodeNumber:1,positionSeconds:42,durationSeconds:1200});
  assert.equal(progress.status,200,JSON.stringify(progress.body));
  const watching=(await request('/v1/me/continue-watching',token)).body;
  assert.equal(watching[0].animeId,metadata.canonicalId);assert.equal(watching[0].positionSeconds,42);
  assert.equal((await request('/v1/me/library',token)).body.length,1);
});

test('provider link requires explicit authenticated confirmation and ownership; conflicts never move links',async()=>{
  const saved=await persistIdentity(db,metadata,'goyabu','/anime/contract-anime');
  const token=await user(),other=await user('other');
  await request(`/v1/me/library/${metadata.canonicalId}`,token,{});
  const body={serverId:'animesonlinecc',reference:'/anime/contract-anime/',workSlug:saved.slug,expectedTitle:'Contract Anime',confirmed:true};
  assert.equal((await request('/v1/me/provider-links',undefined,body,'POST')).status,401);
  assert.equal((await request('/v1/me/provider-links',other,body,'POST')).status,403);
  for(const invalid of [{...body,confirmed:false},{...body,confirmed:undefined},{...body,reference:'//other.test/anime/a'},{...body,malId:123}]) {
    assert.equal((await request('/v1/me/provider-links',token,invalid,'POST')).status,400);
  }
  assert.equal((await request('/v1/me/provider-links',token,{...body,expectedTitle:'Different edition'},'POST')).status,409);
  assert.equal(await readStoredIdentity(db,body.serverId,body.reference),null);
  await persistIdentity(db,{...metadata,canonicalId:'other:work',malId:777},body.serverId,body.reference);
  assert.equal((await request('/v1/me/provider-links',token,body,'POST')).status,409);
  assert.equal((await readStoredIdentity(db,body.serverId,body.reference))?.malId,777);
  assert.equal((await request('/v1/me/library',token)).body[0].animeId,metadata.canonicalId);
});

test('recovery distinguishes unavailable upstream from no matches and never recommends a dead link',async()=>{
  const saved=await persistIdentity(db,metadata,'goyabu','/anime/contract-anime');
  globalThis.fetch=async()=>new Response('',{status:503});
  const result=await request(`/v1/servers/animesonlinecc/recovery?slug=${encodeURIComponent(saved.slug)}`);
  assert.equal(result.status,200);
  assert.deepEqual(result.body.available,[]);assert.deepEqual(result.body.matches,[]);
  assert.equal(result.body.searchFailed,true);assert.equal(result.body.availabilityFailed,true);
});

test('confirmation without MAL shares canonical identity without fabricating a MAL ID',async()=>{
  const saved=await persistIdentity(db,{...metadata,malId:null},'goyabu','/anime/contract-anime');
  const token=await user();await request(`/v1/me/library/${metadata.canonicalId}`,token,{});
  const result=await request('/v1/me/provider-links',token,{serverId:'animesonlinecc',reference:'/anime/contract-anime',workSlug:saved.slug,expectedTitle:'Contract Anime',confirmed:true},'POST');
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.identity.malId,null);
  assert.equal(result.body.identity.canonicalId,metadata.canonicalId);
});

test('confirmed newer reference is used when an older provider mapping stopped working',async()=>{
  const saved=await persistIdentity(db,metadata,'goyabu','/anime/contract-anime');
  await persistIdentity(db,metadata,'animesonlinecc','/anime/dead-reference');
  const token=await user();await request(`/v1/me/library/${metadata.canonicalId}`,token,{});
  const confirmed=await request('/v1/me/provider-links',token,{serverId:'animesonlinecc',reference:'/anime/contract-anime',workSlug:saved.slug,expectedTitle:'Contract Anime',confirmed:true},'POST');
  assert.equal(confirmed.status,200);
  const reopened=await request(`/v1/servers/animesonlinecc/anime?slug=${encodeURIComponent(saved.slug)}`);
  assert.equal(reopened.status,200,JSON.stringify(reopened.body));
  assert.equal(reopened.body.anime.reference,'/anime/contract-anime');
});

test('confirmation rejects redirected references and mismatched work types without mutation',async()=>{
  const saved=await persistIdentity(db,{...metadata,postType:'filme'},'goyabu','/anime/contract-anime');
  const token=await user();await request(`/v1/me/library/${metadata.canonicalId}`,token,{});
  const body={serverId:'animesonlinecc',reference:'/anime/contract-anime',workSlug:saved.slug,expectedTitle:'Contract Anime',confirmed:true};
  assert.equal((await request('/v1/me/provider-links',token,body,'POST')).status,409);
  globalThis.fetch=async()=>{
    const response=new Response('<h1>Contract Anime</h1>');
    Object.defineProperty(response,'url',{value:'https://animesonlinecc.to/anime/another-edition'});
    return response;
  };
  assert.equal((await request('/v1/me/provider-links',token,body,'POST')).status,409);
  assert.equal(await readStoredIdentity(db,body.serverId,body.reference),null);
});
test('provider progress persists canonically across servers, deduplicates works, isolates users',async()=>{
  const saved=await persistIdentity(db,metadata,'goyabu','/anime/contract-anime/');
  const token=await user(),other=await user('other');
  const data={serverId:'animesonlinecc',reference:'/anime/contract-anime/',workSlug:saved.slug,episodeReference:'/episodio/contract-anime-episodio-1/',seasonNumber:1,episodeNumber:1,positionSeconds:120,durationSeconds:1200};
  assert.equal(ProviderProgressSchema.safeParse({...data,positionSeconds:-1}).success,false);
  const first=await request('/v1/me/provider-progress',token,data);
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal((await request('/v1/me/continue-watching',token)).body[0].positionSeconds,120);
  assert.equal((await request('/v1/me/continue-watching',other)).body.length,0);
  assert.equal((await request('/v1/me/provider-progress',token,{...data,episodeReference:'/episodio/another-1/'})).status,409);
  assert.equal((await request('/v1/me/provider-progress',token,{...data,episodeNumber:2,episodeReference:'/episodio/contract-anime-episodio-2/'})).status,200);
  const result=await request('/v1/me/continue-watching',token);
  assert.equal(result.body.length,1);assert.equal(result.body[0].episodeNumber,2);
});
test('authenticated writes reject anonymous requests and unknown provider contracts',async()=>{
  assert.equal((await request('/v1/me/provider-library',undefined,{serverId:'goyabu',reference:'/anime/a'})).status,401);
  const token=await user();
  assert.equal((await request('/v1/me/provider-library',token,{serverId:'other',reference:'//outside.test'})).status,400);
});

test('catalog enrichment uses only persisted provider/reference links, preserves the upstream page and makes no metadata requests',async()=>{
  const first=await persistIdentity(db,{...metadata,postType:'filme',scoreBasisPoints:0},'animesonlinecc','/anime/item-0/');
  await persistIdentity(db,{...metadata,canonicalId:'other-provider',malId:null,imageUrl:'https://example.com/other.jpg'},'goyabu','/anime/item-1');
  const second=await persistIdentity(db,{...metadata,canonicalId:'selected-provider',malId:null,imageUrl:'https://example.com/selected.jpg'},'animesonlinecc','/anime/item-1');
  // Same title on another reference must never establish a catalog link.
  await persistIdentity(db,{...metadata,canonicalId:'title-only',canonicalTitle:'Item 2',malId:null},'animesonlinecc','/anime/unlisted');
  const result=await request('/v1/servers/animesonlinecc/catalog?genre=acao&limit=24');
  assert.equal(result.status,200);
  assert.equal(result.body.items.length,30);
  assert.equal(result.body.pageSize,30);
  assert.equal(result.body.hasNextPage,true);
  assert.equal(result.body.source,'provider');
  assert.equal(result.body.items[0].title,'Contract Anime');
  assert.equal(result.body.items[0].workSlug,first.slug);
  assert.equal(result.body.items[0].scoreBasisPoints,0);
  assert.equal(result.body.items[0].postType,'filme');
  assert.equal(result.body.items.find((item:{title:string})=>item.title==='Item 2')?.imageUrl,'https://animesonlinecc.to/wp-content/uploads/item-2.jpg');
  assert.deepEqual(result.body.items[0].genres,['Action']);
  assert.equal(result.body.items[1].imageUrl,'https://example.com/selected.jpg');
  assert.equal(result.body.items[1].workSlug,second.slug);
  assert.equal(result.body.items[2].workSlug,undefined);
  assert.deepEqual(metadataQueries,[31]);
  assert.ok(upstream.every(url=>new URL(url).hostname==='animesonlinecc.to'));
});

test('search catalog enriches persisted matches without crossing provider identities',async()=>{
  const saved=await persistIdentity(db,metadata,'animesonlinecc','/anime/contract-anime');
  await persistIdentity(db,{...metadata,canonicalId:'sequel',malId:null},'goyabu','/anime/contract-anime-ii');
  const result=await request('/v1/servers/animesonlinecc/catalog?q=Contract%20Anime');
  assert.equal(result.status,200);
  assert.equal(result.body.items[0].workSlug,saved.slug);
  assert.equal(result.body.items[1].workSlug,undefined);
  assert.deepEqual(metadataQueries,[3]);
  assert.equal(upstream.length,1);
});

test('metadata batches deduplicate references, bound parameters and leave unknown or foreign items intact',async()=>{
  const items:ServerAnimeMatch[]=Array.from({length:CATALOG_METADATA_BATCH_SIZE*2+1},(_,i)=>({serverId:'goyabu',serverName:'Goyabu',title:`Item ${i}`,reference:`/anime/item-${i}`,url:`https://goyabu.io/anime/item-${i}`,confidence:1,postType:'anime'}));
  items.push({...items[0]!,reference:items[0]!.reference+'/'});
  items.push({...items[0]!,serverId:'animesonlinecc'});
  await persistIdentity(db,metadata,'goyabu',items[0]!.reference);
  const result=await enrichProviderCatalog(db,'goyabu',items);
  assert.equal(result.length,items.length);
  assert.equal(result[0]!.workSlug,result[result.length-2]!.workSlug);
  assert.equal(result[1],items[1]);
  assert.equal(result[result.length-1],items[items.length-1]);
  assert.deepEqual(metadataQueries,[81,81,2]);
  assert.equal(upstream.length,0);
  metadataQueries=[];
  assert.deepEqual(await enrichProviderCatalog(db,'goyabu',[]),[]);
  assert.deepEqual(metadataQueries,[]);
});

test('ambiguous canonical references and malformed stored genres do not misidentify catalog items',async()=>{
  await persistIdentity(db,metadata,'goyabu','/anime/ambiguous');
  await persistIdentity(db,{...metadata,canonicalId:'conflicting',malId:null},'goyabu','/anime/other');
  sqlite.prepare('INSERT INTO anime_external_ids(id,anime_id,provider,external_id) VALUES(?,?,?,?)').run('legacy','conflicting','goyabu','/anime/ambiguous/');
  sqlite.prepare('UPDATE anime SET genres=? WHERE id=?').run('{invalid','conflicting');
  const items:ServerAnimeMatch[]=['ambiguous','other'].map(name=>({serverId:'goyabu',serverName:'Goyabu',title:name,reference:`/anime/${name}`,url:`https://goyabu.io/anime/${name}`,confidence:1,postType:'anime'}));
  const result=await enrichProviderCatalog(db,'goyabu',items);
  assert.equal(result[0],items[0]);
  assert.equal(result[1]!.workSlug,'work-conflicting');
  assert.equal(result[1]!.genres,undefined);
});

test('generated manifest includes secondary continue route and Minha lista, independent of saved navigation payload',async()=>{
  sqlite.prepare('INSERT INTO app_config(id,version,mode,payload) VALUES(1,2,?,?)').run(1,JSON.stringify({navigation:[{route:'/wrong'}]}));
  const result=await request('/v1/app-manifest');
  assert.equal(result.status,200);
  assert.deepEqual(result.body.navigation.slice(0,3).map((item:{route:string})=>item.route),['/','/buscar','/categorias']);
  assert.equal(result.body.navigation.find((item:{route:string})=>item.route==='/lista').label,'Minha lista');
  assert.equal(result.body.navigation.filter((item:{route:string})=>item.route==='/continuar').length,1);
  assert.equal(result.body.navigation.length,7);
  sqlite.prepare('UPDATE app_config SET mode=? WHERE id=1').run(2);
  assert.equal((await request('/v1/app-manifest')).body.navigation.some((item:{route:string})=>item.route==='/continuar'),false);
});
