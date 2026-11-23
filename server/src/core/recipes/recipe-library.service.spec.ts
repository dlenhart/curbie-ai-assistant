import { RECIPE_PROBLEM_MESSAGES } from '../../constants';
import { FakeRecipeFileStore } from '../testing/fake-recipe-file.store';
import { FixedClock } from '../testing/fixed.clock';
import { InMemoryRecipeRepository } from '../testing/in-memory-recipe.repository';
import { UnknownRecipeError } from './errors/unknown-recipe.error';
import { RecipeStateError } from './errors/recipe-state.error';
import { RecipeLibraryService } from './recipe-library.service';

const CLEAN = '# Pancakes\n## Ingredients\n- 2 cups flour\n## Steps\n1. Mix.\n';
const EDITED = '# Pancakes\n## Ingredients\n- 2 cups flour\n- 1 egg\n## Steps\n1. Mix.\n';
const UNSORTED = '# Pancakes\n## Ingredients\n- 2 cups flour\n## Steps\n1. Mix.\n## Unsorted\nmystery\n';

function build() {
  const repository = new InMemoryRecipeRepository();
  const files = new FakeRecipeFileStore(new Map());
  const clock = new FixedClock(new Date('2026-11-23T12:00:00.000Z'));
  repository.create({
    id: 'r1',
    title: 'Scanned title',
    draftMarkdown: '# Scanned title\n',
    ocrLines: [],
    pages: [{ pageNumber: 1, originalPath: 'o', displayPath: 'd', sha256: 'abc' }],
    createdAt: '2026-11-23T11:00:00.000Z',
  });
  const service = new RecipeLibraryService({ repository, files, clock });
  return { repository, files, service };
}

