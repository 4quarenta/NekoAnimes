export type LocalSavedNewsItem = {
  id: string;
  slug: string;
  title: string;
  category: string;
  sourceName: string;
  publishedAt: string;
  updatedAt: string;
};

const STORAGE_KEY = 'nekoanimes.local-saved-news.v1';
const UPDATED_EVENT = 'neko-saved-news-updated';

export function readLocalSavedNews(): LocalSavedNewsItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(isLocalSavedNewsItem).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) : [];
  } catch {
    return [];
  }
}

export function saveLocalNews(item: Omit<LocalSavedNewsItem, 'updatedAt'>): void {
  writeLocalSavedNews([{ ...item, updatedAt: new Date().toISOString() }, ...readLocalSavedNews().filter((saved) => saved.id !== item.id)]);
}

export function isLocalNewsSaved(id: string): boolean {
  return readLocalSavedNews().some((item) => item.id === id);
}

export function subscribeToLocalSavedNews(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const refresh = () => listener();
  window.addEventListener(UPDATED_EVENT, refresh);
  window.addEventListener('storage', refresh);
  return () => {
    window.removeEventListener(UPDATED_EVENT, refresh);
    window.removeEventListener('storage', refresh);
  };
}

function writeLocalSavedNews(items: LocalSavedNewsItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(UPDATED_EVENT));
  } catch {
    // Storage may be unavailable in restricted WebViews or private browsing.
  }
}

function isLocalSavedNewsItem(value: unknown): value is LocalSavedNewsItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LocalSavedNewsItem>;
  return typeof item.id === 'string' && typeof item.slug === 'string' && typeof item.title === 'string' && typeof item.updatedAt === 'string';
}
