import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { anime, animeExternalIds, animeSeasons, episodes, episodeSources } from '../../database/schema';

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

  async list(input: { letter?: string; query?: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const conditions = [];
    if (input.letter?.match(/^[A-Z]$/i)) conditions.push(ilike(anime.title, `${input.letter}%`));
    if (input.query?.trim()) {
      const q = `%${input.query.trim()}%`;
      conditions.push(or(ilike(anime.title, q), ilike(anime.titleEnglish, q), ilike(anime.titleRomaji, q))!);
    }

    const rows = await this.database.db
      .select({
        id: anime.id,
        slug: anime.slug,
        title: anime.title,
        year: anime.year,
        type: anime.type,
        status: anime.status,
        genres: anime.genres,
        scoreBasisPoints: anime.scoreBasisPoints
      })
      .from(anime)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(anime.title))
      .limit(limit);

    return { items: rows, count: rows.length };
  }

  async detail(slug: string) {
    const [item] = await this.database.db.select().from(anime).where(eq(anime.slug, slug)).limit(1);
    if (!item) throw new NotFoundException('Anime não encontrado');

    const [externalIds, seasons] = await Promise.all([
      this.database.db.select({ provider: animeExternalIds.provider, externalId: animeExternalIds.externalId })
        .from(animeExternalIds).where(eq(animeExternalIds.animeId, item.id)),
      this.database.db.select().from(animeSeasons)
        .where(eq(animeSeasons.animeId, item.id)).orderBy(asc(animeSeasons.number))
    ]);

    return { ...item, externalIds, seasons };
  }

  async seasonEpisodes(seasonId: string, offset = 0, limit = 10) {
    const safeOffset = Math.max(offset, 0);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const [season] = await this.database.db.select().from(animeSeasons).where(eq(animeSeasons.id, seasonId)).limit(1);
    if (!season) throw new NotFoundException('Temporada não encontrada');

    const [items, countRows] = await Promise.all([
      this.database.db.select().from(episodes).where(eq(episodes.seasonId, seasonId))
        .orderBy(asc(episodes.number)).offset(safeOffset).limit(safeLimit),
      this.database.db.select({ count: sql<number>`count(*)::int` }).from(episodes).where(eq(episodes.seasonId, seasonId))
    ]);

    return { season, items, offset: safeOffset, limit: safeLimit, total: countRows[0]?.count ?? 0 };
  }

  async playback(episodeId: string) {
    const [episode] = await this.database.db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1);
    if (!episode) throw new NotFoundException('Episódio não encontrado');

    const sources = await this.database.db
      .select({
        id: episodeSources.id,
        url: episodeSources.url,
        mimeType: episodeSources.mimeType,
        label: episodeSources.label,
        headers: episodeSources.headers,
        isDefault: episodeSources.isDefault
      })
      .from(episodeSources)
      .where(eq(episodeSources.episodeId, episodeId))
      .orderBy(desc(episodeSources.isDefault), asc(episodeSources.label));

    if (!sources.length) throw new NotFoundException('Fonte de reprodução indisponível');

    return {
      episode: {
        id: episode.id,
        number: episode.number,
        title: episode.title,
        durationSeconds: episode.durationSeconds
      },
      sources
    };
  }
}
