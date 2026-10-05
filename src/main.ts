import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PASTA_PUBLICA } from './app.controller';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', true);
  app.enableCors();
  app.useStaticAssets(PASTA_PUBLICA, { prefix: '/static/', maxAge: '1h' });
  await app.listen(config.porta, '0.0.0.0');
  console.log(`Catálogo Shopping dos Pisos ouvindo na porta ${config.porta}`);
}

bootstrap();
