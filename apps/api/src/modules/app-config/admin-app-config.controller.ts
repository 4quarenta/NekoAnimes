import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  UseGuards
} from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';
import { AppConfigService } from './app-config.service';
import { AppConfigUpdateSchema } from './app-config.types';

@Controller('v1/admin/app-config')
@UseGuards(AdminKeyGuard)
export class AdminAppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get()
  getSettings() {
    return this.appConfig.getSettings();
  }

  @Put()
  updateSettings(@Body() body: unknown) {
    const parsed = AppConfigUpdateSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Configuração inválida',
        issues: parsed.error.issues
      });
    }

    return this.appConfig.updateSettings(parsed.data);
  }
}
