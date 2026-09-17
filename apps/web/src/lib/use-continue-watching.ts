import { useEffect, useState } from 'react';
import { readLocalProgressItems, type LocalContinueWatching } from './local-progress';

export type WatchingItem = LocalContinueWatching;

export function useContinueWatching() {
  const [items, setItems] = useState<WatchingItem[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readLocalProgressItems().filter((item) => !item.completed && item.positionSeconds > 0).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    refresh();
    window.addEventListener('neko-progress-updated', refresh);
    window.addEventListener('neko-progress-synced', refresh);
    return () => {
      window.removeEventListener('neko-progress-updated', refresh);
      window.removeEventListener('neko-progress-synced', refresh);
    };
  }, []);

  return { items, pending: items.some((item) => item.pendingSync) };
}
