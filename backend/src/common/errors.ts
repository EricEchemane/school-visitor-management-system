import { HttpException } from '@nestjs/common';

export class AppError extends HttpException {
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super({ code, message, ...extra }, status);
  }
}

export const badRequest = (message: string, code = 'VALIDATION') => new AppError(400, code, message);
export const unauthorized = (message = 'Please sign in') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do this') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new AppError(409, code, message, extra);
export const tooMany = (message: string) => new AppError(429, 'RATE_LIMITED', message);
