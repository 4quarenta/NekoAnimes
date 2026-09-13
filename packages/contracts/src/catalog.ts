import { z } from 'zod';

export const ProviderSelectionSchema = z.object({
  serverId: z.enum(['goyabu', 'animesonlinecc', 'animesdigital']),
  reference: z.string().min(2).max(1000).regex(/^\/(?!\/)/),
  workSlug: z.string().min(1).max(1500).optional()
});
export const ProviderProgressSchema = ProviderSelectionSchema.extend({
  episodeReference: z.string().min(2).max(1000).regex(/^\/(?!\/)/),
  seasonNumber: z.number().int().min(1).max(100000),
  episodeNumber: z.number().int().min(1).max(100000),
  positionSeconds: z.number().finite().min(0).max(604800),
  durationSeconds: z.number().finite().min(0).max(604800)
}).refine(v => !v.durationSeconds || v.positionSeconds <= v.durationSeconds + 30, 'Progresso inválido');

// Preserve season numbers: "Mob Psycho 100" and "Mob Psycho 100 II" are not interchangeable.
export function normalizeAnimeTitle(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(dublado|legendado|online|todos os episodios)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
export function sameAnimeTitle(left: string, right: string) {
  return Boolean(normalizeAnimeTitle(left)) && normalizeAnimeTitle(left) === normalizeAnimeTitle(right);
}
