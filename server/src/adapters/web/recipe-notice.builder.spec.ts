import { buildRecipeNotice } from './recipe-notice.builder';

describe('buildRecipeNotice', () => {
  it('joins the review count and the scan problem count', () => {
    expect(buildRecipeNotice({ needsReviewCount: 4, scanProblemCount: 1 })).toBe(
      '▲ 4 new recipes ready to review · 1 scan problem',
    );
  });

  it('shows only the review part when the scan had no problems', () => {
    expect(buildRecipeNotice({ needsReviewCount: 1, scanProblemCount: 0 })).toBe('▲ 1 new recipe ready to review');
  });

  it('shows only the scan problem part when nothing needs review', () => {
    expect(buildRecipeNotice({ needsReviewCount: 0, scanProblemCount: 2 })).toBe('▲ 2 scan problems');
  });

  it('returns null when nothing is waiting', () => {
    expect(buildRecipeNotice({ needsReviewCount: 0, scanProblemCount: 0 })).toBeNull();
  });

  it('uses the plural for several recipes and the singular for one scan problem', () => {
    expect(buildRecipeNotice({ needsReviewCount: 2, scanProblemCount: 1 })).toBe(
      '▲ 2 new recipes ready to review · 1 scan problem',
    );
  });
});
