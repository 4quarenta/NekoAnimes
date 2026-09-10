import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const anime = pgTable('anime', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  titleEnglish: text('title_english'),
  titleRomaji: text('title_romaji'),
  titleNative: text('title_native'),
  synopsis: text('synopsis'),
  type: text('type').notNull().default('tv'),
  status: text('status').notNull().default('unknown'),
  year: integer('year'),
  scoreBasisPoints: integer('score_basis_points'),
  genres: jsonb('genres').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [uniqueIndex('anime_slug_uq').on(table.slug)]);

export const animeExternalIds = pgTable('anime_external_ids', {
  id: uuid('id').defaultRandom().primaryKey(),
  animeId: uuid('anime_id').notNull().references(() => anime.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalId: text('external_id').notNull()
}, (table) => [uniqueIndex('anime_provider_external_uq').on(table.provider, table.externalId)]);

export const animeSeasons = pgTable('anime_seasons', {
  id: uuid('id').defaultRandom().primaryKey(),
  animeId: uuid('anime_id').notNull().references(() => anime.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title'),
  episodesCount: integer('episodes_count').notNull().default(0)
}, (table) => [uniqueIndex('anime_season_number_uq').on(table.animeId, table.number)]);

export const episodes = pgTable('episodes', {
  id: uuid('id').defaultRandom().primaryKey(),
  seasonId: uuid('season_id').notNull().references(() => animeSeasons.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title'),
  durationSeconds: integer('duration_seconds'),
  airedAt: timestamp('aired_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [uniqueIndex('season_episode_number_uq').on(table.seasonId, table.number)]);

export const episodeSources = pgTable('episode_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  episodeId: uuid('episode_id').notNull().references(() => episodes.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  mimeType: text('mime_type'),
  label: text('label'),
  headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
