PRAGMA foreign_keys = ON;

CREATE TABLE app_config (
  id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'streaming' CHECK (mode IN ('streaming', 'news')),
  payload TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE anime (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  title_english TEXT,
  title_romaji TEXT,
  title_native TEXT,
  synopsis TEXT,
  type TEXT NOT NULL DEFAULT 'tv',
  status TEXT NOT NULL DEFAULT 'unknown',
  year INTEGER,
  score_basis_points INTEGER,
  genres TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE anime_external_ids (
  id TEXT PRIMARY KEY NOT NULL,
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  UNIQUE(provider, external_id)
);

CREATE TABLE anime_seasons (
  id TEXT PRIMARY KEY NOT NULL,
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT,
  episodes_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(anime_id, number)
);

CREATE TABLE episodes (
  id TEXT PRIMARY KEY NOT NULL,
  season_id TEXT NOT NULL REFERENCES anime_seasons(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT,
  duration_seconds INTEGER,
  aired_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(season_id, number)
);

CREATE TABLE episode_sources (
  id TEXT PRIMARY KEY NOT NULL,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  mime_type TEXT,
  label TEXT,
  headers TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE news_sources (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  site_url TEXT NOT NULL UNIQUE,
  feed_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  allow_remote_images INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE news_articles (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT REFERENCES news_sources(id) ON DELETE SET NULL,
  external_id TEXT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  image_url TEXT,
  image_allowed INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, external_id)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_library (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'watchlist',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, anime_id)
);

CREATE TABLE user_episode_progress (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, episode_id)
);

CREATE TABLE user_saved_news (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, article_id)
);

CREATE INDEX anime_title_idx ON anime(title);
CREATE INDEX anime_seasons_anime_idx ON anime_seasons(anime_id);
CREATE INDEX episodes_season_idx ON episodes(season_id);
CREATE INDEX news_published_idx ON news_articles(published_at DESC);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX user_library_user_idx ON user_library(user_id, updated_at DESC);
CREATE INDEX user_progress_user_idx ON user_episode_progress(user_id, updated_at DESC);
CREATE INDEX user_saved_news_user_idx ON user_saved_news(user_id, created_at DESC);
