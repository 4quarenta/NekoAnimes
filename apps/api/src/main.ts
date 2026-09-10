import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: 256 * 1024 })
  );

  const config = app.get(ConfigService);
  const allowedOrigins = [
    config.getOrThrow<string>('WEB_APP_URL'),
    config.getOrThrow<string>('ADMIN_APP_URL')
  ].map((value) => new URL(value).origin);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-admin-key'],
    maxAge: 600
  });
  app.enableShutdownHooks();

  await app.listen({
    port: config.getOrThrow<number>('API_PORT'),
    host: '0.0.0.0'
  });
}

void bootstrap();
