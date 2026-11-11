import type { Clock } from '../../core/shared/interfaces/clock.interface';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
