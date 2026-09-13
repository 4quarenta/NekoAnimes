export type LocalContinueWatching = {
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
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(item));
  } catch {
    // Local storage may be unavailable in restricted WebViews.
  }
}

export function recordLocalProgress(episodeId: string, positionSeconds: number, durationSeconds: number) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    const active = raw ? JSON.parse(raw) as Omit<LocalContinueWatching, 'positionSeconds' | 'durationSeconds' | 'completed' | 'updatedAt'> : null;
    if (!active || active.episodeId !== episodeId) return;
    const position = Math.max(0, Math.floor(positionSeconds));
    const duration = Math.max(0, Math.floor(durationSeconds));
    const item: LocalContinueWatching = {
      ...active,
      positionSeconds: position,
      durationSeconds: duration,
      completed: duration > 0 && position / duration >= 0.9,
      updatedAt: new Date().toISOString()
    };
    window.localStorage.setItem(CONTINUE_KEY, JSON.stringify(item));
    window.dispatchEvent(new Event('neko-progress-updated'));
  } catch {
    // Ignore malformed or unavailable local storage.
  }
}

export function readLocalContinueWatching(animeId: string): LocalContinueWatching | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONTINUE_KEY);
    const item = raw ? JSON.parse(raw) as LocalContinueWatching : null;
    return item?.animeId === animeId && !item.completed ? item : null;
  } catch {
    return null;
  }
}
