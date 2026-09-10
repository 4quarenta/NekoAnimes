import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('v1/news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  list(
    @Query('q') query?: string,
    @Query('category') category?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.news.list({ query, category, limit });
  }

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.news.detail(slug);
  }
}
