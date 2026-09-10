import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { anime, episodes } from './catalog.schema';
import { newsArticles } from './news.schema';

export const userLibrary = pgTable('user_library', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  animeId: uuid('anime_id').notNull().references(() => anime.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('watchlist'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [uniqueIndex('user_library_user_anime_uq').on(table.userId, table.animeId)]);

export const userEpisodeProgress = pgTable('user_episode_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  episodeId: uuid('episode_id').notNull().references(() => episodes.id, { onDelete: 'cascade' }),
  positionSeconds: integer('position_seconds').notNull().default(0),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  completed: boolean('completed').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [uniqueIndex('user_progress_user_episode_uq').on(table.userId, table.episodeId)]);

export const userSavedNews = pgTable('user_saved_news', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  articleId: uuid('article_id').notNull().references(() => newsArticles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [uniqueIndex('user_saved_news_user_article_uq').on(table.userId, table.articleId)]);
