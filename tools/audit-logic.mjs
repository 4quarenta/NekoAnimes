// Diagnostic reproduction of known defects, NOT passing regression coverage.
// No real accounts, providers, media playback or staging writes are used.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key)
};
globalThis.window = new EventTarget();
window.localStorage = localStorage;
localStorage.setItem('nekoanimes.auth.session', JSON.stringify({access_token:'audit-only',user:{id:'audit-user'}}));
const compiled = await build({
  stdin: {contents: `export * from './apps/web/src/lib/local-progress.ts'; export * from './apps/web/src/lib/progress-sync.ts';`, resolveDir:process.cwd()},
  bundle:true, write:false, platform:'node', format:'esm', define:{'import.meta.env':'{}'}
});
const progress = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const active = {animeId:'audit:work',slug:'work-audit',title:'Audit Anime',imageUrl:null,seasonNumber:1,episodeId:'audit:ep:1',episodeNumber:1,episodeTitle:null,providerId:'animesonlinecc',animeReference:'/anime/audit/',episodeReference:'/episodio/audit-1/'};
progress.rememberActivePlayback(active);
progress.recordLocalProgress(active.episodeId,600,1200);
progress.recordLocalProgress(active.episodeId,0,0);
assert.equal(progress.readLocalContinueWatching(active.animeId).positionSeconds,600);
console.log('PASS P1: closing failed playback cannot overwrite a saved 600-second position');

progress.recordLocalProgress(active.episodeId,600,1200);
const releases=[];
let calls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{calls++;await new Promise(resolve=>releases.push(resolve));return Response.json({animeId:active.animeId,slug:active.slug});};
const first=progress.syncPendingProgress();
await new Promise(resolve=>setTimeout(resolve,15));
progress.recordLocalProgress(active.episodeId,700,1200);
const second=progress.syncPendingProgress();
assert.equal(first,second);
releases.shift()();
while (!releases.length) await new Promise(resolve=>setTimeout(resolve,5));
releases.shift()();
await second;
await new Promise(resolve=>setTimeout(resolve,25));
assert.equal(calls,2);
assert.equal(progress.readLocalProgressItems()[0].pendingSync,false);
assert.equal(progress.readLocalProgressItems()[0].positionSeconds,700);
console.log('PASS P1: progress arriving during an upload is drained before sync completes');
globalThis.fetch=originalFetch;

