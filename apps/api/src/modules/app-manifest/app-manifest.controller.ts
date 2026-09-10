import { Controller, Get, Header } from '@nestjs/common';
import { AppManifestService } from './app-manifest.service';

@Controller('v1/app-manifest')
export class AppManifestController {
  constructor(private readonly appManifest: AppManifestService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getManifest() {
    return this.appManifest.getManifest();
  }
}
