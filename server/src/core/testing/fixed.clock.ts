import type { Clock } from '../shared/interfaces/clock.interface';

export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceBySeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
