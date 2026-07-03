import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';

import { CORRELATION_ID_HEADER } from '../correlation/correlation-id-context.service';

type HeaderReader = {
  headers: Record<string, string | string[] | undefined>;
};

export function createPinoLoggerParams(configService: ConfigService): Params {
  return {
    pinoHttp: {
      autoLogging: {
        ignore: (request) => request.url === '/health/liveness' || request.url === '/metrics',
      },
      customProps: (request) => ({
        correlationId: request.id,
      }),
      genReqId: (request, response) => {
        const correlationId = getHeader(request, CORRELATION_ID_HEADER);
        const requestId = correlationId ?? crypto.randomUUID();
        response.setHeader(CORRELATION_ID_HEADER, requestId);
        return requestId;
      },
      level: configService.get<string>('app.logLevel') ?? 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-api-key',
          'req.headers["x-api-key"]',
        ],
        remove: true,
      },
    },
    renameContext: 'context',
  };
}

function getHeader(request: HeaderReader, headerName: string): string | undefined {
  const headerValue = request.headers[headerName];

  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return headerValue;
}
