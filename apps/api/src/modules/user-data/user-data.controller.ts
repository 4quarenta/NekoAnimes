import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { UserDataService } from './user-data.service';

type AuthRequest = { userId: string; userEmail?: string };

@Controller('v1/me')
@UseGuards(SupabaseAuthGuard)
export class UserDataController {
  constructor(private readonly userData: UserDataService) {}

  @Get()
  me(@Req() request: AuthRequest) {
    return { id: request.userId, email: request.userEmail ?? null };
  }

  @Get('library')
  library(@Req() request: AuthRequest) { return this.userData.library(request.userId); }

  @Put('library/:animeId')
  setLibrary(@Req() request: AuthRequest, @Param('animeId') animeId: string, @Body() body: { status?: string }) {
    const allowed = new Set(['watchlist', 'watching', 'completed', 'paused', 'dropped']);
    const status = allowed.has(body.status ?? '') ? body.status! : 'watchlist';
    return this.userData.setLibrary(request.userId, animeId, status);
  }

  @Delete('library/:animeId')
  removeLibrary(@Req() request: AuthRequest, @Param('animeId') animeId: string) {
    return this.userData.removeLibrary(request.userId, animeId);
  }

  @Get('continue-watching')
  continueWatching(@Req() request: AuthRequest) { return this.userData.continueWatching(request.userId); }

  @Put('progress/:episodeId')
  setProgress(
    @Req() request: AuthRequest,
    @Param('episodeId') episodeId: string,
    @Body() body: { positionSeconds?: number; durationSeconds?: number }
  ) {
    return this.userData.setProgress(request.userId, episodeId, body.positionSeconds ?? 0, body.durationSeconds ?? 0);
  }

  @Get('saved-news')
  savedNews(@Req() request: AuthRequest) { return this.userData.savedNews(request.userId); }

  @Put('saved-news/:articleId')
  saveNews(@Req() request: AuthRequest, @Param('articleId') articleId: string) {
    return this.userData.saveNews(request.userId, articleId);
  }

  @Delete('saved-news/:articleId')
  removeSavedNews(@Req() request: AuthRequest, @Param('articleId') articleId: string) {
    return this.userData.removeSavedNews(request.userId, articleId);
  }
}
