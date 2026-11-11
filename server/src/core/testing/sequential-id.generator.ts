import type { IdGenerator } from '../shared/interfaces/id-generator.interface';

export class SequentialIdGenerator implements IdGenerator {
  private readonly countersByPrefix = new Map<string, number>();

  next(prefix: string): string {
    const count = (this.countersByPrefix.get(prefix) ?? 0) + 1;
    this.countersByPrefix.set(prefix, count);
    return `${prefix}_${count}`;
  }
}
