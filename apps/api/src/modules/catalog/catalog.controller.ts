import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('v1/catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('anime')
  list(
    @Query('letter') letter?: string,
    @Query('q') query?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.catalog.list({ letter, query, limit });
  }

  @Get('anime/:slug')
  detail(@Param('slug') slug: string) {
    return this.catalog.detail(slug);
  }

  @Get('seasons/:seasonId/episodes')
  episodes(
    @Param('seasonId') seasonId: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number
  ) {
    return this.catalog.seasonEpisodes(seasonId, offset, limit);
  }

  @Get('episodes/:episodeId/playback')
  playback(@Param('episodeId') episodeId: string) {
    return this.catalog.playback(episodeId);
  }
}
