import { z } from 'zod';

export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_MODE: z.enum(['streaming', 'news']).default('streaming'),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),
  ADMIN_APP_URL: z.string().url().default('http://localhost:3001'),
  ADMIN_API_KEY: z.string().min(24),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url()
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(config: Record<string, unknown>) {
  return EnvironmentSchema.parse(config);
}
