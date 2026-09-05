import { ERROR_HTTP_STATUS, ErrorCode } from '@dealflow/contracts';

/** The only way to fail. One envelope, one stable code (invariant 8). */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get status() {
    return ERROR_HTTP_STATUS[this.code];
  }
}
