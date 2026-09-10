import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { AppManifestController } from './modules/app-manifest/app-manifest.controller';
import { AppManifestService } from './modules/app-manifest/app-manifest.service';
import { AdminAppConfigController } from './modules/app-config/admin-app-config.controller';
import { AdminKeyGuard } from './modules/app-config/admin-key.guard';
import { AppConfigRepository } from './modules/app-config/app-config.repository';
import { AppConfigService } from './modules/app-config/app-config.service';
import { CatalogController } from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import { MetadataController } from './modules/providers/metadata.controller';
import { MetadataService } from './modules/providers/metadata.service';
import { MalProvider } from './modules/providers/mal.provider';
import { AniListProvider } from './modules/providers/anilist.provider';
@Module({imports:[ConfigModule.forRoot({isGlobal:true,cache:true,validate:validateEnvironment}),DatabaseModule,RedisModule],controllers:[HealthController,AppManifestController,AdminAppConfigController,CatalogController,MetadataController],providers:[HealthService,AppManifestService,AppConfigRepository,AppConfigService,AdminKeyGuard,CatalogService,MetadataService,MalProvider,AniListProvider]})
export class AppModule {}
