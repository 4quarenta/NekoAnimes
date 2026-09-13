import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base=process.env.NEKO_TEST_WEB_URL??'http://127.0.0.1:4173';
const server={id:'animesonlinecc',name:'Animes Online',baseUrl:'https://animesonlinecc.to',capabilities:{search:true,anime:true,episodes:true,playback:true}};
const identity={canonicalId:'test:work',canonicalTitle:'Contract Anime',malId:912345,anilistId:912345,postType:'anime',synopsis:'Contract synopsis',titleEnglish:null,titleRomaji:null,titleNative:null,year:2025,genres:['Action'],scoreBasisPoints:850,imageUrl:'https://example.com/poster.png',backdropUrl:null,source:'mapping'};
const episodes=Array.from({length:70},(_,i)=>({id:`test:ep:${i+1}`,number:i+1,seasonNumber:1,title:`Episódio ${i+1}`,reference:`/episodio/test-${i+1}/`,url:`https://animesonlinecc.to/episodio/test-${i+1}/`,available:true}));
const detail={server,anime:{reference:'/anime/test/',title:'Contract Anime',url:'https://animesonlinecc.to/anime/test/'},workSlug:'work-test',identity,postType:'anime',seasons:[{id:'s1',number:1,title:'Temporada 1',episodes}],fetchedAt:new Date().toISOString()};
const manifest=await (await fetch('https://nekoanimes-api-staging.john-alleff01.workers.dev/v1/app-manifest')).json();
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:412,height:820}});
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('nekoanimes.selected-server.v1','animesonlinecc');
    localStorage.setItem('nekoanimes.auth.session',JSON.stringify({access_token:'test-only',user:{id:'user-test',email:'test@example.invalid'},expires_in:3600,token_type:'bearer'}));
    window.testBridge=[];
    window.NekoNativeBridge={postMessage:message=>window.testBridge.push(JSON.parse(message))};
  });
  let pendingResolve,resolveCount=0,requestedSlug=false;
  await page.route('https://example.com/**',route=>route.fulfill({status:204}));
  await page.route('https://graphql.anilist.co/**',route=>route.fulfill({json:{data:{Page:{media:[]}}}}));
  await page.route('**/v1/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    let json={};
    if(path==='/v1/app-manifest')json=manifest;
    else if(path==='/v1/servers')json={servers:[server]};
    else if(path.endsWith('/categories'))json={items:[{id:'acao',name:'Ação',reference:'/genero/acao/'}]};
    else if(path.endsWith('/catalog'))json={server,items:[{serverId:server.id,serverName:server.name,reference:'/anime/test/',title:'Contract Anime',postType:'anime'}],hasNextPage:url.searchParams.get('page')!=='2'};
    else if(path.endsWith('/anime')){requestedSlug=url.searchParams.has('slug');json=detail;}
    else if(path.includes('/resolve/')){
      resolveCount++;
      if(resolveCount===1){pendingResolve=route;return;}
      json={server,anime:detail.anime,season:1,episode:episodes[69],sources:[{id:'sample',url:'https://example.com/legal-sample.mp4',label:'Amostra',kind:'direct',headers:{},isDefault:true}]};
    }
    else if(path==='/v1/me/library')json=[{animeId:'test:work',slug:'work-test',title:'Contract Anime',status:'watchlist',genres:['Action'],updatedAt:new Date().toISOString()}];
    else if(path==='/v1/me/continue-watching'||path==='/v1/me/saved-news')json=[];
    else if(path==='/v1/me')json={id:'user-test',email:'test@example.invalid'};
    await route.fulfill({json});
  });
  await page.goto(`${base}/lista`);
  await page.getByRole('button',{name:/Contract Anime/}).click();
  await expect(page.getByRole('heading',{name:'Contract Anime',exact:true})).toBeVisible();
  expect(requestedSlug).toBe(true);
  await page.getByRole('combobox',{name:'Ordem dos episódios'}).selectOption('desc');
  await expect(page.locator('.neko-episode-box').first()).toHaveText('70');
  await page.locator('.neko-episode-box').first().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();await expect(dialog.getByText('Preparando vídeo…')).toBeVisible();
  const box=await dialog.boundingBox();expect(box.y).toBeGreaterThan(0);expect(box.y+box.height).toBeLessThan(820);
  await page.screenshot({path:'test-results/player-loading.png'});
  await expect.poll(()=>Boolean(pendingResolve)).toBe(true);
  await pendingResolve.fulfill({status:503,json:{message:'Fonte temporariamente indisponível'}});
  await expect(dialog.getByRole('alert')).toHaveText('Fonte temporariamente indisponível');
  await page.screenshot({path:'test-results/player-error.png'});
  await dialog.getByRole('button',{name:'Tentar novamente'}).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.testBridge.filter(item=>item.type==='player.open').length)).toBe(1);
  console.log('PASS favorite -> selected provider; newest episodes; visible loading/error dialog; retry -> native bridge');
  await page.goto(`${base}/categorias`);
  await page.getByRole('button',{name:'Ação Ver títulos'}).click();
  await page.getByRole('button',{name:'Próxima ›'}).click();
  await expect(page.getByText('Página 2',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Próxima ›'})).toBeDisabled();
  await page.goto(`${base}/conta`);
  await expect(page.getByText('1 obras salvas',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sincronizar e atualizar'})).toBeVisible();
  await page.screenshot({path:'test-results/profile.png'});
  expect(pageErrors).toEqual([]);
  console.log('PASS provider categories + pagination; real profile counters/actions; zero browser errors');
} finally {await browser.close();}
