import { Client } from '@elastic/elasticsearch';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Kafka } from 'kafkajs';
import { createServer } from 'node:net';

import {
  MESSAGE_CREATED_DLQ_TOPIC,
  MESSAGE_CREATED_SEARCH_INDEXER_GROUP,
} from '@app/messaging';
import { MESSAGE_CREATED_TOPIC } from '@app/domain';
import { MESSAGES_READ_ALIAS } from '@app/search';

const MONGO_IMAGE = 'mongo:7.0';
const KAFKA_IMAGE = 'bitnamilegacy/kafka:3.7.1-debian-12-r11';
const ELASTICSEARCH_IMAGE = 'docker.elastic.co/elasticsearch/elasticsearch:8.14.3';

export type IntegrationInfrastructure = {
  mongodbUri: string;
  kafkaBrokers: string[];
  elasticsearchNode: string;
  elasticsearch: Client;
  kafka: Kafka;
  stop: () => Promise<void>;
};

export async function startIntegrationInfrastructure(): Promise<IntegrationInfrastructure> {
  const containers: StartedTestContainer[] = [];

  const mongodb = await new GenericContainer(MONGO_IMAGE)
    .withCommand(['mongod', '--replSet', 'rs0', '--bind_ip_all'])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(120_000)
    .start();
  containers.push(mongodb);
  await initializeMongoReplicaSet(mongodb);

  const kafkaHostPort = await reserveHostPort();
  const kafkaContainer = await new GenericContainer(KAFKA_IMAGE)
    .withHostname('kafka')
    .withEnvironment({
      ALLOW_PLAINTEXT_LISTENER: 'yes',
      KAFKA_CFG_ADVERTISED_LISTENERS: `PLAINTEXT://kafka:9092,EXTERNAL://localhost:${kafkaHostPort}`,
      KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE: 'false',
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: '1@kafka:9093',
      KAFKA_CFG_GROUP_INITIAL_REBALANCE_DELAY_MS: '0',
      KAFKA_CFG_INTER_BROKER_LISTENER_NAME: 'PLAINTEXT',
      KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP:
        'PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,EXTERNAL:PLAINTEXT',
      KAFKA_CFG_LISTENERS: 'PLAINTEXT://:9092,CONTROLLER://:9093,EXTERNAL://:9094',
      KAFKA_CFG_NODE_ID: '1',
      KAFKA_CFG_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      KAFKA_CFG_PROCESS_ROLES: 'broker,controller',
      KAFKA_CFG_TRANSACTION_STATE_LOG_MIN_ISR: '1',
      KAFKA_CFG_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: '1',
      KAFKA_ENABLE_KRAFT: 'yes',
      KAFKA_KRAFT_CLUSTER_ID: 'abcdefghijklmnopqrstuv',
    })
    .withExposedPorts({ container: 9094, host: kafkaHostPort })
    .withWaitStrategy(
      Wait.forSuccessfulCommand(
        '/opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list',
      ),
    )
    .withStartupTimeout(180_000)
    .start();
  containers.push(kafkaContainer);

  const elasticsearch = await new GenericContainer(ELASTICSEARCH_IMAGE)
    .withEnvironment({
      'discovery.type': 'single-node',
      ES_JAVA_OPTS: '-Xms512m -Xmx512m',
      'xpack.security.enabled': 'false',
    })
    .withExposedPorts(9200)
    .withWaitStrategy(
      Wait.forHttp('/_cluster/health?wait_for_status=yellow&timeout=30s', 9200)
        .forStatusCode(200)
        .withReadTimeout(35_000),
    )
    .withStartupTimeout(180_000)
    .start();
  containers.push(elasticsearch);

  const kafkaBrokers = [`localhost:${kafkaHostPort}`];
  const elasticsearchNode = `http://${elasticsearch.getHost()}:${elasticsearch.getMappedPort(9200)}`;
  const client = new Client({ node: elasticsearchNode });
  await client.cluster.putSettings({
    transient: {
      'cluster.routing.allocation.disk.threshold_enabled': false,
    },
  });
  const kafka = new Kafka({
    brokers: kafkaBrokers,
    clientId: 'message-management-api-integration',
  });

  return {
    elasticsearch: client,
    elasticsearchNode,
    kafka,
    kafkaBrokers,
    mongodbUri: `mongodb://${mongodb.getHost()}:${mongodb.getMappedPort(
      27017,
    )}/message_management?replicaSet=rs0&directConnection=true`,
    stop: async () => {
      await Promise.allSettled([client.close()]);
      await stopContainers(containers);
    },
  };
}

