import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('v1/app-update')
export class AppUpdateController {
  constructor(private readonly config: ConfigService) {}

  @Get('android')
  @Header('Cache-Control', 'no-store')
  android() {
    const versionCode = this.config.get<number>('ANDROID_LATEST_VERSION_CODE');
    const versionName = this.config.get<string>('ANDROID_LATEST_VERSION_NAME');
    const apkUrl = this.config.get<string>('ANDROID_APK_URL');
    const sha256 = this.config.get<string>('ANDROID_APK_SHA256');
    const required = this.config.get<boolean>('ANDROID_UPDATE_REQUIRED') ?? false;

    if (!versionCode || !versionName || !apkUrl || !sha256) {
      throw new ServiceUnavailableException('Canal de atualização Android ainda não publicado');
    }

    return {
      platform: 'android' as const,
      channel: 'direct' as const,
      versionCode,
      versionName,
      apkUrl,
      sha256: sha256.toLowerCase(),
      required
    };
  }
}
