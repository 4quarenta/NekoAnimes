import { currentUserId } from './auth';
import { saveEpisodeProgress, saveProviderProgress } from './api';
import { markProgressSynced, readLocalProgressItems } from './local-progress';

let running: Promise<void> | null = null;
let requested = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryAttempt = 0;
export function syncPendingProgress(): Promise<void> {
  requested = true;
  if (running) return running;
  clearTimeout(retryTimer);
  running = sync().finally(() => { running = null; });
  return running;
}
async function sync() {
  const failedRevisions = new Set<string>();
  let failed = false;
  let passes = 0;
  do {
    requested = false;
    const owner = currentUserId();
    if (owner === 'guest') break;
  for (const item of readLocalProgressItems().filter(item => item.pendingSync).reverse()) {
    if (currentUserId() !== owner) { requested = true; break; }
    const revision = `${owner}:${item.episodeId}:${item.revision ?? item.updatedAt}`;
    if (failedRevisions.has(revision)) continue;
    try {
      const saved = item.providerId && item.animeReference && item.episodeReference
        ? await saveProviderProgress({serverId:item.providerId,reference:item.animeReference,workSlug:item.workSlug,episodeReference:item.episodeReference,seasonNumber:item.seasonNumber,episodeNumber:item.episodeNumber,positionSeconds:item.positionSeconds,durationSeconds:item.durationSeconds})
        : (await saveEpisodeProgress(item.episodeId,item.positionSeconds,item.durationSeconds), {animeId:item.animeId,slug:item.slug});
      markProgressSynced(item,saved);
    } catch { failed = true; failedRevisions.add(revision); }
  }
  requested ||= readLocalProgressItems().some(item => item.pendingSync && !failedRevisions.has(`${currentUserId()}:${item.episodeId}:${item.revision ?? item.updatedAt}`));
  } while (requested && ++passes < 8);
  window.dispatchEvent(new Event('neko-progress-synced'));
  if (failed) window.dispatchEvent(new Event('neko-progress-sync-failed'));
  const pending = currentUserId() !== 'guest' && readLocalProgressItems().some(item => item.pendingSync);
  if (pending && retryAttempt < 3) {
    retryTimer = setTimeout(() => { void syncPendingProgress(); }, [2000,10000,30000][retryAttempt++]);
  } else if (!pending) retryAttempt = 0;
}
