import type { Clock } from '../../../core/shared/interfaces/clock.interface';

export interface SkillAdapterDependencies {
  readonly clock: Clock;
}
