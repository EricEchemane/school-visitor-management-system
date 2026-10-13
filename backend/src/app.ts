import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { INestApplication, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule, AppOptions } from './app.module';

export async function createApp(opts: AppOptions): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(opts), {
    logger: process.env.NODE_ENV === 'test' ? false : new Logger().localInstance,
  });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  return app;
}
