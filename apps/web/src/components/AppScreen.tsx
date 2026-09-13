import type { PropsWithChildren, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAniListMetadata } from '../lib/api';

export function AppScreen({ children }: PropsWithChildren) {
  return <main className="neko-screen">{children}</main>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <p className="neko-eyebrow">{children}</p>;
}

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="neko-header">
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  );
}

export function Section({ title, action, children }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return (
    <section className="neko-section">
      <div className="neko-section-title">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TextRow({
  title,
  meta,
  trailing,
  imageUrl,
  showImagePlaceholder,
  onClick
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  imageUrl?: string | null;
  showImagePlaceholder?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      {imageUrl ? <img className="neko-row-image" src={imageUrl} alt="" loading="lazy" /> : showImagePlaceholder ? <span className="neko-row-image neko-row-image-placeholder" aria-hidden="true">✦</span> : null}
      <span className="neko-row-copy">
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
      {trailing ? <span className="neko-row-trailing">{trailing}</span> : null}
    </>
  );

  return onClick ? (
    <button className="neko-row neko-row-button" type="button" onClick={onClick}>{content}</button>
  ) : (
    <div className="neko-row">{content}</div>
  );
}

export function AnimeListRow({
  title,
  meta,
  trailing = '›',
  imageUrl,
  postType,
  scoreBasisPoints,
  genres,
  onClick
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  imageUrl?: string | null;
  postType?: string | null;
  scoreBasisPoints?: number | null;
  genres?: string[];
  onClick?: () => void;
}) {
  const metadata = useQuery({
    queryKey: ['anime-list-poster', title],
    queryFn: () => fetchAniListMetadata(title),
    enabled: !imageUrl && Boolean(title.trim()),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: false
  });

  const details = metadata.data;
  const rowMeta = [
    meta,
    formatPostType(postType ?? details?.postType),
    formatScore(scoreBasisPoints ?? details?.scoreBasisPoints),
    formatGenres(genres ?? details?.genres)
  ].filter(Boolean).join(' · ');
  return <TextRow title={title} meta={rowMeta || undefined} trailing={trailing} imageUrl={imageUrl ?? details?.imageUrl} showImagePlaceholder onClick={onClick} />;
}

function formatPostType(value?: string | null) {
  if (!value) return null;
  if (value === 'filme' || value === 'movie' || value === 'MOVIE') return 'Tipo: Filme';
  if (value === 'manga' || value === 'MANGA') return 'Tipo: Mangá';
  return 'Tipo: Anime';
}

function formatScore(value?: number | null) {
  return typeof value === 'number' && value > 0 ? `★ ${(value / 100).toFixed(2)}` : null;
}

function formatGenres(value?: string[]) {
  return value?.length ? value.join(', ') : null;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="neko-empty">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
