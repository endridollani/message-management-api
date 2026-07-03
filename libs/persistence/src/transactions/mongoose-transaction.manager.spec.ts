import { MongooseTransactionManager } from './mongoose-transaction.manager';

describe('MongooseTransactionManager', () => {
  it('runs the operation inside one session transaction and ends the session', async () => {
    const session = {
      endSession: jest.fn().mockResolvedValue(undefined),
      withTransaction: jest.fn(async (operation: () => Promise<string>) => operation()),
    };
    const connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };
    const manager = new MongooseTransactionManager(connection as never);
    const operation = jest.fn().mockResolvedValue('ok');

    await expect(manager.withTransaction(operation)).resolves.toBe('ok');

    expect(connection.startSession).toHaveBeenCalledTimes(1);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith(session);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the transaction operation fails', async () => {
    const error = new Error('abort');
    const session = {
      endSession: jest.fn().mockResolvedValue(undefined),
      withTransaction: jest.fn(async (operation: () => Promise<unknown>) => operation()),
    };
    const connection = {
      startSession: jest.fn().mockResolvedValue(session),
    };
    const manager = new MongooseTransactionManager(connection as never);

    await expect(manager.withTransaction(async () => Promise.reject(error))).rejects.toThrow(error);

    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});
