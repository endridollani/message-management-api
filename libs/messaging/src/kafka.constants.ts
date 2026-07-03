import { MESSAGE_CREATED_TOPIC } from '@app/domain';

export const MESSAGE_CREATED_DLQ_TOPIC = `${MESSAGE_CREATED_TOPIC}.dlq`;

export const KAFKA_TOPIC_DEFINITIONS = [
  {
    numPartitions: 3,
    topic: MESSAGE_CREATED_TOPIC,
  },
  {
    numPartitions: 3,
    topic: MESSAGE_CREATED_DLQ_TOPIC,
  },
] as const;
