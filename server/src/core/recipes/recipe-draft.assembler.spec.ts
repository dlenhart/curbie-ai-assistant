import type { OcrLine } from './interfaces/ocr-line.interface';
import { assembleRecipeDraft } from './recipe-draft.assembler';
import { parseRecipeMarkdown } from './recipe-markdown.parser';

function toLines(texts: readonly string[]): OcrLine[] {
  return texts.map((text) => ({ text, confidence: 1, pageNumber: 1 }));
}

describe('assembleRecipeDraft', () => {
  it('builds the Texas sheet cake draft with Cake and Frosting sections', () => {
    const lines = toLines([
      'Texas Sheet Cake',
      'Serves 24',
      'Cake',
      '2 cups flour',
      '• 1/2 cup butter',
      'Frosting',
      '1/2 cup butter',
      '1 T cocoa',
      'Cake',
      '1. Heat oven to',
      '350.',
      'Frosting',
      '1. Melt butter with cocoa.',
      'Grandma used Crisco.',
    ]);
    const labels = {
      title: [1],
      servings: 2,
      headings: [3, 6, 9, 12],
      ingredients: [4, 5, 7, 8],
      steps: [10, 11, 13],
    };

    expect(assembleRecipeDraft(lines, labels, 'Untitled')).toBe(`# Texas Sheet Cake
Serves: 24

## Ingredients
### Cake
- 2 cups flour
- 1/2 cup butter
### Frosting
- 1/2 cup butter
- 1 T cocoa

## Steps
### Cake
1. Heat oven to 350.
### Frosting
1. Melt butter with cocoa.

## Unsorted
Serves 24
Grandma used Crisco.
`);
  });

  it('keeps the original servings line under Unsorted beside the extracted number so the owner confirms it', () => {
    const lines = toLines(['Cookies', 'Makes 2 dozen', '1 egg', 'Bake.']);
    const labels = { title: [1], servings: 2, headings: [], ingredients: [3], steps: [4] };

    expect(assembleRecipeDraft(lines, labels, 'x')).toBe(
      '# Cookies\nServes: 2\n\n## Ingredients\n- 1 egg\n\n## Steps\n1. Bake.\n\n## Unsorted\nMakes 2 dozen\n',
    );
  });

  it('merges a wrapped step line and splits on a sentence end or a leading number', () => {
    const lines = toLines(['Mix the flour', 'and the eggs', 'Bake it', '2) Cool it.', 'Serve it.']);
    const labels = { title: [], servings: null, headings: [], ingredients: [], steps: [1, 2, 3, 4, 5] };

    const draft = assembleRecipeDraft(lines, labels, 'Cake');

    expect(draft).toContain('## Steps\n1. Mix the flour and the eggs Bake it\n2. Cool it.\n3. Serve it.\n');
  });

  it('uses the fallback title when no title line is labelled', () => {
    const labels = { title: [], servings: null, headings: [], ingredients: [1], steps: [2] };

    expect(assembleRecipeDraft(toLines(['1 egg', 'Cook.']), labels, 'IMG_0001')).toMatch(/^# IMG_0001\n/);
  });

  it('puts a servings line with no number, and a trailing heading, under Unsorted', () => {
    const lines = toLines(['T', 'Serves a crowd', '1 egg', 'Cook.', 'Notes']);
    const labels = { title: [1], servings: 2, headings: [5], ingredients: [3], steps: [4] };

    expect(assembleRecipeDraft(lines, labels, 'x')).toBe(
      '# T\n\n## Ingredients\n- 1 egg\n\n## Steps\n1. Cook.\n\n## Unsorted\nServes a crowd\nNotes\n',
    );
  });

  it('puts everything under Unsorted when labels are null', () => {
    expect(assembleRecipeDraft(toLines(['a', 'b']), null, 'IMG_0002')).toBe(
      '# IMG_0002\n\n## Ingredients\n\n## Steps\n\n## Unsorted\na\nb\n',
    );
  });

  it('round-trips: the parsed draft has only the unsortedPresent problem when Unsorted exists', () => {
    const lines = toLines(['Toast', '2 slices bread', 'Toast it.', 'stray']);
    const labels = { title: [1], servings: null, headings: [], ingredients: [2], steps: [3] };

    const result = parseRecipeMarkdown(assembleRecipeDraft(lines, labels, 'x'));

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].message).toContain('Unsorted');
  });
});
