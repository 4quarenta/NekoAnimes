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
  onClick
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  imageUrl?: string | null;
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

  return <TextRow title={title} meta={meta} trailing={trailing} imageUrl={imageUrl ?? metadata.data?.imageUrl} showImagePlaceholder onClick={onClick} />;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="neko-empty">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
