import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 3_000;
const MAX_DIAGNOSTIC_STACK_LENGTH = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeDiagnosticText(value: string, maxLength: number) {
  return value
    .replace(
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/gi,
      '[REDACTED_CONNECTION_URL]',
    )
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[REDACTED_JWT]',
    )
    .replace(
      /\b(password(?:Hash)?|accessToken|refreshToken|authorization|cookie|database_url)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1$2[REDACTED]',
    )
    .slice(0, maxLength);
}

function diagnosticType(exception: unknown) {
  if (exception instanceof Error) return exception.name;
  if (isRecord(exception)) {
    const constructor = exception.constructor;
    if (typeof constructor === 'function' && constructor.name)
      return constructor.name;
  }
  return typeof exception;
}

function diagnosticCode(exception: unknown) {
  if (!isRecord(exception)) return undefined;
  const code = exception.code;
  return typeof code === 'string' || typeof code === 'number'
    ? code
    : undefined;
}

function diagnosticMessage(exception: unknown) {
  const message =
    exception instanceof Error
      ? exception.message
      : isRecord(exception) && typeof exception.message === 'string'
        ? exception.message
        : 'Excepción no Error sin mensaje técnico';
  return sanitizeDiagnosticText(message, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

function diagnosticStack(exception: unknown) {
  if (
    process.env.NODE_ENV !== 'development' ||
    !(exception instanceof Error) ||
    !exception.stack
  )
    return undefined;
  return sanitizeDiagnosticText(exception.stack, MAX_DIAGNOSTIC_STACK_LENGTH);
}

// Filtro global de errores: nunca expone stack traces ni detalles internos
// al cliente (ver docs/security.md, punto 16). El detalle completo solo
// se registra en el log del servidor, sin datos sensibles (punto 17).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor';

    const requestId = response.locals.requestId ?? 'unknown';
    const operation = `${request.method} ${String(request.route?.path ?? request.path)}`;

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        JSON.stringify({
          requestId,
          operation,
          status,
          errorType: diagnosticType(exception),
          errorCode: diagnosticCode(exception),
          technicalMessage: diagnosticMessage(exception),
          stack: diagnosticStack(exception),
        }),
      );
    } else {
      this.logger.error(`${requestId} ${operation} -> ${status}`);
    }

    response.status(status).json({
      data: null,
      error: {
        code: status,
        message:
          typeof message === 'string'
            ? message
            : ((message as any).message ?? message),
        details:
          typeof message === 'object' ? (message as any).message : undefined,
      },
      meta: {
        requestId: response.locals.requestId,
        timestamp: new Date().toISOString(),
        path: request.path,
      },
    });
  }
}
