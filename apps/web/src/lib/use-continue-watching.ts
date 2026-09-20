import { useEffect, useState } from 'react';
import { readLocalProgressItems, type LocalContinueWatching } from './local-progress';

export type WatchingItem = LocalContinueWatching;

export function useContinueWatching() {
  const [items, setItems] = useState<WatchingItem[]>([]);

  useEffect(() => {
    const refresh = () => setItems(readLocalProgressItems().filter((item) => !item.completed && item.positionSeconds > 0).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    refresh();
    window.addEventListener('neko-progress-updated', refresh);
    return () => {
      window.removeEventListener('neko-progress-updated', refresh);
    };
  }, []);

  return { items };
}
