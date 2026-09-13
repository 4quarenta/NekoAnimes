import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import app from '../src/index';
import { persistIdentity, readStoredIdentity, fillMetadata } from '../src/catalog-store';
import { extractProviderCategories, providerEpisodeId, browseProvider } from '../src/server-providers';
import { ProviderProgressSchema, sameAnimeTitle } from '@neko/contracts';
import type { ProviderMetadata } from '../src/provider-identity';

let sqlite: DatabaseSync;
let db: D1Database;
let upstream: string[];
const metadata: ProviderMetadata = {canonicalId:'test:work',canonicalTitle:'Contract Anime',malId:912345,anilistId:null,postType:'anime',status:'finished',synopsis:'Saved synopsis',titleEnglish:null,titleRomaji:'Contract Anime',titleNative:null,year:2025,genres:['Action'],scoreBasisPoints:850,imageUrl:'https://example.com/poster.jpg',backdropUrl:null,source:'mapping'};
beforeEach(()=>{
  sqlite?.close();
  sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_initial.sql','utf8'));
  sqlite.exec(readFileSync('migrations/0004_anime_metadata.sql','utf8'));
  const prepare=(sql:string,values:unknown[]=[])=>({
    bind:(...args:unknown[])=>prepare(sql,args),
    first:async()=>sqlite.prepare(sql).get(...values as never[])??null,
    all:async()=>({results:sqlite.prepare(sql).all(...values as never[]),success:true}),
    run:async()=>sqlite.prepare(sql).run(...values as never[])
  });
  db={prepare,batch:async(statements:Array<{run:()=>Promise<unknown>}>)=>{sqlite.exec('BEGIN');try{const rows=[];for(const statement of statements)rows.push(await statement.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
  Object.assign(globalThis,{caches:{default:{match:async()=>undefined,put:async()=>undefined}}});
  upstream=[];
  globalThis.fetch=async (input)=>{
    const url=new URL(String(input));upstream.push(url.toString());
    if(url.hostname==='api.jikan.moe')return Response.json({data:[],pagination:{has_next_page:false}});
    if(url.hostname==='graphql.anilist.co')return Response.json({data:{Page:{media:[]}}});
    if(url.searchParams.has('s'))return new Response('<a href="/anime/contract-anime/">Contract Anime</a><a href="/anime/contract-anime-ii/">Contract Anime II</a>');
    if(url.pathname.replace(/\/$/,'')==='/anime/contract-anime'||url.pathname==='/anime/a/contract-anime')return new Response('<h1>Contract Anime</h1><a href="/episodio/contract-anime-episodio-1/">Episódio 1</a><a href="/episodio/contract-anime-episodio-2/">Episódio 2</a>');
    if(url.pathname==='/')return new Response('<a href="/generos/">Gêneros</a>');
    if(url.pathname==='/wp-json/cronos/v1/animes/filter')return Response.json({success:true,total_pages:3,animes:[{title:`Page ${url.searchParams.get('page')}`,url:'https://goyabu.io/anime/page-two'}]});
    if(url.pathname==='/generos/')return new Response('<a href="/genero/acao" title="Ação"></a>');
    if(url.pathname.startsWith('/genero/acao'))return new Response(Array.from({length:30},(_,i)=>`<a href="/anime/item-${i}/">Item ${i}</a>`).join('')+'<a href="/genero/acao/page/2/">Próxima</a>');
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
test('categories use provider links, title attributes and exclude other hosts/letters',()=>{
  const items=extractProviderCategories('animesdigital','<a href="/genero/acao" title="Ação"></a><a href="/genero/letra-a/">A</a><a href="https://other.test/genero/drama">Drama</a>');
  assert.deepEqual(items,[{id:'acao',name:'Ação',reference:'/genero/acao'}]);
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
