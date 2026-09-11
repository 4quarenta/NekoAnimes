import { z } from 'zod';

export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_MODE: z.enum(['streaming', 'news']).default('streaming'),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_APP_URL: z.string().url().default('http://localhost:3001'),
  ADMIN_API_KEY: z.string().min(24),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MAL_CLIENT_ID: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  ANDROID_LATEST_VERSION_CODE: z.coerce.number().int().min(1).optional(),
  ANDROID_LATEST_VERSION_NAME: z.string().min(1).max(32).optional(),
  ANDROID_APK_URL: z.string().url().optional(),
  ANDROID_APK_SHA256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  ANDROID_UPDATE_REQUIRED: z.enum(['true', 'false']).transform((value) => value === 'true').optional()
});

export type Environment = z.infer<typeof EnvironmentSchema>;
export function validateEnvironment(config: Record<string, unknown>) { return EnvironmentSchema.parse(config); }
