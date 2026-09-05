import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ErrorFilter } from './shared/error.filter';
import { JwtAuthGuard } from './shared/jwt-auth.guard';
import { SuccessInterceptor } from './shared/success.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ErrorFilter());
  app.useGlobalInterceptors(new SuccessInterceptor());
  app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));
  await app.listen(process.env.PORT ?? 3101);
}
bootstrap();
