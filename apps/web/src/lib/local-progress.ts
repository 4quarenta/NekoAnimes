import { currentUserId } from './auth';
export type LocalContinueWatching = {
  userId?: string;
  workSlug?: string;
  pendingSync?: boolean;
  revision?: string;
  animeId: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  seasonNumber: number;
  episodeId: string;
  episodeNumber: number;
  episodeTitle: string | null;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  providerId?: string;
  animeReference?: string;
  episodeReference?: string;
  updatedAt: string;
};

const ACTIVE_KEY = 'nekoanimes.active-playback.v1';
const CONTINUE_KEY = 'nekoanimes.continue-watching.v1';

export function rememberActivePlayback(item: Omit<LocalContinueWatching, 'positionSeconds' | 'durationSeconds' | 'completed' | 'updatedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...item, userId: currentUserId() }));
  } catch {
    // Local storage may be unavailable in restricted WebViews.
  }
}

export function recordLocalProgress(episodeId: string, positionSeconds: number, durationSeconds: number, playbackReady = true) {
  if (typeof window === 'undefined') return;
  if (!playbackReady || !Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || positionSeconds <= 0) return;
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    const active = raw ? JSON.parse(raw) as Omit<LocalContinueWatching, 'positionSeconds' | 'durationSeconds' | 'completed' | 'updatedAt'> : null;
    if (!active || active.episodeId !== episodeId || active.userId !== currentUserId()) return;
    const position = Math.min(Math.floor(durationSeconds), Math.max(0, Math.floor(positionSeconds)));
    const duration = Math.max(0, Math.floor(durationSeconds));
    const item: LocalContinueWatching = {
      ...active,
      pendingSync: true,
      revision: crypto.randomUUID(),
      positionSeconds: position,
      durationSeconds: duration,
      completed: duration > 0 && position / duration >= 0.9,
      updatedAt: new Date().toISOString()
    };
    // Retain pending episodes when viewing another episode offline.
    const items = readLocalProgressItems().filter(value => !(value.animeId === item.animeId && value.seasonNumber === item.seasonNumber && value.episodeNumber === item.episodeNumber));
    const next = [item, ...items];
    writeLocalProgressItems([...next.filter(value => value.pendingSync), ...next.filter(value => !value.pendingSync).slice(0,50)].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)));
    window.dispatchEvent(new Event('neko-progress-updated'));
    return item;
  } catch {
    // Ignore malformed or unavailable local storage.
  }
}

export function readLocalContinueWatching(animeId: string): LocalContinueWatching | null {
  if (typeof window === 'undefined') return null;
  try {
    const item = readLocalProgressItems().find(value => value.animeId === animeId);
    return item?.animeId === animeId && !item.completed ? item : null;
  } catch {
    return null;
  }
}

export function readLocalProgressItems(): LocalContinueWatching[] {
  try {
    const value = JSON.parse(localStorage.getItem(`${CONTINUE_KEY}:${currentUserId()}`) ?? '[]');
    return Array.isArray(value) ? value.filter(item => item.userId === currentUserId() && typeof item.animeId === 'string') : [];
  } catch { return []; }
}
function writeLocalProgressItems(items: LocalContinueWatching[]) { localStorage.setItem(`${CONTINUE_KEY}:${currentUserId()}`,JSON.stringify(items)); }
export function markProgressSynced(item: LocalContinueWatching, saved: {animeId:string;slug:string}) {
  if (item.userId !== currentUserId()) return;
  writeLocalProgressItems(readLocalProgressItems().map(value => value.animeId === item.animeId ? {...value, animeId:saved.animeId, slug:saved.slug, workSlug:saved.slug, pendingSync: value.episodeId === item.episodeId && (item.revision ? value.revision === item.revision : value.updatedAt === item.updatedAt) ? false : value.pendingSync} : value));
}
