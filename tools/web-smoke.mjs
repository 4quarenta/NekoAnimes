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
    localStorage.setItem('nekoanimes.local-library.v1',JSON.stringify([{animeId:'test:work',slug:'work-test',workSlug:'work-test',title:'Contract Anime',year:2025,type:'anime',genres:['Action'],scoreBasisPoints:850,imageUrl:null,releaseLabel:null,providerId:'animesonlinecc',reference:'/anime/test/',status:'watchlist',updatedAt:new Date().toISOString()}]));
    localStorage.setItem('nekoanimes.auth.session',JSON.stringify({access_token:'test-only',user:{id:'user-test',email:'test@example.invalid'},expires_in:3600,token_type:'bearer'}));
    window.testBridge=[];
    window.NekoNativeBridge={postMessage:message=>window.testBridge.push(JSON.parse(message))};
  });
  let pendingResolve,resolveCount=0,requestedSlug=false,requestedReference=false;
  let recoveryMode=false,linked=false,linkWrites=0,recoverySearches=0,linkFailure=false,searchFailure=false;
  const fallbackServer={...server,id:'goyabu',name:'Goyabu',baseUrl:'https://goyabu.io'};
  await page.route('https://example.com/**',route=>route.fulfill({status:204}));
  await page.route('https://graphql.anilist.co/**',route=>route.fulfill({json:{data:{Page:{media:[]}}}}));
  await page.route('**/v1/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    let json={};
    if(path==='/v1/app-manifest')json=manifest;
    else if(path==='/v1/servers')json={servers:[server]};
    else if(path.endsWith('/categories'))json={items:[{id:'acao',name:'Ação',reference:'/genero/acao/'}]};
    else if(path.endsWith('/catalog'))json={server,items:[{serverId:server.id,serverName:server.name,reference:'/anime/test/',title:'Contract Anime',postType:'anime'}],hasNextPage:url.searchParams.get('page')!=='2'};
    else if(path.endsWith('/recovery')) {
      recoverySearches++;
      json={work:{slug:'work-test',title:'Contract Anime',imageUrl:null,malId:912345,year:2025,postType:'anime'},server,
        available:[{serverId:'goyabu',serverName:'Goyabu',reference:'/anime/test/',title:'Contract Anime',imageUrl:null,postType:'anime',year:2025}],
        matches:searchFailure?[]:[{serverId:server.id,serverName:server.name,reference:'/anime/alias/',title:'Contract Anime Alternative',imageUrl:null,postType:'anime',year:2025}],searchFailed:searchFailure,availabilityFailed:false};
    }
    else if(path==='/v1/me/provider-links') {
      const body=route.request().postDataJSON();
      expect(body).toEqual({workSlug:'work-test',serverId:server.id,reference:'/anime/alias/',expectedTitle:'Contract Anime Alternative',confirmed:true});
      linkWrites++;
      if(linkFailure){await route.fulfill({status:409,json:{message:'Este item já está vinculado a outra obra.'}});return;}
      linked=true;
      json={...detail,anime:{...detail.anime,title:'Contract Anime Alternative',reference:'/anime/alias/'}};
    }
    else if(path.endsWith('/anime')) {
      requestedSlug=url.searchParams.has('slug');
      requestedReference=url.searchParams.get('ref')==='/anime/test/';
      if(recoveryMode&&requestedSlug&&!linked&&path.includes('animesonlinecc')){await route.fulfill({status:404,json:{message:'Obra não encontrada neste servidor'}});return;}
      json=path.includes('goyabu')?{...detail,server:fallbackServer}:url.searchParams.get('ref')==='/anime/alias/'?{...detail,identity:{...identity,canonicalId:'candidate:work',canonicalTitle:'Contract Anime Alternative'},anime:{...detail.anime,title:'Contract Anime Alternative',reference:'/anime/alias/'}}:detail;
    }
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
  expect(requestedReference).toBe(true);
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
  await expect(page.getByText('1 obra salva',{exact:true})).toBeVisible();
  await expect(page.getByText(/Não é necessário criar uma conta/)).toBeVisible();
  await page.goto(`${base}/continuar`);
  await expect(page.getByRole('heading',{name:'Continuar assistindo',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Abrir minha lista/})).toBeVisible();
  await page.getByRole('button',{name:/Abrir minha lista/}).click();
  await expect(page).toHaveURL(/\/lista$/);
  await expect(page.locator('h1',{hasText:'Minha lista'})).toBeVisible();
  console.log('PASS separate Continue watching and My list routes');
  await page.screenshot({path:'test-results/profile.png'});
  expect(pageErrors).toEqual([]);
  console.log('PASS provider categories + pagination; real profile counters/actions; zero browser errors');

  recoveryMode=true;
  await page.goto(`${base}/anime/work-test`);
  await expect(page.getByRole('heading',{name:'Vamos encontrar sua obra'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Contract Anime Alternative/})).toBeVisible();
  expect(recoverySearches).toBeGreaterThan(0);
  expect(linkWrites).toBe(0);
  await expect(page.getByRole('button',{name:'Pesquisar neste servidor'})).toHaveCount(0);
  await page.screenshot({path:'test-results/provider-recovery.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:/Contract Anime Alternative/}).click();
  const comparison=page.getByRole('dialog',{name:'É o mesmo item?'});
  await expect(comparison).toBeVisible();
  await expect(comparison.getByRole('button',{name:'Sim, vincular e abrir'})).toBeEnabled();
  await page.screenshot({path:'test-results/provider-comparison.png'});
  await comparison.getByRole('button',{name:'Não, abrir separadamente'}).click();
  await expect(page).toHaveURL(/ref=%2Fanime%2Falias%2F/);
  expect(linkWrites).toBe(0);
  await page.goto(`${base}/anime/work-test`);
  await page.getByRole('button',{name:/BR1.*Trocar servidor/}).click();
  await expect(page).toHaveURL(/provider=goyabu/);
  expect(await page.evaluate(()=>localStorage.getItem('nekoanimes.selected-server.v1'))).toBe('goyabu');
  await expect(page.getByRole('heading',{name:'Contract Anime',exact:true})).toBeVisible();
  console.log('PASS automatic recovery; no implicit linking; comparison refusal; exact available-server switch');

  await page.goto(`${base}/anime/work-test`);
  await page.getByRole('button',{name:/Contract Anime Alternative/}).click();
  linkFailure=true;
  await comparison.getByRole('button',{name:'Sim, vincular e abrir'}).click();
  await expect(comparison.getByRole('alert')).toContainText('já está vinculado');
  await expect(comparison).toBeVisible();
  linkFailure=false;
  await comparison.getByRole('button',{name:'Sim, vincular e abrir'}).click();
  await expect(comparison).not.toBeVisible();
  await expect(page.getByRole('heading',{name:'Contract Anime',exact:true})).toBeVisible();
  expect(linkWrites).toBe(2);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Contract Anime',exact:true})).toBeVisible();
  console.log('PASS conflict stays visible; explicit confirmation; canonical identity after reopening');

  linked=false;searchFailure=true;
  await page.goto(`${base}/anime/work-test`);
  await expect(page.getByText('O servidor não respondeu à busca. Isso não significa que a obra não existe nele.')).toBeVisible();
  await page.setViewportSize({width:320,height:640});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  console.log('PASS unavailable-search explanation; 320px layout; zero browser errors');
} finally {await browser.close();}
