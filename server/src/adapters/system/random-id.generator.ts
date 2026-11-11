import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../core/shared/interfaces/id-generator.interface';

export class RandomIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}
