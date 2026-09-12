import { Module } from '@nestjs/common';
import { AnimesOnlineCcAdapter } from './adapters/animesonlinecc/animesonlinecc.adapter';
import { GoyabuAdapter } from './adapters/goyabu/goyabu.adapter';
import { ServerHttpClient } from './server-http.client';
import { ServerRegistry } from './server-registry';
import { ServersCacheService } from './servers-cache.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  controllers: [ServersController],
  providers: [
    ServerHttpClient,
    ServersCacheService,
    GoyabuAdapter,
    AnimesOnlineCcAdapter,
    ServerRegistry,
    ServersService
  ],
  exports: [ServersService]
})
export class ServersModule {}
