import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function PlaybackFeedback({ title, error, onClose, onRetry }: {title:string;error:string|null;onClose:()=>void;onRetry?:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  return createPortal(<dialog className="neko-playback-feedback" ref={dialog} onCancel={event => {event.preventDefault();onClose();}} aria-labelledby="playback-feedback-title">
    <h2 id="playback-feedback-title">{title}</h2>
    {error ? <p role="alert">{error}</p> : <div role="status"><span className="neko-player-spinner" aria-hidden="true" /><p>Preparando vídeo…</p></div>}
    <div className="neko-anime-actions">{error && onRetry ? <button className="neko-primary-button" onClick={onRetry}>Tentar novamente</button> : null}<button className="neko-secondary-button" onClick={onClose}>{error ? 'Fechar' : 'Cancelar'}</button></div>
  </dialog>,document.body);
}
