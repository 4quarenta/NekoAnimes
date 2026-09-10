import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { fetchNewsArticle, saveNewsForUser } from '../lib/api';
import { AppScreen, Eyebrow } from '../components/AppScreen';

export function NewsArticlePage() {
  const { slug } = useParams({ from: '/noticias/$slug' });
  const navigate = useNavigate();
  const article = useQuery({ queryKey: ['news-article', slug], queryFn: () => fetchNewsArticle(slug) });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (article.isPending) return <AppScreen><div className="neko-skeleton" /><div className="neko-skeleton short" /></AppScreen>;
  if (article.isError) return <AppScreen><p className="neko-error">Não foi possível abrir esta notícia.</p></AppScreen>;

  const item = article.data;

  async function save() {
    if (saved || saving) return;
    setSaving(true);
    try {
      await saveNewsForUser(item.id);
      setSaved(true);
    } catch (error) {
      if (error instanceof Error && error.message === 'AUTH_REQUIRED') void navigate({ to: '/conta' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen>
      <Eyebrow>{item.category} · {item.sourceName}</Eyebrow>
      <article className="neko-article">
        <h1>{item.title}</h1>
        <p className="neko-article-date">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.publishedAt))}</p>
        {item.imageUrl ? <img className="neko-article-image" src={item.imageUrl} alt="" loading="lazy" /> : null}
        {item.summary ? <p className="neko-article-summary">{item.summary}</p> : null}
        <div className="neko-article-actions">
          <button type="button" disabled={saving || saved} onClick={() => void save()}>{saving ? 'Salvando...' : saved ? '✓ Salva' : 'Salvar na conta'}</button>
          <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">Abrir fonte original ↗</a>
        </div>
        <p className="neko-source-note">A notícia é apresentada em formato resumido. O conteúdo completo permanece na fonte original.</p>
      </article>
    </AppScreen>
  );
}
