import { Module } from '@nestjs/common';
import { HealthController } from './modules/health/health.controller';
import { AppManifestController } from './modules/app-manifest/app-manifest.controller';
import { AppManifestService } from './modules/app-manifest/app-manifest.service';

@Module({
  controllers: [HealthController, AppManifestController],
  providers: [AppManifestService]
})
export class AppModule {}
