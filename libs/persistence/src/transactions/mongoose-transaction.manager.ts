import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { ClientSession } from 'mongoose';

import type { TransactionManagerPort } from '@app/domain';

@Injectable()
export class MongooseTransactionManager implements TransactionManagerPort {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();

    try {
      return await session.withTransaction(() => operation(session));
    } finally {
      await session.endSession();
    }
  }
}
