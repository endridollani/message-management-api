import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
  HealthCheckError,
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Connection, ConnectionStates } from 'mongoose';

@Injectable()
export class MongoHealthIndicator {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isReady(): HealthIndicatorResult<'mongodb'> {
    const indicator = this.healthIndicatorService.check('mongodb');

    if (this.connection.readyState === ConnectionStates.connected) {
      return indicator.up({ readyState: this.connection.readyState });
    }

    throw new HealthCheckError(
      'MongoDB is not ready',
      indicator.down({ readyState: this.connection.readyState }),
    );
  }
}
