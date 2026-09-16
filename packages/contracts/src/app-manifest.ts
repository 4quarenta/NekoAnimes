import { z } from 'zod';

export const AppModeSchema = z.enum(['streaming', 'news']);

export const NavigationIconSchema = z.enum([
  'home',
  'catalog',
  'search',
  'library',
  'news',
  'bookmark',
  'profile',
  'category',
  'server'
]);

export const NavigationItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: NavigationIconSchema,
  route: z.string().startsWith('/')
});

export const AdFormatSettingsSchema = z.object({
  enabled: z.boolean()
});

export const AppManifestSchema = z.object({
  schemaVersion: z.literal(1),
  configVersion: z.number().int().positive(),
  mode: AppModeSchema,
  webAppUrl: z.string().url(),
  navigation: z.array(NavigationItemSchema).min(1).max(8),
  features: z.object({
    player: z.boolean(),
    downloads: z.boolean(),
    notifications: z.boolean(),
    news: z.boolean()
  }),
  ads: z.object({
    enabled: z.boolean(),
    engine: z.enum(['max', 'admob', 'levelplay']).default('max'),
    banner: AdFormatSettingsSchema,
    appOpen: AdFormatSettingsSchema.extend({
      minIntervalMinutes: z.number().int().nonnegative(),
      skipFirstOpens: z.number().int().nonnegative()
    }),
    interstitial: AdFormatSettingsSchema.extend({
      minIntervalMinutes: z.number().int().nonnegative(),
      maxPerSession: z.number().int().nonnegative(),
      pageTransitionFrequency: z.number().int().nonnegative().default(3),
      showOnEpisodeStart: z.boolean().default(true)
    })
  })
});

export type AppManifest = z.infer<typeof AppManifestSchema>;
export type AppMode = z.infer<typeof AppModeSchema>;
export type NavigationItem = z.infer<typeof NavigationItemSchema>;
