CREATE TYPE "public"."app_mode" AS ENUM('streaming', 'news');--> statement-breakpoint
CREATE TABLE "app_config" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mode" "app_mode" DEFAULT 'streaming' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"title_english" text,
	"title_romaji" text,
	"title_native" text,
	"synopsis" text,
	"type" text DEFAULT 'tv' NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"year" integer,
	"score_basis_points" integer,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anime_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anime_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text,
	"episodes_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"label" text,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text,
	"duration_seconds" integer,
	"aired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"external_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"category" text DEFAULT 'geral' NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"image_url" text,
	"image_allowed" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"site_url" text NOT NULL,
	"feed_url" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"allow_remote_images" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_episode_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"anime_id" uuid NOT NULL,
	"status" text DEFAULT 'watchlist' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_saved_news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anime_external_ids" ADD CONSTRAINT "anime_external_ids_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_seasons" ADD CONSTRAINT "anime_seasons_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_sources" ADD CONSTRAINT "episode_sources_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_anime_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."anime_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_source_id_news_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."news_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_episode_progress" ADD CONSTRAINT "user_episode_progress_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_library" ADD CONSTRAINT "user_library_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_news" ADD CONSTRAINT "user_saved_news_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anime_slug_uq" ON "anime" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "anime_provider_external_uq" ON "anime_external_ids" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "anime_season_number_uq" ON "anime_seasons" USING btree ("anime_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "season_episode_number_uq" ON "episodes" USING btree ("season_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_slug_uq" ON "news_articles" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_source_external_uq" ON "news_articles" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "news_sources_site_url_uq" ON "news_sources" USING btree ("site_url");--> statement-breakpoint
CREATE UNIQUE INDEX "user_progress_user_episode_uq" ON "user_episode_progress" USING btree ("user_id","episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_library_user_anime_uq" ON "user_library" USING btree ("user_id","anime_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_saved_news_user_article_uq" ON "user_saved_news" USING btree ("user_id","article_id");