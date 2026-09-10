import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { anime, animeSeasons, episodes, newsArticles, userEpisodeProgress, userLibrary, userSavedNews } from '../../database/schema';

@Injectable()
export class UserDataService {
  constructor(private readonly database: DatabaseService) {}

  async library(userId: string) {
    return this.database.db
      .select({
        animeId: anime.id,
        slug: anime.slug,
        title: anime.title,
        year: anime.year,
        genres: anime.genres,
        status: userLibrary.status,
        updatedAt: userLibrary.updatedAt
      })
      .from(userLibrary)
      .innerJoin(anime, eq(userLibrary.animeId, anime.id))
      .where(eq(userLibrary.userId, userId))
      .orderBy(desc(userLibrary.updatedAt));
  }

  async setLibrary(userId: string, animeId: string, status: string) {
    const [exists] = await this.database.db.select({ id: anime.id }).from(anime).where(eq(anime.id, animeId)).limit(1);
    if (!exists) throw new NotFoundException('Anime não encontrado');
    const [row] = await this.database.db.insert(userLibrary).values({ userId, animeId, status, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [userLibrary.userId, userLibrary.animeId], set: { status, updatedAt: new Date() } })
      .returning();
    return row;
  }

  async removeLibrary(userId: string, animeId: string) {
    await this.database.db.delete(userLibrary).where(and(eq(userLibrary.userId, userId), eq(userLibrary.animeId, animeId)));
    return { ok: true };
  }

  async continueWatching(userId: string) {
    const rows = await this.database.db
      .select({
        animeId: anime.id,
        slug: anime.slug,
        title: anime.title,
        seasonNumber: animeSeasons.number,
        episodeId: episodes.id,
        episodeNumber: episodes.number,
        episodeTitle: episodes.title,
        positionSeconds: userEpisodeProgress.positionSeconds,
        durationSeconds: userEpisodeProgress.durationSeconds,
        completed: userEpisodeProgress.completed,
        updatedAt: userEpisodeProgress.updatedAt
      })
      .from(userEpisodeProgress)
      .innerJoin(episodes, eq(userEpisodeProgress.episodeId, episodes.id))
      .innerJoin(animeSeasons, eq(episodes.seasonId, animeSeasons.id))
      .innerJoin(anime, eq(animeSeasons.animeId, anime.id))
      .where(and(eq(userEpisodeProgress.userId, userId), eq(userEpisodeProgress.completed, false)))
      .orderBy(desc(userEpisodeProgress.updatedAt))
      .limit(20);
    return rows;
  }

  async setProgress(userId: string, episodeId: string, positionSeconds: number, durationSeconds: number) {
    const safePosition = Math.max(0, Math.floor(positionSeconds));
    const safeDuration = Math.max(0, Math.floor(durationSeconds));
    const completed = safeDuration > 0 && safePosition / safeDuration >= 0.9;
    const [exists] = await this.database.db.select({ id: episodes.id }).from(episodes).where(eq(episodes.id, episodeId)).limit(1);
    if (!exists) throw new NotFoundException('Episódio não encontrado');
    const [row] = await this.database.db.insert(userEpisodeProgress)
      .values({ userId, episodeId, positionSeconds: safePosition, durationSeconds: safeDuration, completed, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [userEpisodeProgress.userId, userEpisodeProgress.episodeId],
        set: { positionSeconds: safePosition, durationSeconds: safeDuration, completed, updatedAt: new Date() }
      })
      .returning();
    return row;
  }

  async savedNews(userId: string) {
    return this.database.db
      .select({ id: newsArticles.id, slug: newsArticles.slug, title: newsArticles.title, category: newsArticles.category, sourceName: newsArticles.sourceName, publishedAt: newsArticles.publishedAt })
      .from(userSavedNews)
      .innerJoin(newsArticles, eq(userSavedNews.articleId, newsArticles.id))
      .where(eq(userSavedNews.userId, userId))
      .orderBy(desc(userSavedNews.createdAt));
  }

  async saveNews(userId: string, articleId: string) {
    const [article] = await this.database.db.select({ id: newsArticles.id }).from(newsArticles).where(eq(newsArticles.id, articleId)).limit(1);
    if (!article) throw new NotFoundException('Notícia não encontrada');
    await this.database.db.insert(userSavedNews).values({ userId, articleId }).onConflictDoNothing();
    return { ok: true };
  }

  async removeSavedNews(userId: string, articleId: string) {
    await this.database.db.delete(userSavedNews).where(and(eq(userSavedNews.userId, userId), eq(userSavedNews.articleId, articleId)));
    return { ok: true };
  }
}
