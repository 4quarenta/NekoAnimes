import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const newsSources = pgTable('news_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  siteUrl: text('site_url').notNull(),
  feedUrl: text('feed_url'),
  enabled: boolean('enabled').notNull().default(true),
  allowRemoteImages: boolean('allow_remote_images').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [uniqueIndex('news_sources_site_url_uq').on(table.siteUrl)]);

export const newsArticles = pgTable('news_articles', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').references(() => newsSources.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  category: text('category').notNull().default('geral'),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  imageUrl: text('image_url'),
  imageAllowed: boolean('image_allowed').notNull().default(false),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  uniqueIndex('news_articles_slug_uq').on(table.slug),
  uniqueIndex('news_articles_source_external_uq').on(table.sourceId, table.externalId)
]);
