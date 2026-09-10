import { integer, jsonb, pgEnum, pgTable, smallint, timestamp } from 'drizzle-orm/pg-core';

export const appModeEnum = pgEnum('app_mode', ['streaming', 'news']);

export const appConfig = pgTable('app_config', {
  id: smallint('id').primaryKey().default(1),
  version: integer('version').notNull().default(1),
  mode: appModeEnum('mode').notNull().default('streaming'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type AppConfigRow = typeof appConfig.$inferSelect;
export type NewAppConfigRow = typeof appConfig.$inferInsert;
