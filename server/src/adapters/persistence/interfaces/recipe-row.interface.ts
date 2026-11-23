import type { RecipeStatus } from '../../../core/recipes/types/recipe-status.type';

export interface RecipeRow {
  id: string;
  title: string;
  status: RecipeStatus;
  draft_markdown: string;
  approved_markdown: string | null;
  ocr_lines: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}
