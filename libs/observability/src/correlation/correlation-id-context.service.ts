import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

type CorrelationStore = {
  correlationId: string;
};

@Injectable()
export class CorrelationIdContext {
  private readonly storage = new AsyncLocalStorage<CorrelationStore>();

  getCorrelationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }

  run<T>(correlationId: string, callback: () => T): T {
    return this.storage.run({ correlationId }, callback);
  }
}
