import type { ClientSession } from 'mongoose';

export interface TransactionManagerPort {
  withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T>;
}
