import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function hostFor(path = '/api/v1/workout-logs') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = {
    locals: { requestId: 'request-123' },
    status,
  };
  const request = {
    method: 'GET',
    path,
    route: { path },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NODE_ENV;
  });

  it('registra diagnóstico sanitizado de un 500 sin exponerlo al cliente', () => {
    process.env.NODE_ENV = 'development';
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, json, status } = hostFor();
    const exception = Object.assign(
      new Error(
        'Invalid query DATABASE_URL=postgresql://user:secret@localhost:5432/app authorization=Bearer.secret',
      ),
      { code: 'P2022' },
    );

    new AllExceptionsFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      data: null,
      error: {
        code: 500,
        message: 'Error interno del servidor',
        details: undefined,
      },
      meta: {
        requestId: 'request-123',
        timestamp: expect.any(String),
        path: '/api/v1/workout-logs',
      },
    });
    const diagnostic = JSON.parse(String(logger.mock.calls[0][0]));
    expect(diagnostic).toMatchObject({
      requestId: 'request-123',
      operation: 'GET /api/v1/workout-logs',
      status: 500,
      errorType: 'Error',
      errorCode: 'P2022',
    });
    expect(diagnostic.technicalMessage).toContain('DATABASE_URL=[REDACTED]');
    expect(diagnostic.technicalMessage).not.toContain('user:secret');
    expect(diagnostic.technicalMessage).not.toContain('Bearer.secret');
    expect(diagnostic.stack).toEqual(expect.any(String));
  });

  it('conserva la estructura pública de los errores HTTP esperados', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { host, json, status } = hostFor('/api/v1/training/me');

    new AllExceptionsFilter().catch(
      new BadRequestException('Solicitud inválida'),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      data: null,
      error: {
        code: 400,
        message: 'Solicitud inválida',
        details: 'Solicitud inválida',
      },
      meta: {
        requestId: 'request-123',
        timestamp: expect.any(String),
        path: '/api/v1/training/me',
      },
    });
    expect(logger).toHaveBeenCalledWith(
      'request-123 GET /api/v1/training/me -> 400',
    );
  });
});
