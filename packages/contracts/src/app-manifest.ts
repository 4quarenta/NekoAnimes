import { z } from 'zod';

export const AppModeSchema = z.union([z.literal(1), z.literal(2)]);

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
  })
});

export type AppManifest = z.infer<typeof AppManifestSchema>;
export type AppMode = z.infer<typeof AppModeSchema>;
export type NavigationItem = z.infer<typeof NavigationItemSchema>;
