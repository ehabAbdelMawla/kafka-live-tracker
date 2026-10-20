import 'reflect-metadata';

// ValidationPipe whitelist drops unknown properties, transform converts
// plain JSON bodies into DTO class instances (needed by class-validator).
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { allowedOrigins } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  // Only allow the frontend origin(s) to call the API.
  app.enableCors({ origin: allowedOrigins });
  // Makes Nest call OnModuleDestroy on shutdown, so Kafka clients disconnect cleanly.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}/api`);
}

bootstrap();
