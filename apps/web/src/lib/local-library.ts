import type { AnimeDetail } from './api';

export type LocalLibraryItem = {
  animeId: string;
  slug: string;
  title: string;
  year: number | null;
  type: string | null;
  genres: string[];
  scoreBasisPoints: number | null;
  imageUrl: string | null;
  releaseLabel: AnimeDetail['releaseLabel'];
  providerId?: string;
  reference?: string;
  workSlug?: string;
  status: 'watchlist';
  updatedAt: string;
};

const STORAGE_KEY = 'nekoanimes.local-library.v1';
const UPDATED_EVENT = 'neko-library-updated';

export function readLocalLibrary(): LocalLibraryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value.filter(isLocalLibraryItem).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function saveLocalLibraryItem(item: Omit<LocalLibraryItem, 'status' | 'updatedAt'>): LocalLibraryItem {
  const saved: LocalLibraryItem = { ...item, status: 'watchlist', updatedAt: new Date().toISOString() };
  const next = [saved, ...readLocalLibrary().filter((current) => !sameLibraryItem(current, saved))];
  writeLocalLibrary(next);
  return saved;
}

export function removeLocalLibraryItem(item: Pick<LocalLibraryItem, 'animeId' | 'providerId' | 'reference'>): void {
  writeLocalLibrary(readLocalLibrary().filter((current) => !sameLibraryItem(current, item)));
}

export function subscribeToLocalLibrary(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const refresh = () => listener();
  window.addEventListener(UPDATED_EVENT, refresh);
  window.addEventListener('storage', refresh);
  return () => {
    window.removeEventListener(UPDATED_EVENT, refresh);
    window.removeEventListener('storage', refresh);
  };
}

function sameLibraryItem(left: Pick<LocalLibraryItem, 'animeId' | 'providerId' | 'reference'>, right: Pick<LocalLibraryItem, 'animeId' | 'providerId' | 'reference'>): boolean {
  if (left.animeId === right.animeId) return true;
  return Boolean(left.providerId && right.providerId && left.reference && right.reference && left.providerId === right.providerId && left.reference === right.reference);
}

function writeLocalLibrary(items: LocalLibraryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // Storage may be unavailable in restricted WebViews or private browsing.
  }
}

function isLocalLibraryItem(value: unknown): value is LocalLibraryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LocalLibraryItem>;
  return typeof item.animeId === 'string'
    && typeof item.slug === 'string'
    && typeof item.title === 'string'
    && typeof item.updatedAt === 'string'
    && item.status === 'watchlist'
    && Array.isArray(item.genres);
}
