import type { ServerAnimeMatch } from './api';

export function providerSlug(match: ServerAnimeMatch): string {
  const normalized = match.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return normalized || encodeURIComponent(match.reference.slice(1));
}
