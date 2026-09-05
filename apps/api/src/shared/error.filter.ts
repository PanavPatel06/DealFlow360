import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@dealflow/contracts';
import { AppError } from './app-error';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      return res.status(exception.status).json({
        success: false,
        error: { code: exception.code, message: exception.message, details: exception.details },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === 400
          ? ErrorCode.VALIDATION_FAILED
          : status === 401
            ? ErrorCode.UNAUTHENTICATED
            : status === 403
              ? ErrorCode.FORBIDDEN
              : status === 404
                ? ErrorCode.NOT_FOUND
                : ErrorCode.VALIDATION_FAILED;
      return res
        .status(status)
        .json({ success: false, error: { code, message: exception.message } });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (exception as Error)?.message ?? 'Unexpected error' },
    });
  }
}
