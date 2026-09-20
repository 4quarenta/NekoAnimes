import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { NekoNative } from '@neko/bridge-web';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { providerImageProxyUrl } from '../lib/api';
import { releaseLabelForTitle } from '@neko/contracts';

export function AppScreen({ children }: PropsWithChildren) {
  const navigate=useNavigate();
  const [open,setOpen]=useState(false);
  const navigation = NekoNative.isAvailable()
    ? ([['/','Início'],['/buscar','Buscar'],['/categorias','Categorias'],['/continuar','Continuar assistindo'],['/lista','Minha lista'],['/servidores','Servidores'],['/conta','Conta'],['/reportar','Relatar problema'],['/privacidade','Política de Privacidade']] as const)
    : ([['/app','Sobre o aplicativo'],['/reportar','Contato'],['/privacidade','Política de Privacidade']] as const);
  return <main className="neko-screen"><div className="neko-topbar"><div className="neko-brand"><img src="/brand/nekoanimes-logo.png" alt="NekoAnimes" /></div><button className="neko-menu-launcher" aria-label="Abrir menu lateral" aria-expanded={open} onClick={()=>{if(NekoNative.isAvailable())NekoNative.appEvent('menu_open');else setOpen(value=>!value);}}>☰</button></div>
    {open?<nav className="neko-web-shortcuts" aria-label="Navegação">{navigation.map(([to,label])=><button key={to} onClick={()=>{setOpen(false);void navigate({to});}}>{label}</button>)}</nav>:null}{children}</main>;
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

export function LoadingState({ label = 'Carregando…', description = 'Buscando as informações mais recentes.' }: { label?: string; description?: string }) {
  return <div className="neko-loading-state" role="status" aria-live="polite"><span className="neko-spinner" aria-hidden="true" /><strong>{label}</strong><small>{description}</small></div>;
}

export function TextRow({
  title,
  meta,
  trailing,
  imageUrl,
  showImagePlaceholder,
  releaseLabel,
  onClick
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  imageUrl?: string | null;
  showImagePlaceholder?: boolean;
  releaseLabel?: string | null;
  onClick?: () => void;
}) {
  const content = (
    <>
      {imageUrl ? <PosterImage className="neko-row-image" src={imageUrl} alt={`Capa de ${title}`} /> : showImagePlaceholder ? <span className="neko-row-image neko-row-image-placeholder" aria-hidden="true">✦</span> : null}
      <span className="neko-row-copy">
        <span className="neko-row-title-line"><strong>{title}</strong>{releaseLabel ? <span className="neko-release-badge">{releaseLabel}</span> : null}</span>
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

export function PosterImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [attempt, setAttempt] = useState(0);
  const proxyUrl = providerImageProxyUrl(src);

  useEffect(() => setAttempt(0), [src]);

  const imageUrl = attempt === 0 ? src : attempt === 1 ? proxyUrl : null;
  if (!imageUrl) return <span className={`${className} neko-row-image-placeholder`} aria-label={alt}>✦</span>;

  return <img className={className} src={imageUrl} alt={alt} loading="eager" referrerPolicy="no-referrer" onError={() => setAttempt(value => Math.min(value + 1, 2))} />;
}

export function AnimeListRow({
  title,
  meta,
  trailing = '›',
  imageUrl,
  postType,
  scoreBasisPoints,
  genres,
  releaseLabel,
  onClick
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  imageUrl?: string | null;
  postType?: string | null;
  scoreBasisPoints?: number | null;
  genres?: string[];
  releaseLabel?: string | null;
  onClick?: () => void;
}) {
  const rowMeta = [
    meta,
    formatPostType(postType),
    formatScore(scoreBasisPoints),
    formatGenres(genres)
  ].filter(Boolean).join(' · ');
  return <TextRow title={title} meta={rowMeta || undefined} trailing={trailing} imageUrl={imageUrl} showImagePlaceholder releaseLabel={releaseLabel ?? releaseLabelForTitle(title)} onClick={onClick} />;
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
