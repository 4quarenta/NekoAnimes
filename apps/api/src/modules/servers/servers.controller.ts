import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ServersService } from './servers.service';

const querySchema = z.string().trim().min(2).max(120);
const serverIdSchema = z.string().trim().regex(/^[a-z0-9-]{2,50}$/);
const referenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine((value) => value.startsWith('/'), 'Referência inválida');
const positiveIntSchema = z.coerce.number().int().min(1).max(100_000);

@Controller('v1/servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  listServers() {
    return this.servers.listServers();
  }

  @Get('health')
  health() {
    return this.servers.health();
  }

  @Get('search')
  search(@Query('q') query: string | undefined) {
    return this.servers.search(this.parse(querySchema, query, 'Consulta inválida'));
  }

  @Get('resolve/:query/:season/:episode')
  resolveEpisode(
    @Param('query') query: string,
    @Param('season') season: string,
    @Param('episode') episode: string
  ) {
    return this.servers.resolveEpisode(
      this.parse(querySchema, query, 'Anime inválido'),
      this.parse(positiveIntSchema, season, 'Temporada inválida'),
      this.parse(positiveIntSchema, episode, 'Episódio inválido')
    );
  }

  @Get(':serverId/anime')
  getAnime(@Param('serverId') serverId: string, @Query('ref') reference: string | undefined) {
    return this.servers.getAnime(
      this.parse(serverIdSchema, serverId, 'Servidor inválido'),
      this.parse(referenceSchema, reference, 'Referência inválida')
    );
  }

  @Get(':serverId/episode')
  getEpisode(@Param('serverId') serverId: string, @Query('ref') reference: string | undefined) {
    return this.servers.getEpisode(
      this.parse(serverIdSchema, serverId, 'Servidor inválido'),
      this.parse(referenceSchema, reference, 'Referência inválida')
    );
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(message);
    return parsed.data;
  }
}
