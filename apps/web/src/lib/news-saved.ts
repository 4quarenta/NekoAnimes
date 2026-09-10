const KEY = 'neko_news_saved_v1';

export function getSavedNews(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function isNewsSaved(slug: string): boolean {
  return getSavedNews().includes(slug);
}

export function toggleNewsSaved(slug: string): boolean {
  const current = new Set(getSavedNews());
  if (current.has(slug)) current.delete(slug);
  else current.add(slug);
  window.localStorage.setItem(KEY, JSON.stringify([...current]));
  window.dispatchEvent(new CustomEvent('neko:news-saved'));
  return current.has(slug);
}
