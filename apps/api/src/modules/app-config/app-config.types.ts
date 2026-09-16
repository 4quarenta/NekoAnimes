import { z } from 'zod';

export const AppConfigUpdateSchema = z.object({
  mode: z.union([z.literal(1), z.literal(2)])
}).strict();

export type AppConfigUpdate = z.infer<typeof AppConfigUpdateSchema>;

export type AppConfigState = AppConfigUpdate & {
  version: number;
  updatedAt: string;
};
