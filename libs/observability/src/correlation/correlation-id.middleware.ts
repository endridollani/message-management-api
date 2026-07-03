import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { CORRELATION_ID_HEADER, CorrelationIdContext } from './correlation-id-context.service';

type PinoRequest = Request & {
  id?: unknown;
};

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly context: CorrelationIdContext) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(request as PinoRequest);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    this.context.run(correlationId, next);
  }
}

function resolveCorrelationId(request: PinoRequest): string {
  if (typeof request.id === 'string' && request.id.trim().length > 0) {
    return request.id;
  }

  const header = request.header(CORRELATION_ID_HEADER);
  return header && header.trim().length > 0 ? header.trim() : randomUUID();
}
