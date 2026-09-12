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
import { NewsController } from './modules/news/news.controller';
import { AdminNewsController } from './modules/news/admin-news.controller';
import { NewsService } from './modules/news/news.service';
import { SupabaseAuthGuard } from './modules/auth/supabase-auth.guard';
import { UserDataController } from './modules/user-data/user-data.controller';
import { UserDataService } from './modules/user-data/user-data.service';
import { AppUpdateController } from './modules/app-update/app-update.controller';
import { ServersModule } from './modules/servers/servers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment }),
    DatabaseModule,
    RedisModule,
    ServersModule
  ],
  controllers: [
    HealthController,
    AppManifestController,
    AppUpdateController,
    AdminAppConfigController,
    CatalogController,
    MetadataController,
    NewsController,
    AdminNewsController,
    UserDataController
  ],
  providers: [
    HealthService,
    AppManifestService,
    AppConfigRepository,
    AppConfigService,
    AdminKeyGuard,
    CatalogService,
    MetadataService,
    MalProvider,
    AniListProvider,
    NewsService,
    SupabaseAuthGuard,
    UserDataService
  ]
})
export class AppModule {}
