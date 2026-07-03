import { KafkaProducerService } from './kafka-producer.service';

describe('KafkaProducerService', () => {
  it('connects a non-auto-topic producer and sends JSON with acks=-1', async () => {
    const producer = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
    };
    const kafka = {
      producer: jest.fn(() => producer),
    };
    const service = new KafkaProducerService(kafka as never);

    await service.onModuleInit();
    await service.publishJson({
      key: 'conversation-1',
      payload: { ok: true },
      topic: 'messages.message-created.v1',
    });
    await service.onApplicationShutdown();

    expect(kafka.producer).toHaveBeenCalledWith({
      allowAutoTopicCreation: false,
      createPartitioner: expect.any(Function),
    });
    expect(producer.connect).toHaveBeenCalledTimes(1);
    expect(producer.send).toHaveBeenCalledWith({
      acks: -1,
      messages: [
        {
          headers: undefined,
          key: 'conversation-1',
          value: JSON.stringify({ ok: true }),
        },
      ],
      topic: 'messages.message-created.v1',
    });
    expect(producer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('sends raw values for DLQ publishing', async () => {
    const producer = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      send: jest.fn(),
    };
    const kafka = {
      producer: jest.fn(() => producer),
    };
    const service = new KafkaProducerService(kafka as never);
    const value = Buffer.from('not-json');

    await service.onModuleInit();
    await service.publishRaw({
      headers: { 'x-error-message': 'bad event' },
      key: 'conversation-1',
      topic: 'messages.message-created.v1.dlq',
      value,
    });

    expect(producer.send).toHaveBeenCalledWith({
      acks: -1,
      messages: [
        {
          headers: {
            'x-error-message': Buffer.from('bad event'),
          },
          key: 'conversation-1',
          value,
        },
      ],
      topic: 'messages.message-created.v1.dlq',
    });
  });
});
