import { SCAN_PROBLEM_MESSAGES } from '../../constants';
import { ModelUnavailableError } from '../model/errors/model-unavailable.error';
import { FakeRecipeFileStore } from '../testing/fake-recipe-file.store';
import { FixedClock } from '../testing/fixed.clock';
import { FixedSettingsReader } from '../testing/fixed-settings.reader';
import { InMemoryRecipeRepository } from '../testing/in-memory-recipe.repository';
import { ScriptedOcrPort } from '../testing/scripted-ocr.port';
import { ScriptedModel, answerResponse } from '../testing/scripted.model';
import { SequentialIdGenerator } from '../testing/sequential-id.generator';
import { SerialTaskQueue } from '../shared/serial-task.queue';
import { OcrFailedError } from './errors/ocr-failed.error';
import { OcrUnavailableError } from './errors/ocr-unavailable.error';
import type { NewRecipe } from './interfaces/new-recipe.interface';
import type { RecognizedLine } from './interfaces/recognized-line.interface';
import type { ScanReport } from './interfaces/scan-report.interface';
import { RecipeInboxScanner } from './recipe-inbox.scanner';
import { RecipeLineLabeller } from './recipe-line.labeller';
import type { ScanStart } from './types/scan-start.type';

const recognized = (...texts: string[]): RecognizedLine[] => texts.map((text) => ({ text, confidence: 0.9 }));
const goodLabels = { title: [1], servings: null, headings: [], ingredients: [2], steps: [3] };

class FailingFirstCreateRepository extends InMemoryRecipeRepository {
  private hasFailed = false;

  override create(recipe: NewRecipe): void {
    if (!this.hasFailed) {
      this.hasFailed = true;
      throw new Error('disk full');
    }
    super.create(recipe);
  }
}

class SpyQueue extends SerialTaskQueue {
  runCount = 0;

  override run<T>(task: () => Promise<T>): Promise<T> {
    this.runCount += 1;
    return super.run(task);
  }
}

function build(options: {
  inbox: Record<string, string>;
  ocr: Record<string, readonly RecognizedLine[] | Error>;
  modelResponses?: Array<ReturnType<typeof answerResponse> | Error>;
  repository?: InMemoryRecipeRepository;
}) {
  const files = new FakeRecipeFileStore(new Map(Object.entries(options.inbox)));
  const model = new ScriptedModel(options.modelResponses ?? []);
  const repository = options.repository ?? new InMemoryRecipeRepository();
  const ocr = new ScriptedOcrPort(new Map(Object.entries(options.ocr)));
  const queue = new SpyQueue();
  const scanner = new RecipeInboxScanner({
    files,
    ocr,
    labeller: new RecipeLineLabeller(model),
    repository,
    settings: new FixedSettingsReader({ modelName: 'qwen', timeZone: 'UTC', units: 'imperial' }),
    generationQueue: queue,
    clock: new FixedClock(new Date('2026-11-23T12:00:00Z')),
    idGenerator: new SequentialIdGenerator(),
  });
  return { files, model, repository, queue, scanner, ocr };
}

async function runScan(scanner: RecipeInboxScanner): Promise<ScanReport> {
  const start: ScanStart = scanner.start();
  if (start.kind !== 'started') throw new Error('Scan did not start.');
  return start.completion;
}

