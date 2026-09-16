import { z } from 'zod';

export const AdConfigSchema = z.object({
  enabled: z.boolean(),
  engine: z.enum(['max', 'admob', 'levelplay']),
  banner: z.object({
    enabled: z.boolean()
  }),
  appOpen: z.object({
    enabled: z.boolean(),
    minIntervalMinutes: z.number().int().min(0).max(1440),
    skipFirstOpens: z.number().int().min(0).max(20)
  }),
  interstitial: z.object({
    enabled: z.boolean(),
    minIntervalMinutes: z.number().int().min(0).max(1440),
    maxPerSession: z.number().int().min(0).max(20),
    pageTransitionFrequency: z.number().int().min(0).max(20).default(3),
    showOnEpisodeStart: z.boolean().default(true)
  })
});

export const AppConfigUpdateSchema = z.object({
  mode: z.union([z.literal(1), z.literal(2)]),
  ads: AdConfigSchema
}).strict();

export type AdConfig = z.infer<typeof AdConfigSchema>;
export type AppConfigUpdate = z.infer<typeof AppConfigUpdateSchema>;

export type AppConfigState = AppConfigUpdate & {
  version: number;
  updatedAt: string;
};

export const DEFAULT_AD_CONFIG: AdConfig = {
  enabled: false,
  engine: 'max',
  banner: { enabled: false },
  appOpen: {
    enabled: false,
    minIntervalMinutes: 60,
    skipFirstOpens: 2
  },
  interstitial: {
    enabled: false,
    minIntervalMinutes: 15,
    maxPerSession: 3,
    pageTransitionFrequency: 3,
    showOnEpisodeStart: true
  }
};