describe('RecipeLibraryService', () => {
  it('saveDraft stores any text, even with problems', () => {
    const { service } = build();

    service.saveDraft('r1', UNSORTED);

    const stored = service.find('r1');
    expect(stored?.draftMarkdown).toBe(UNSORTED);
    expect(stored?.title).toBe('Pancakes');
    expect(stored?.updatedAt).toBe('2026-11-23T12:00:00.000Z');
  });

  it('saveDraft and approve store browser CRLF text with LF line endings', () => {
    const { service } = build();

    service.saveDraft('r1', UNSORTED.replace(/\n/g, '\r\n'));
    expect(service.find('r1')?.draftMarkdown).toBe(UNSORTED);

    expect(service.approve('r1', CLEAN.replace(/\n/g, '\r\n'))).toEqual({ isApproved: true });
    expect(service.find('r1')?.draftMarkdown).toBe(CLEAN);
    expect(service.find('r1')?.approvedMarkdown).toBe(CLEAN);
  });

  it('saveDraft keeps the stored title when the text has none', () => {
    const { service } = build();

    service.saveDraft('r1', 'just words');

    expect(service.find('r1')?.title).toBe('Scanned title');
  });

  it('find returns undefined for an unknown id and mutators throw UnknownRecipeError', () => {
    const { service } = build();

    expect(service.find('nope')).toBeUndefined();
    expect(() => service.saveDraft('nope', CLEAN)).toThrow(UnknownRecipeError);
    expect(() => service.approve('nope', CLEAN)).toThrow(UnknownRecipeError);
    expect(() => service.discardEdit('nope')).toThrow(UnknownRecipeError);
    expect(() => service.discard('nope')).toThrow(UnknownRecipeError);
    expect(() => service.delete('nope')).toThrow(UnknownRecipeError);
  });

  it('approve refuses a draft with Unsorted, keeps the saved draft, and does not index it', () => {
    const { service } = build();

    const outcome = service.approve('r1', UNSORTED);

    expect(outcome).toEqual({
      isApproved: false,
      problems: [{ lineNumber: 6, message: RECIPE_PROBLEM_MESSAGES.unsortedPresent }],
    });
    expect(service.find('r1')?.draftMarkdown).toBe(UNSORTED);
    expect(service.find('r1')?.status).toBe('needs_review');
    expect(service.find('r1')?.approvedMarkdown).toBeNull();
  });

  it('approve copies a clean draft, indexes it, and search finds it', () => {
    const { service, repository } = build();

    const outcome = service.approve('r1', CLEAN);

    expect(outcome).toEqual({ isApproved: true });
    expect(service.find('r1')?.status).toBe('approved');
    expect(service.find('r1')?.approvedMarkdown).toBe(CLEAN);
    expect(repository.search('flour').map((hit) => hit.id)).toEqual(['r1']);
  });

  it('editing an approved recipe leaves the approved copy (and search) unchanged until re-approved', () => {
    const { service, repository } = build();
    service.approve('r1', CLEAN);

    service.saveDraft('r1', EDITED);

    expect(service.find('r1')?.approvedMarkdown).toBe(CLEAN);
    expect(repository.search('egg')).toEqual([]);
    service.approve('r1', EDITED);
    expect(repository.search('egg').map((hit) => hit.id)).toEqual(['r1']);
  });

  it('discardEdit restores the approved draft', () => {
    const { service } = build();
    service.approve('r1', CLEAN);
    service.saveDraft('r1', EDITED);

    service.discardEdit('r1');

    expect(service.find('r1')?.draftMarkdown).toBe(CLEAN);
  });

  it('saveDraft on an approved recipe keeps the approved title', () => {
    const { service } = build();
    service.approve('r1', CLEAN);

    service.saveDraft('r1', EDITED.replace('# Pancakes', '# Waffles'));

    expect(service.find('r1')?.title).toBe('Pancakes');
    expect(service.summaries()[0].title).toBe('Pancakes');
  });

  it('discardEdit restores the title from the approved copy', () => {
    const { service, repository } = build();
    service.approve('r1', CLEAN);
    repository.approve('r1', CLEAN, 'Drifted title', { title: 'Pancakes', ingredients: '', steps: '', notes: '' }, '2026-11-23T12:00:00.000Z');
    service.saveDraft('r1', EDITED);

    service.discardEdit('r1');

    expect(service.find('r1')?.title).toBe('Pancakes');
  });

  it('discardEdit refuses a never-approved recipe and keeps its draft', () => {
    const { service } = build();
    service.saveDraft('r1', EDITED);

    expect(() => service.discardEdit('r1')).toThrow(RecipeStateError);

    expect(service.find('r1')?.draftMarkdown).toBe(EDITED);
  });

  it('discard moves photos and removes a draft; refuses an approved recipe', () => {
    const { service, files } = build();

    service.discard('r1');

    expect(files.discardedRecipeIds).toEqual(['r1']);
    expect(service.find('r1')).toBeUndefined();

    const second = build();
    second.service.approve('r1', CLEAN);
    expect(() => second.service.discard('r1')).toThrow(RecipeStateError);
    expect(second.files.discardedRecipeIds).toEqual([]);
    expect(second.service.find('r1')).toBeDefined();
  });

  it('delete moves photos and removes an approved recipe; refuses a never-approved one', () => {
    const { service, files, repository } = build();
    expect(() => service.delete('r1')).toThrow(RecipeStateError);

    service.approve('r1', CLEAN);
    service.delete('r1');

    expect(files.discardedRecipeIds).toEqual(['r1']);
    expect(service.find('r1')).toBeUndefined();
    expect(repository.search('flour')).toEqual([]);
  });

  it('delegates summaries, counts, and the latest scan report to the repository', () => {
    const { service, repository } = build();
    repository.saveScanReport({ finishedAt: 'x', importedCount: 1, problems: [] });

    expect(service.summaries().map((summary) => summary.id)).toEqual(['r1']);
    expect(service.counts()).toEqual({ needsReview: 1, approved: 0 });
    expect(service.latestScanReport()?.importedCount).toBe(1);
  });
});
