import { InMemorySettingsRepository } from './in-memory-settings.repository';
import { describeSettingsRepositoryContract } from './settings-repository.contract';

describeSettingsRepositoryContract('InMemorySettingsRepository', () => new InMemorySettingsRepository());
