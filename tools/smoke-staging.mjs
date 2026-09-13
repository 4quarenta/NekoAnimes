import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const api='https://nekoanimes-api-staging.john-alleff01.workers.dev';
const email=`neko.smoke.${Date.now()}@example.invalid`;
let token,userId;
async function request(path,body,method=body?'PUT':'GET') {
  const response=await fetch(api+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  assert.equal(response.ok,true,`${path}: ${response.status} ${data.message??''}`);
  return data;
}
try {
  for(const path of ['/health','/health/ready','/v1/app-manifest','/v1/news','/v1/app-update/android']) {await request(path);console.log(`PASS ${path}`);}
  const registration=await request('/v1/auth/register',{email,password:randomUUID()+randomUUID()},'POST');
  token=registration.session.access_token;userId=registration.session.user.id;
  const detail=await request('/v1/servers/animesonlinecc/anime?ref=/anime/mob-psycho-100/');
  const saved=await request('/v1/me/provider-library',{serverId:'animesonlinecc',reference:detail.anime.reference});
  const target=await request(`/v1/servers/animesdigital/anime?slug=${encodeURIComponent(saved.slug)}`);
  assert.equal(target.identity.canonicalId,saved.animeId);
  assert.equal(target.server.id,'animesdigital');
  assert.ok(target.seasons.some(season=>season.episodes.length));
  console.log('PASS favorite: Animes Online -> Animes Digital, canonical identity and provider episodes');
  const season=target.seasons.find(season=>season.episodes.length),episode=season.episodes[0];
  await request('/v1/me/provider-progress',{serverId:'animesdigital',reference:target.anime.reference,workSlug:saved.slug,episodeReference:episode.reference,seasonNumber:season.number,episodeNumber:episode.number,positionSeconds:120,durationSeconds:1200});
  const progress=await request('/v1/me/continue-watching');
  assert.equal(progress[0].animeId,saved.animeId);assert.equal(progress[0].positionSeconds,120);
  assert.equal((await request('/v1/me/library')).length,1);
  console.log('PASS authenticated profile/library/progress on public staging');
  await request('/v1/me');await request('/v1/me/saved-news');
} finally {
  if(userId) {
    assert.match(userId,/^[0-9a-f-]{36}$/);assert.match(email,/^neko\.smoke\.\d+@example\.invalid$/);
    // Remove only the temporary smoke-test user; FK cascades remove its session/list/progress.
    const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','nekoanimes-staging-db','--config','apps/api-worker/wrangler.jsonc','--remote','--command',`DELETE FROM users WHERE id='${userId}' AND email='${email}'`],{encoding:'utf8'});
    if(result.status!==0){console.error(`Cleanup required for test user ${userId} (${email})`);process.exitCode=1;}
    else console.log('PASS temporary smoke-test account removed');
  }
}
