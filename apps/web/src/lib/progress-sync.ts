import { currentUserId } from './auth';
import { saveEpisodeProgress, saveProviderProgress } from './api';
import { markProgressSynced, readLocalProgressItems } from './local-progress';

let running: Promise<void> | null = null;
export function syncPendingProgress(): Promise<void> {
  if (running) return running;
  running = sync().finally(() => { running = null; });
  return running;
}
async function sync() {
  const owner = currentUserId();
  if (owner === 'guest') return;
  let failed = false;
  for (const item of readLocalProgressItems().filter(item => item.pendingSync)) {
    if (currentUserId() !== owner) return;
    try {
      const saved = item.providerId && item.animeReference && item.episodeReference
        ? await saveProviderProgress({serverId:item.providerId,reference:item.animeReference,workSlug:item.workSlug,episodeReference:item.episodeReference,seasonNumber:item.seasonNumber,episodeNumber:item.episodeNumber,positionSeconds:item.positionSeconds,durationSeconds:item.durationSeconds})
        : (await saveEpisodeProgress(item.episodeId,item.positionSeconds,item.durationSeconds), {animeId:item.animeId,slug:item.slug});
      markProgressSynced(item,saved);
    } catch { failed = true; }
  }
  window.dispatchEvent(new Event('neko-progress-synced'));
  if (failed) window.dispatchEvent(new Event('neko-progress-sync-failed'));
}
