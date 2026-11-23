import { MAX_RECIPE_SCALE_FACTOR, RECIPE_SCALE_FACTOR_NAMES } from '../../constants';
import type { ParsedRecipe } from '../../core/recipes/interfaces/parsed-recipe.interface';
import type { RecipeRepository } from '../../core/recipes/interfaces/recipe-repository.interface';
import { parseRecipeMarkdown } from '../../core/recipes/recipe-markdown.parser';
import { scaleRecipeMarkdown } from '../../core/recipes/recipe.scaler';
import type { SkillAdapter } from '../../core/skills/interfaces/skill-adapter.interface';
import type { ToolResult } from '../../core/skills/interfaces/tool-result.interface';
import { RecipeToolError } from './errors/recipe-tool.error';

export class RecipesAdapter implements SkillAdapter {
  readonly name = 'recipes';

  constructor(private readonly repository: RecipeRepository) {}

  async execute(toolName: string, toolArguments: Record<string, unknown>): Promise<ToolResult> {
    if (toolName === 'search_recipes') return this.search(requireString(toolArguments, 'query'));
    if (toolName === 'get_recipe') return this.get(requireString(toolArguments, 'recipe_id'));
    if (toolName === 'scale_recipe') return this.scale(requireString(toolArguments, 'recipe_id'), toolArguments);
    throw new RecipeToolError(`Recipes has no tool named "${toolName}".`);
  }

  private search(query: string): ToolResult {
    const hits = this.repository.search(query);
    const content =
      hits.length === 0
        ? `No approved recipes match "${query}".`
        : hits.map((hit) => `${hit.id} | ${hit.title} | ${hit.ingredientPreview}`).join('\n');
    return { title: 'Recipe search', content, requiresQuote: false };
  }

  private get(recipeId: string): ToolResult {
    const markdown = this.requireApprovedMarkdown(recipeId);
    return recipeResult(recipeId, requireTitle(parseRecipeMarkdown(markdown).recipe, recipeId), markdown);
  }

  private scale(recipeId: string, toolArguments: Record<string, unknown>): ToolResult {
    const markdown = this.requireApprovedMarkdown(recipeId);
    const recipe = parseRecipeMarkdown(markdown).recipe;
    const factor = scaleFactorFor(recipe, toolArguments);
    if (factor > MAX_RECIPE_SCALE_FACTOR) {
      throw new RecipeToolError(`Recipes can be scaled by at most ${MAX_RECIPE_SCALE_FACTOR}, got ${factor}.`);
    }
    const heading = `${requireTitle(recipe, recipeId)} · ${describeScaleFactor(factor)}`;
    return recipeResult(recipeId, heading, scaleRecipeMarkdown(markdown, factor));
  }

  private requireApprovedMarkdown(recipeId: string): string {
    const markdown = this.repository.findById(recipeId)?.approvedMarkdown;
    if (markdown === undefined || markdown === null) {
      throw new RecipeToolError(`No approved recipe with id "${recipeId}".`);
    }
    return markdown;
  }
}

function recipeResult(recipeId: string, heading: string, markdown: string): ToolResult {
  const href = `/recipes/${recipeId}`;
  return {
    title: `Recipe: ${heading}`,
    content: markdown,
    requiresQuote: false,
    href,
    card: { heading, body: markdown, href },
  };
}

function scaleFactorFor(recipe: ParsedRecipe, toolArguments: Record<string, unknown>): number {
  const { factor, servings } = toolArguments;
  if ((factor === undefined) === (servings === undefined)) {
    throw new RecipeToolError('Give exactly one of factor or servings.');
  }
  if (factor !== undefined) return requirePositiveNumber(factor, 'factor');
  if (typeof servings !== 'number' || !Number.isInteger(servings) || servings < 1) {
    throw new RecipeToolError('servings must be a whole number of at least 1.');
  }
  if (recipe.servings?.kind !== 'single') {
    throw new RecipeToolError('This recipe has no single Serves number, so scale it by factor instead.');
  }
  return servings / recipe.servings.value;
}

function describeScaleFactor(factor: number): string {
  const rounded = Math.round(factor * 100) / 100;
  return RECIPE_SCALE_FACTOR_NAMES.get(rounded) ?? `×${rounded}`;
}

function requirePositiveNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RecipeToolError(`${name} must be a number greater than 0.`);
  }
  return value;
}

function requireString(toolArguments: Record<string, unknown>, name: string): string {
  const value = toolArguments[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RecipeToolError(`${name} must be a non-blank string.`);
  }
  return value;
}

function requireTitle(recipe: ParsedRecipe, recipeId: string): string {
  if (recipe.title === null) throw new RecipeToolError(`Approved recipe "${recipeId}" has no title.`);
  return recipe.title;
}
