import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SearchUnavailableError } from '@app/domain';
import { CorrelationIdContext } from '@app/observability';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly correlationIdContext: CorrelationIdContext,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const statusCode = getStatusCode(exception);
    const body = getErrorBody(exception, statusCode);
    const correlationId =
      this.correlationIdContext.getCorrelationId() ?? request.header('x-correlation-id');

    if (!(exception instanceof HttpException) && !(exception instanceof SearchUnavailableError)) {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    this.httpAdapterHost.httpAdapter.reply(
      response,
      {
        ...body,
        correlationId,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
      statusCode,
    );
  }
}

type ErrorBody = {
  error: string;
  message: string | string[];
  statusCode: number;
};

function getStatusCode(exception: unknown): number {
  if (exception instanceof SearchUnavailableError) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }

  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

function getErrorBody(exception: unknown, statusCode: number): ErrorBody {
  if (exception instanceof SearchUnavailableError) {
    return {
      error: 'Service Unavailable',
      message: exception.message,
      statusCode,
    };
  }

  if (!(exception instanceof HttpException)) {
    return {
      error: 'Internal Server Error',
      message: 'Internal server error',
      statusCode,
    };
  }

  const response = exception.getResponse();
  if (typeof response === 'object' && response !== null) {
    const errorResponse = response as Partial<ErrorBody>;
    return {
      error: errorResponse.error ?? exception.name,
      message: errorResponse.message ?? exception.message,
      statusCode,
    };
  }

  return {
    error: exception.name,
    message: response,
    statusCode,
  };
}