export async function resetElasticsearch(client: Client): Promise<void> {
  const indices = await getMessageIndices(client);
  if (indices.length > 0) {
    await client.indices.delete({ index: indices.join(',') });
  }
}

export async function clearSearchDocuments(client: Client): Promise<void> {
  const exists = await client.indices.existsAlias({ name: MESSAGES_READ_ALIAS });
  if (!exists) {
    return;
  }

  await client.deleteByQuery({
    conflicts: 'proceed',
    index: MESSAGES_READ_ALIAS,
    query: { match_all: {} },
    refresh: true,
  });
}

export async function waitForSearchDocument(
  client: Client,
  messageId: string,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  return poll(async () => {
    await client.indices.refresh({ index: MESSAGES_READ_ALIAS });
    const response = await client.get<Record<string, unknown>>(
      {
        id: messageId,
        index: MESSAGES_READ_ALIAS,
      },
      { ignore: [404] },
    );

    if (response.found && response._source) {
      return response._source;
    }

    return undefined;
  }, timeoutMs);
}

export async function waitForConsumerGroup(kafka: Kafka, timeoutMs = 30_000): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();

  try {
    await poll(async () => {
      const response = await admin.describeGroups([MESSAGE_CREATED_SEARCH_INDEXER_GROUP]);
      const group = response.groups.find(
        (candidate) => candidate.groupId === MESSAGE_CREATED_SEARCH_INDEXER_GROUP,
      );

      return group?.state === 'Stable' ? true : undefined;
    }, timeoutMs);
  } finally {
    await admin.disconnect();
  }
}

export async function ensureKafkaTopics(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();

  try {
    await admin.createTopics({
      topics: [
        { numPartitions: 3, topic: MESSAGE_CREATED_TOPIC },
        { numPartitions: 3, topic: MESSAGE_CREATED_DLQ_TOPIC },
      ],
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
}

export async function poll<T>(
  read: () => Promise<T | undefined> | T | undefined,
  timeoutMs = 10_000,
  intervalMs = 100,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const value = await read();
      if (value !== undefined) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(intervalMs);
  }

  throw lastError instanceof Error ? lastError : new Error(`Timed out after ${timeoutMs}ms`);
}

async function initializeMongoReplicaSet(container: StartedTestContainer): Promise<void> {
  await container.exec([
    'mongosh',
    '--host',
    'localhost:27017',
    '--quiet',
    '--eval',
    `
      try {
        rs.status();
      } catch (error) {
        rs.initiate({
          _id: 'rs0',
          members: [{ _id: 0, host: 'localhost:27017' }]
        });
      }
    `,
  ]);

  await poll(async () => {
    const result = await container.exec([
      'mongosh',
      '--host',
      'localhost:27017',
      '--quiet',
      '--eval',
      'db.hello().isWritablePrimary',
    ]);

    return result.output.trim() === 'true' ? true : undefined;
  }, 30_000);
}

async function getMessageIndices(client: Client): Promise<string[]> {
  try {
    const response = (await client.indices.get({
      allow_no_indices: true,
      expand_wildcards: 'open',
      index: 'messages-*',
    })) as Record<string, unknown>;

    return Object.keys(response);
  } catch (error) {
    if (isElasticsearchNotFound(error)) {
      return [];
    }

    throw error;
  }
}

function isElasticsearchNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return false;
  }

  const meta = (error as { meta?: { statusCode?: number } }).meta;
  return meta?.statusCode === 404;
}

async function reserveHostPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        server.close(() => reject(new Error('Unable to reserve host port')));
        return;
      }

      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function stopContainers(containers: StartedTestContainer[]): Promise<void> {
  for (const container of [...containers].reverse()) {
    await container.stop({ remove: true, removeVolumes: true }).catch(() => undefined);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