describe('RecipeInboxScanner', () => {
  it('imports a two-page recipe as needs_review with its draft, pages, OCR lines, and a report of 1 imported', async () => {
    const { scanner, repository, files } = build({
      inbox: { 'Toast-1.jpg': 'h1', 'Toast-2.jpg': 'h2' },
      ocr: { 'Toast-1.jpg': recognized('Toast', '2 slices bread'), 'Toast-2.jpg': recognized('Toast it.') },
      modelResponses: [answerResponse(goodLabels)],
    });

    const report = await runScan(scanner);

    expect(report).toEqual({ finishedAt: '2026-11-23T12:00:00.000Z', importedCount: 1, problems: [] });
    expect(repository.latestScanReport()).toEqual(report);
    const stored = repository.findById('recipe_1');
    expect(stored?.status).toBe('needs_review');
    expect(stored?.title).toBe('Toast');
    expect(stored?.draftMarkdown).toContain('- 2 slices bread');
    expect(stored?.draftMarkdown).toContain('Toast it.');
    expect(stored?.ocrLines).toEqual([
      { text: 'Toast', confidence: 0.9, pageNumber: 1 },
      { text: '2 slices bread', confidence: 0.9, pageNumber: 1 },
      { text: 'Toast it.', confidence: 0.9, pageNumber: 2 },
    ]);
    expect(stored?.pages.map((page) => page.sha256)).toEqual(['h1', 'h2']);
    expect(files.committedRecipeIds).toEqual(['recipe_1']);
  });

  it('runs the labelling model call through the generation queue', async () => {
    const { scanner, queue } = build({
      inbox: { 'Toast.jpg': 'h1' },
      ocr: { 'Toast.jpg': recognized('Toast', '2 slices bread', 'Toast it.') },
      modelResponses: [answerResponse(goodLabels)],
    });

    await runScan(scanner);

    expect(queue.runCount).toBe(1);
  });

  it('reports a duplicate photo already in the library and leaves the group in the inbox', async () => {
    const { scanner, repository, files } = build({
      inbox: { 'Toast.jpg': 'h1' },
      ocr: { 'Toast.jpg': recognized('Toast', 'bread', 'Toast it.') },
      modelResponses: [answerResponse(goodLabels)],
    });
    await runScan(scanner);
    const second = build({ inbox: { 'Toast.jpg': 'h1' }, ocr: {} });
    second.repository.create(repository.findById('recipe_1')!);

    const report = await runScan(second.scanner);

    expect(report.importedCount).toBe(0);
    expect(report.problems).toEqual([{ subject: 'Toast.jpg', reason: SCAN_PROBLEM_MESSAGES.duplicatePhoto }]);
    expect(second.files.committedRecipeIds).toEqual([]);
    expect(files.committedRecipeIds).toHaveLength(1);
  });

  it('reports the same photo twice in one scan as a duplicate', async () => {
    const { scanner, repository } = build({
      inbox: { 'Apple.jpg': 'same', 'Zebra.jpg': 'same' },
      ocr: { 'Apple.jpg': recognized('Apple', 'apples', 'Bake.'), 'Zebra.jpg': recognized('Zebra', 'x', 'y') },
      modelResponses: [answerResponse(goodLabels)],
    });

    const report = await runScan(scanner);

    expect(report.importedCount).toBe(1);
    expect(report.problems).toEqual([{ subject: 'Zebra.jpg', reason: SCAN_PROBLEM_MESSAGES.duplicatePhoto }]);
    expect(repository.listSummaries()).toHaveLength(1);
  });

  it('reports every group with modelUnavailable when Ollama is down, abandons work, and still saves the report', async () => {
    const down = new ModelUnavailableError('down');
    const { scanner, repository, files } = build({
      inbox: { 'Apple.jpg': 'h1', 'Zebra.jpg': 'h2' },
      ocr: { 'Apple.jpg': recognized('Apple', 'a', 'b'), 'Zebra.jpg': recognized('Zebra', 'x', 'y') },
      modelResponses: [down, down],
    });

    const report = await runScan(scanner);

    expect(report.importedCount).toBe(0);
    expect(report.problems).toEqual([
      { subject: 'Apple', reason: SCAN_PROBLEM_MESSAGES.modelUnavailable },
      { subject: 'Zebra', reason: SCAN_PROBLEM_MESSAGES.modelUnavailable },
    ]);
    expect(files.abandonedRecipeIds).toEqual(['recipe_1', 'recipe_2']);
    expect(repository.latestScanReport()).toEqual(report);
  });

  it('reports ocrUnavailable when the helper is missing, and noText for a blank card', async () => {
    const { scanner } = build({
      inbox: { 'Apple.jpg': 'h1', 'Blank.jpg': 'h2', 'Cake.jpg': 'h3' },
      ocr: {
        'Apple.jpg': new OcrUnavailableError('missing'),
        'Blank.jpg': recognized(),
        'Cake.jpg': new OcrFailedError('bad'),
      },
    });

    const report = await runScan(scanner);

    expect(report.problems).toEqual([
      { subject: 'Apple', reason: SCAN_PROBLEM_MESSAGES.ocrUnavailable },
      { subject: 'Blank', reason: SCAN_PROBLEM_MESSAGES.noText },
      { subject: 'Cake', reason: SCAN_PROBLEM_MESSAGES.ocrFailed },
    ]);
  });

  it('includes the grouper problems in the report', async () => {
    const { scanner } = build({ inbox: { 'notes.txt': 'h1' }, ocr: {} });

    const report = await runScan(scanner);

    expect(report.problems).toEqual([{ subject: 'notes.txt', reason: SCAN_PROBLEM_MESSAGES.unsupported }]);
  });

  it('returns already_running while a scan is in progress and clears the flag afterwards', async () => {
    const { scanner } = build({ inbox: {}, ocr: {} });

    const first = scanner.start();
    const second = scanner.start();

    expect(scanner.isScanning()).toBe(true);
    expect(second).toEqual({ kind: 'already_running' });
    if (first.kind === 'started') await first.completion;
    expect(scanner.isScanning()).toBe(false);
  });

  it('clears the scanning flag and rejects when an unexpected error occurs, abandoning work', async () => {
    const { scanner, files, repository } = build({
      inbox: { 'Apple.jpg': 'h1' },
      ocr: { 'Apple.jpg': new Error('boom') },
    });

    await expect(runScan(scanner)).rejects.toThrow('boom');

    expect(scanner.isScanning()).toBe(false);
    expect(repository.latestScanReport()).toEqual({
      finishedAt: '2026-11-23T12:00:00.000Z',
      importedCount: 0,
      problems: [],
    });
    expect(files.abandonedRecipeIds).toEqual(['recipe_1']);
  });

  it('uses the group name as the title when no title is labelled', async () => {
    const { scanner, repository } = build({
      inbox: { 'Grandma Toast.jpg': 'h1' },
      ocr: { 'Grandma Toast.jpg': recognized('2 slices bread', 'Toast it.') },
      modelResponses: [answerResponse({ title: [], servings: null, headings: [], ingredients: [1], steps: [2] })],
    });

    await runScan(scanner);

    expect(repository.findById('recipe_1')?.title).toBe('Grandma Toast');
  });

  it('reports saveFailed, keeps the moved photos, and continues when the repository cannot create a recipe', async () => {
    const { scanner, repository, files } = build({
      inbox: { 'Apple.jpg': 'h1', 'Zebra.jpg': 'h2' },
      ocr: { 'Apple.jpg': recognized('Apple', 'a', 'b'), 'Zebra.jpg': recognized('Zebra', 'x', 'y') },
      modelResponses: [answerResponse(goodLabels), answerResponse(goodLabels)],
      repository: new FailingFirstCreateRepository(),
    });

    const report = await runScan(scanner);

    expect(report.importedCount).toBe(1);
    expect(report.problems).toEqual([{ subject: 'Apple', reason: SCAN_PROBLEM_MESSAGES.saveFailed }]);
    expect(files.abandonedRecipeIds).toEqual([]);
    expect(files.committedRecipeIds).toEqual(['recipe_1', 'recipe_2']);
    expect(repository.findById('recipe_2')?.title).toBe('Zebra');
    expect(repository.latestScanReport()).toEqual(report);
  });

  it('gives OCR the work display path for each page', async () => {
    const { scanner, ocr, files } = build({
      inbox: { 'Toast-1.jpg': 'h1', 'Toast-2.jpg': 'h2' },
      ocr: { 'Toast-1.jpg': recognized('Toast', 'bread'), 'Toast-2.jpg': recognized('Toast it.') },
      modelResponses: [answerResponse(goodLabels)],
    });

    await runScan(scanner);

    expect(ocr.receivedCalls.map((call) => call.displayCopyPath)).toEqual([
      files.workDisplayPath('recipe_1', 1),
      files.workDisplayPath('recipe_1', 2),
    ]);
  });
});
