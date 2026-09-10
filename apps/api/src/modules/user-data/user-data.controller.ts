import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { UserDataService } from './user-data.service';

type AuthRequest = { userId: string; userEmail?: string };
const UuidSchema = z.string().uuid();
const LibraryStatusSchema = z.enum(['watchlist', 'watching', 'completed', 'paused', 'dropped']);
const ProgressSchema = z.object({
  positionSeconds: z.number().finite().int().min(0).max(604800),
  durationSeconds: z.number().finite().int().min(0).max(604800)
}).refine((value) => value.durationSeconds === 0 || value.positionSeconds <= value.durationSeconds + 30, {
  message: 'positionSeconds inválido'
});

function parseUuid(value: string, field: string) {
  const result = UuidSchema.safeParse(value);
  if (!result.success) throw new BadRequestException(`${field} inválido`);
  return result.data;
}

@Controller('v1/me')
@UseGuards(SupabaseAuthGuard)
export class UserDataController {
  constructor(private readonly userData: UserDataService) {}

  @Get()
  me(@Req() request: AuthRequest) { return { id: request.userId, email: request.userEmail ?? null }; }

  @Get('library')
  library(@Req() request: AuthRequest) { return this.userData.library(request.userId); }

  @Put('library/:animeId')
  setLibrary(@Req() request: AuthRequest, @Param('animeId') animeId: string, @Body() body: unknown) {
    const parsed = z.object({ status: LibraryStatusSchema.default('watchlist') }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('Status da biblioteca inválido');
    return this.userData.setLibrary(request.userId, parseUuid(animeId, 'animeId'), parsed.data.status);
  }

  @Delete('library/:animeId')
  removeLibrary(@Req() request: AuthRequest, @Param('animeId') animeId: string) {
    return this.userData.removeLibrary(request.userId, parseUuid(animeId, 'animeId'));
  }

  @Get('continue-watching')
  continueWatching(@Req() request: AuthRequest) { return this.userData.continueWatching(request.userId); }

  @Put('progress/:episodeId')
  setProgress(@Req() request: AuthRequest, @Param('episodeId') episodeId: string, @Body() body: unknown) {
    const parsed = ProgressSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Progresso inválido');
    return this.userData.setProgress(
      request.userId,
      parseUuid(episodeId, 'episodeId'),
      parsed.data.positionSeconds,
      parsed.data.durationSeconds
    );
  }

  @Get('saved-news')
  savedNews(@Req() request: AuthRequest) { return this.userData.savedNews(request.userId); }

  @Put('saved-news/:articleId')
  saveNews(@Req() request: AuthRequest, @Param('articleId') articleId: string) {
    return this.userData.saveNews(request.userId, parseUuid(articleId, 'articleId'));
  }

  @Delete('saved-news/:articleId')
  removeSavedNews(@Req() request: AuthRequest, @Param('articleId') articleId: string) {
    return this.userData.removeSavedNews(request.userId, parseUuid(articleId, 'articleId'));
  }
}
