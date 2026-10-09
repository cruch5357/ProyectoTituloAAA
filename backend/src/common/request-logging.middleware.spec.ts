import { Logger } from '@nestjs/common';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { Request, Response } from 'express';
describe('request logging', () => {
  it.each([
    undefined,
    'untrusted\nvalue',
    'b1a54b52-7326-4c01-9b68-11c444619405',
  ])('validates ID %s and excludes secrets', (incoming) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const response = {
      locals: {} as Record<string, string>,
      setHeader: jest.fn(),
      statusCode: 500,
      on: jest.fn(),
    };
    const next = jest.fn();
    new RequestLoggingMiddleware().use(
      {
        get: () => incoming,
        method: 'GET',
        path: '/api/v1/health',
        url: '/api/v1/health?token=secret',
        body: { password: 'secret' },
      } as unknown as Request,
      response as unknown as Response,
      next,
    );
    expect(response.locals.requestId).toMatch(/^[a-f0-9-]{36}$/i);
    if (incoming?.length === 36)
      expect(response.locals.requestId).toBe(incoming);
    response.on.mock.calls[0][1]();
    expect(next).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).not.toContain('secret');
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      requestId: response.locals.requestId,
      status: 500,
    });
    log.mockRestore();
  });
});
