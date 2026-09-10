import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { HealthController } from './modules/health/health.controller';
import { HealthService } from './modules/health/health.service';
import { AppManifestController } from './modules/app-manifest/app-manifest.controller';
import { AppManifestService } from './modules/app-manifest/app-manifest.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment
    }),
    DatabaseModule,
    RedisModule
  ],
  controllers: [HealthController, AppManifestController],
  providers: [HealthService, AppManifestService]
})
export class AppModule {}
