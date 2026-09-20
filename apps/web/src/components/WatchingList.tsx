import { useNavigate } from '@tanstack/react-router';
import { AnimeListRow } from './AppScreen';
import type { WatchingItem } from '../lib/use-continue-watching';

export function WatchingList({items}:{items:WatchingItem[]}) {
  const navigate = useNavigate();
  return <div className="neko-list">{items.map(item => {
    const percent = item.durationSeconds>0 ? Math.min(100,Math.round(item.positionSeconds/item.durationSeconds*100)) : 0;
    return <AnimeListRow key={item.animeId} title={item.title} releaseLabel={item.releaseLabel} meta={`T${item.seasonNumber} · Episódio ${String(item.episodeNumber).padStart(2,'0')} · ${Math.floor(item.positionSeconds/60)} min assistidos`} imageUrl={item.imageUrl} postType={item.type} scoreBasisPoints={item.scoreBasisPoints} genres={item.genres} trailing={`${percent}% ›`} onClick={() => void navigate({to:'/anime/$slug',params:{slug:item.workSlug??item.slug},search:{provider:!item.workSlug?item.providerId:undefined,ref:!item.workSlug?item.animeReference:undefined}})} />;
  })}</div>;
}
