import { InMemoryTranscriptRepository } from './in-memory-transcript.repository';
import { describeTranscriptRepositoryContract } from './transcript-repository.contract';

describeTranscriptRepositoryContract('InMemoryTranscriptRepository', () => new InMemoryTranscriptRepository());
