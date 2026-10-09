import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  use(request: Request, response: Response, next: NextFunction) {
    const incoming = request.get('X-Request-Id');
    const requestId =
      incoming &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        incoming,
      )
        ? incoming
        : randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const started = performance.now();
    // No query string, body, cookies or authorization headers.
    const path = request.path;
    response.on('finish', () =>
      this.logger.log(
        JSON.stringify({
          requestId,
          method: request.method,
          path,
          status: response.statusCode,
          durationMs: Math.round((performance.now() - started) * 100) / 100,
        }),
      ),
    );
    next();
  }
}