const base=process.env.NEKO_TEST_WEB_URL??'http://127.0.0.1:4173';
const manifest=await (await fetch('https://nekoanimes-api-staging.john-alleff01.workers.dev/v1/app-manifest',{signal:AbortSignal.timeout(15000)})).json();
const server={id:'animesonlinecc',name:'Animes Online',baseUrl:'https://animesonlinecc.to',capabilities:{search:true,anime:true,episodes:true,playback:true}};
const identity={canonicalId:active.animeId,canonicalTitle:active.title,malId:912345,anilistId:912345,postType:'anime',synopsis:'Audit synopsis',titleEnglish:null,titleRomaji:null,titleNative:null,year:2025,genres:['Action'],scoreBasisPoints:850,imageUrl:'https://example.com/poster.png',backdropUrl:null,source:'mapping'};
const episode={id:active.episodeId,number:1,seasonNumber:1,title:'Episódio 1',reference:active.episodeReference,url:'https://animesonlinecc.to/episodio/audit-1/',available:true};
const detail={server,anime:{reference:active.animeReference,title:active.title,url:'https://animesonlinecc.to/anime/audit/'},workSlug:active.slug,identity,postType:'anime',seasons:[{id:'s1',number:1,title:'Temporada 1',episodes:[episode]}],fetchedAt:new Date().toISOString()};
const saved={...active,positionSeconds:600,durationSeconds:1200,completed:false,updatedAt:new Date().toISOString()};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:412,height:820}});
  await page.addInitScript(()=>{
    localStorage.setItem('nekoanimes.selected-server.v1','animesonlinecc');
    localStorage.setItem('nekoanimes.auth.session',JSON.stringify({access_token:'audit-only',user:{id:'audit-user',email:'audit@example.invalid'},expires_in:3600,token_type:'bearer'}));
    window.auditBridge=[];
    window.NekoNativeBridge={postMessage:message=>window.auditBridge.push(JSON.parse(message))};
  });
  let failLogout=false;
  let releaseLogout;
  let failSearch=false;
  let searchFailures=0;
  await page.route('https://example.com/**',route=>route.fulfill({status:204}));
  await page.route('https://graphql.anilist.co/**',route=>route.fulfill({json:{data:{Page:{media:[]}}}}));
  await page.route('**/v1/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(path.endsWith('/catalog')&&url.searchParams.has('q')&&failSearch){searchFailures++;await route.fulfill({status:503,json:{message:'Servidor de teste indisponível'}});return;}
    let json={};
    if(path==='/v1/auth/logout'&&failLogout){await new Promise(resolve=>{releaseLogout=resolve;});}
    if(path==='/v1/app-manifest')json=manifest;
    else if(path==='/v1/servers')json={servers:[server]};
    else if(path.endsWith('/categories'))json={items:[{id:'acao',name:'Ação',reference:'/genero/acao/'}]};
    else if(path.endsWith('/catalog'))json={server,items:[{serverId:server.id,serverName:server.name,reference:active.animeReference,title:active.title,postType:'anime',imageUrl:identity.imageUrl,scoreBasisPoints:850,genres:['Action']}],hasNextPage:true};
    else if(path.endsWith('/anime'))json=detail;
    else if(path.includes('/resolve/'))json={server,anime:detail.anime,season:1,episode,sources:[{id:'test',url:'https://example.com/legal-sample.mp4',mimeType:'video/mp4',label:'Sample',kind:'direct',headers:{},isDefault:true}]};
    else if(path==='/v1/me/continue-watching')json=[saved];
    else if(path==='/v1/me/library'||path==='/v1/me/saved-news')json=[];
    else if(path==='/v1/me')json={id:'audit-user',email:'audit@example.invalid'};
    await route.fulfill({json});
  });
  await page.goto(`${base}/anime/${active.slug}`);
  await page.getByRole('button',{name:'Continuar episódio 1, 50% assistido'}).click();
  await expect.poll(()=>page.evaluate(()=>window.auditBridge.filter(item=>item.type==='player.open').length)).toBe(1);
  const payload=await page.evaluate(()=>window.auditBridge.find(item=>item.type==='player.open').payload);
  assert.equal(payload.startPositionSeconds,600);
  console.log('PASS P1: Continue watching at 50% sends the resume position to Android');

  await page.goto(`${base}/categorias/acao`);
  await page.getByRole('button',{name:'Próxima ›'}).click();
  await expect(page.getByText('Página 2',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Audit Anime/}).click();
  await expect(page.getByRole('heading',{name:active.title,exact:true})).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Página 2',{exact:true})).toBeVisible();
  console.log('PASS P2: category page 2 -> anime -> back preserves page 2');
  const row=page.getByRole('button',{name:/Audit Anime/});
  assert.equal(await row.locator('img').count(),1);
  assert.equal((await row.innerText()).includes('8.50'),true);
  console.log('PASS P2: category list consumes persisted poster/rating/genres');

  await page.goto(`${base}/conta`);
  await page.getByRole('button',{name:/Notícias salvas/}).click();
  await expect(page).toHaveURL(/\/salvos$/);
  await page.reload();
  await expect(page).toHaveURL(/\/salvos$/);
  console.log('PASS P2: saved news route remains stable after refresh');

  await page.goto(`${base}/buscar`);
  await page.getByPlaceholder('Buscar anime...').fill('Audit Anime');
  await page.getByRole('button',{name:/Audit Anime/}).click();
  await expect(page.getByRole('heading',{name:active.title,exact:true})).toBeVisible();
  await page.goBack();
  await expect(page.getByPlaceholder('Buscar anime...')).toHaveValue('Audit Anime');
  console.log('PASS P2: search -> anime -> back preserves the search term');
  failSearch=true;
  await page.getByPlaceholder('Buscar anime...').fill('Unavailable');
  await expect.poll(()=>searchFailures).toBe(2);
  await expect(page.locator('.neko-skeleton')).toHaveCount(0);
  assert.equal(await page.locator('.neko-error,[role=alert]').count()>0,true);
  assert.equal(await page.getByRole('button',{name:'Tentar novamente'}).count()>0,true);
  console.log('PASS P2: search API failure shows an actionable retry');

  await page.goto(`${base}/conta`);
  const syncButton=page.getByRole('button',{name:'Sincronizar e atualizar'});
  const syncBox=await syncButton.boundingBox();
  console.log(`MEASURED UX: profile sync button is ${Math.round(syncBox.width)} x ${Math.round(syncBox.height)} CSS pixels at 412px viewport`);
  failLogout=true;
  await page.getByRole('button',{name:'Sair da conta',exact:true}).click();
  await expect.poll(()=>Boolean(releaseLogout)).toBe(true);
  assert.equal(await page.evaluate(()=>Boolean(localStorage.getItem('nekoanimes.auth.session'))),false);
  await expect(page.getByRole('heading',{name:'Entrar',exact:true})).toBeVisible();
  console.log('PASS P1: logout clears the local session without waiting for the network');
  releaseLogout();
} finally {await browser.close();}
