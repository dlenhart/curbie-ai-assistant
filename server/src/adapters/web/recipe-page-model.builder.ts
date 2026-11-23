import { OCR_LOW_CONFIDENCE_THRESHOLD, RECIPE_PAGE_MESSAGES } from '../../constants';
import type { RecipeIssue } from '../../core/recipes/interfaces/recipe-issue.interface';
import type { StoredRecipe } from '../../core/recipes/interfaces/stored-recipe.interface';
import { parseRecipeMarkdown } from '../../core/recipes/recipe-markdown.parser';
import type { RecipePageImage } from './interfaces/recipe-page-image.interface';
import type { RecipeReviewPageModel } from './interfaces/recipe-review-page-model.interface';
import type { RecipeViewPageModel } from './interfaces/recipe-view-page-model.interface';
import type { RecipesPageInput } from './interfaces/recipes-page-input.interface';
import type { RecipesPageModel } from './interfaces/recipes-page-model.interface';
import type { RecipePageStatus } from './types/recipe-page-status.type';
import { buildNavigation } from './navigation.builder';

export function buildRecipesPageModel(input: RecipesPageInput): RecipesPageModel {
  const scanRunningMessage = input.isScanRunning ? RECIPE_PAGE_MESSAGES.scanRunning : null;
  return {
    pageTitle: 'Curbie · Recipes',
    navigation: buildNavigation('manage'),
    scriptPath: '/static/recipes.js',
    needsReview: input.summaries.filter((summary) => summary.status === 'needs_review'),
    approved: input.summaries.filter((summary) => summary.status === 'approved'),
    scanProblems: input.scanReport?.problems ?? [],
    isScanRunning: input.isScanRunning,
    statusMessage: findRecipePageMessage(input.statusFlag) ?? scanRunningMessage,
  };
}

export function buildRecipeReviewPageModel(recipe: StoredRecipe, statusMessage: string | null): RecipeReviewPageModel {
  const parsed = parseRecipeMarkdown(recipe.draftMarkdown);
  const isApproved = recipe.approvedAt !== null;
  return {
    pageTitle: `Curbie · ${recipe.title}`,
    navigation: buildNavigation('manage'),
    scriptPath: '/static/recipe-review.js',
    recipeId: recipe.id,
    title: recipe.title,
    isApproved,
    hasPendingEdit: isApproved && recipe.draftMarkdown !== recipe.approvedMarkdown,
    draftMarkdown: recipe.draftMarkdown,
    problems: parsed.problems.map(formatIssue),
    warnings: parsed.warnings.map(formatIssue),
    ocrLines: recipe.ocrLines.map((line, index) => ({
      number: index + 1,
      text: line.text,
      isLowConfidence: !isApproved && line.confidence < OCR_LOW_CONFIDENCE_THRESHOLD,
    })),
    pageImages: buildPageImages(recipe),
    statusMessage,
  };
}

export function buildRecipeViewPageModel(recipe: StoredRecipe): RecipeViewPageModel {
  return {
    pageTitle: `Curbie · ${recipe.title}`,
    navigation: buildNavigation('chat'),
    title: recipe.title,
    approvedMarkdown: recipe.approvedMarkdown ?? '',
    pageImages: buildPageImages(recipe),
  };
}

export function findRecipePageMessage(statusFlag: unknown): string | null {
  if (typeof statusFlag !== 'string' || !Object.hasOwn(RECIPE_PAGE_MESSAGES, statusFlag)) return null;
  return RECIPE_PAGE_MESSAGES[statusFlag as RecipePageStatus];
}

function buildPageImages(recipe: StoredRecipe): RecipePageImage[] {
  return recipe.pages.map((page) => ({
    href: `/recipes/${recipe.id}/pages/${page.pageNumber}`,
    label: `Page ${page.pageNumber}`,
  }));
}

function formatIssue(issue: RecipeIssue): string {
  return issue.lineNumber === null ? issue.message : `Line ${issue.lineNumber}: ${issue.message}`;
}
