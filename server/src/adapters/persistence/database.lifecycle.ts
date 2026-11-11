import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type Database from 'better-sqlite3';
import { DATABASE } from '../../constants';

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database.Database) {}

  onApplicationShutdown(): void {
    this.database.close();
  }
}
