import type { PropsWithChildren, ReactNode } from 'react';

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
  onClick
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
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

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="neko-empty">
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
