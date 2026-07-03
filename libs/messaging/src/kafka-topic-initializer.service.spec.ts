import { MESSAGE_CREATED_TOPIC } from '@app/domain';

import { MESSAGE_CREATED_DLQ_TOPIC } from './kafka.constants';
import { KafkaTopicInitializer } from './kafka-topic-initializer.service';

describe('KafkaTopicInitializer', () => {
  it('creates the message-created topic and DLQ idempotently', async () => {
    const admin = {
      connect: jest.fn(),
      createTopics: jest.fn().mockResolvedValue(false),
      disconnect: jest.fn(),
      listTopics: jest.fn().mockResolvedValue([]),
    };
    const kafka = {
      admin: jest.fn(() => admin),
    };
    const service = new KafkaTopicInitializer(kafka as never);

    await service.initializeTopics();

    expect(admin.connect).toHaveBeenCalledTimes(1);
    expect(admin.listTopics).toHaveBeenCalledTimes(1);
    expect(admin.createTopics).toHaveBeenCalledWith({
      topics: [
        { numPartitions: 3, topic: MESSAGE_CREATED_TOPIC },
        { numPartitions: 3, topic: MESSAGE_CREATED_DLQ_TOPIC },
      ],
      waitForLeaders: true,
    });
    expect(admin.disconnect).toHaveBeenCalledTimes(1);
  });

  it('skips createTopics when all topics already exist', async () => {
    const admin = {
      connect: jest.fn(),
      createTopics: jest.fn(),
      disconnect: jest.fn(),
      listTopics: jest.fn().mockResolvedValue([MESSAGE_CREATED_TOPIC, MESSAGE_CREATED_DLQ_TOPIC]),
    };
    const kafka = {
      admin: jest.fn(() => admin),
    };
    const service = new KafkaTopicInitializer(kafka as never);

    await service.initializeTopics();

    expect(admin.createTopics).not.toHaveBeenCalled();
    expect(admin.disconnect).toHaveBeenCalledTimes(1);
  });
});
