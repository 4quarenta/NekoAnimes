import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AdminKeyGuard } from '../app-config/admin-key.guard';
import { DatabaseService } from '../../database/database.service';
import { newsArticles } from '../../database/schema';

const PublishNewsSchema = z.object({
  slug: z.string().min(1).max(180),
  title: z.string().min(1).max(240),
  summary: z.string().max(1200).nullable().optional(),
  category: z.string().min(1).max(64).default('geral'),
  sourceName: z.string().min(1).max(120),
  sourceUrl: z.string().url(),
  imageUrl: z.string().url().nullable().optional(),
  imageAllowed: z.boolean().default(false),
  publishedAt: z.coerce.date()
}).strict();

@Controller('v1/admin/news')
@UseGuards(AdminKeyGuard)
export class AdminNewsController {
  constructor(private readonly database: DatabaseService) {}

  @Post()
  async publish(@Body() body: unknown) {
    const input = PublishNewsSchema.parse(body);
    const existing = await this.database.db.select({ id: newsArticles.id }).from(newsArticles).where(eq(newsArticles.slug, input.slug)).limit(1);
    const values = { ...input, updatedAt: new Date() };

    if (existing[0]) {
      const [updated] = await this.database.db.update(newsArticles).set(values).where(eq(newsArticles.id, existing[0].id)).returning();
      return updated;
    }

    const [created] = await this.database.db.insert(newsArticles).values(values).returning();
    return created;
  }
}
