-- The Worker uses the dedicated PostgreSQL owner connection through Hyperdrive.
-- Keep the public Supabase Data API closed; application authorization lives in the API.
ALTER TABLE "app_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anime" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anime_external_ids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "anime_seasons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "episodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "episode_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news_articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_library" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_episode_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_saved_news" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "app_config", "anime", "anime_external_ids", "anime_seasons", "episodes", "episode_sources", "news_sources", "news_articles", "user_library", "user_episode_progress", "user_saved_news" FROM anon, authenticated;
