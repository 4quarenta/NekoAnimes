import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { newsArticles } from '../../database/schema';

@Injectable()
export class NewsService {
  constructor(private readonly database: DatabaseService) {}

  async list(input: { query?: string; category?: string; limit?: number }) {
    const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
    const conditions = [];
    if (input.query?.trim()) {
      const q = `%${input.query.trim()}%`;
      conditions.push(or(ilike(newsArticles.title, q), ilike(newsArticles.summary, q), ilike(newsArticles.sourceName, q))!);
    }
    if (input.category?.trim()) conditions.push(eq(newsArticles.category, input.category.trim()));

    const items = await this.database.db
      .select({
        id: newsArticles.id,
        slug: newsArticles.slug,
        title: newsArticles.title,
        summary: newsArticles.summary,
        category: newsArticles.category,
        sourceName: newsArticles.sourceName,
        sourceUrl: newsArticles.sourceUrl,
        imageUrl: newsArticles.imageUrl,
        imageAllowed: newsArticles.imageAllowed,
        publishedAt: newsArticles.publishedAt
      })
      .from(newsArticles)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(newsArticles.publishedAt))
      .limit(limit);

    return {
      items: items.map((item) => ({ ...item, imageUrl: item.imageAllowed ? item.imageUrl : null })),
      count: items.length
    };
  }

  async detail(slug: string) {
    const [item] = await this.database.db.select().from(newsArticles).where(eq(newsArticles.slug, slug)).limit(1);
    if (!item) throw new NotFoundException('Notícia não encontrada');
    return { ...item, imageUrl: item.imageAllowed ? item.imageUrl : null };
  }
}
