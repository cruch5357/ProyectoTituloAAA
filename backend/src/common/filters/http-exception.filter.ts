import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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

    this.logger.error(
      `${response.locals.requestId ?? 'unknown'} ${request.method} ${request.path} -> ${status}`,
    );

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
