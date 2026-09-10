import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class AppManifestService {
  constructor(private readonly appConfig: AppConfigService) {}

  getManifest() {
    return this.appConfig.getManifest();
  }
}
