import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  const config = app.get(ConfigService);

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.enableShutdownHooks();

  await app.listen({
    port: config.getOrThrow<number>('API_PORT'),
    host: '0.0.0.0'
  });
}

void bootstrap();
