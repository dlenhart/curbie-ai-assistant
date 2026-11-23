import type { HouseholdSettingsReader } from '../../settings/interfaces/household-settings-reader.interface';
import type { Clock } from '../../shared/interfaces/clock.interface';
import type { IdGenerator } from '../../shared/interfaces/id-generator.interface';
import type { SerialTaskQueue } from '../../shared/serial-task.queue';
import type { RecipeLineLabeller } from '../recipe-line.labeller';
import type { OcrPort } from './ocr-port.interface';
import type { RecipeFileStore } from './recipe-file-store.interface';
import type { RecipeRepository } from './recipe-repository.interface';

export interface RecipeInboxScannerDependencies {
  readonly files: RecipeFileStore;
  readonly ocr: OcrPort;
  readonly labeller: RecipeLineLabeller;
  readonly repository: RecipeRepository;
  readonly settings: HouseholdSettingsReader;
  readonly generationQueue: SerialTaskQueue;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}
