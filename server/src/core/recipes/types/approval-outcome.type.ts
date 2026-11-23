import type { RecipeIssue } from '../interfaces/recipe-issue.interface';

export type ApprovalOutcome =
  | { readonly isApproved: true }
  | { readonly isApproved: false; readonly problems: readonly RecipeIssue[] };
