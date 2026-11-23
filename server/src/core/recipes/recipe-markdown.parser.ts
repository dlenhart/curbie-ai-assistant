import {
  RECIPE_ITEM_PATTERN,
  RECIPE_KNOWN_BLOCKS,
  RECIPE_PROBLEM_MESSAGES,
  RECIPE_SERVES_PATTERN,
  RECIPE_SERVES_VALUE_PATTERN,
  RECIPE_STEP_MARKER_PATTERN,
} from '../../constants';
import { parseIngredientLine } from './ingredient-line.parser';
import type { IngredientLine } from './interfaces/ingredient-line.interface';
import type { ParsedRecipe } from './interfaces/parsed-recipe.interface';
import type { RecipeIssue } from './interfaces/recipe-issue.interface';
import type { RecipeParseResult } from './interfaces/recipe-parse-result.interface';
import type { RecipeSection } from './interfaces/recipe-section.interface';
import type { SectionBuilder } from './interfaces/section-builder.interface';
import type { RecipeBlockKind } from './types/recipe-block-kind.type';
import type { Quantity } from './types/quantity.type';

export function parseRecipeMarkdown(markdown: string): RecipeParseResult {
  const problems: RecipeIssue[] = [];
  const warnings: RecipeIssue[] = [];
  const ingredientSections: SectionBuilder<IngredientLine>[] = [];
  const stepSections: SectionBuilder<string>[] = [];
  const noteLines: string[] = [];
  const seenBlocks = new Set<RecipeBlockKind>();
  let title: string | null = null;
  let servings: Quantity | null = null;
  let block: RecipeBlockKind = 'preamble';
  let isTitleLast = false;
  let hasSeenFirstLine = false;

  const addProblem = (lineNumber: number | null, message: string): void => {
    problems.push({ lineNumber, message });
  };

  const openSection = <T>(sections: SectionBuilder<T>[], heading: string | null): SectionBuilder<T> => {
    const section: SectionBuilder<T> = { heading, items: [], firstItemLineNumber: null };
    sections.push(section);
    return section;
  };

  const currentSection = <T>(sections: SectionBuilder<T>[]): SectionBuilder<T> =>
    sections[sections.length - 1] ?? openSection(sections, null);

  const startSectionedHeading = <T>(sections: SectionBuilder<T>[], heading: string): void => {
    const first = sections[0];
    const isFirstSectionLoose = first !== undefined && first.heading === null && sections.length === 1;
    if (isFirstSectionLoose && first.items.length > 0 && first.firstItemLineNumber !== null) {
      addProblem(first.firstItemLineNumber, RECIPE_PROBLEM_MESSAGES.itemOutsideSection);
    }
    if (isFirstSectionLoose && first.items.length === 0) {
      sections.pop();
    }
    openSection(sections, heading);
  };

  const addItem = <T>(section: SectionBuilder<T>, item: T, lineNumber: number): void => {
    section.firstItemLineNumber ??= lineNumber;
    section.items.push(item);
  };

  const lines = markdown.split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      if (block === 'notes') noteLines.push('');
      return;
    }
    const lineNumber = index + 1;
    const wasTitleLast = isTitleLast;
    isTitleLast = false;

    if (!hasSeenFirstLine) {
      hasSeenFirstLine = true;
      if (line.startsWith('# ')) {
        title = line.slice(2).trim();
        isTitleLast = true;
        return;
      }
      addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.missingTitle);
      if (!line.startsWith('## ')) return;
    } else if (line.startsWith('# ')) {
      addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.extraTitle);
      return;
    }

    if (line.startsWith('## ')) {
      const name = line.slice(3).trim().toLowerCase();
      const known = RECIPE_KNOWN_BLOCKS[name];
      if (known === undefined) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.unknownHeading);
        block = 'ignored';
        return;
      }
      if (seenBlocks.has(known)) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.duplicateHeading);
        block = 'ignored';
        return;
      }
      seenBlocks.add(known);
      block = known;
      if (known === 'unsorted') addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.unsortedPresent);
      return;
    }

    if (block === 'preamble') {
      const servesMatch = RECIPE_SERVES_PATTERN.exec(line);
      if (!servesMatch || !wasTitleLast) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.strayLine);
        return;
      }
      const valueMatch = RECIPE_SERVES_VALUE_PATTERN.exec(servesMatch[1].trim());
      if (!valueMatch) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.badServings);
        return;
      }
      const low = Number(valueMatch[1]);
      const high = valueMatch[2] === undefined ? null : Number(valueMatch[2]);
      const isValid = low > 0 && (high === null || high > low);
      if (!isValid) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.badServings);
        return;
      }
      servings = high === null ? { kind: 'single', value: low } : { kind: 'range', low, high };
      return;
    }

    if (block === 'notes') {
      noteLines.push(line);
      return;
    }

    if (block === 'ingredients') {
      if (line.startsWith('### ')) {
        startSectionedHeading(ingredientSections, line.slice(4).trim());
        return;
      }
      const itemMatch = RECIPE_ITEM_PATTERN.exec(line);
      if (!itemMatch) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.strayLine);
        return;
      }
      const ingredient = parseIngredientLine(itemMatch[1].trim());
      if (ingredient.quantity === null) warnings.push({ lineNumber, message: RECIPE_PROBLEM_MESSAGES.noQuantity });
      addItem(currentSection(ingredientSections), ingredient, lineNumber);
      return;
    }

    if (block === 'steps') {
      if (line.startsWith('### ')) {
        startSectionedHeading(stepSections, line.slice(4).trim());
        return;
      }
      const section = currentSection(stepSections);
      const markerMatch = RECIPE_STEP_MARKER_PATTERN.exec(line);
      if (markerMatch) {
        addItem(section, line.slice(markerMatch[0].length).trim(), lineNumber);
        return;
      }
      if (section.items.length === 0) {
        addProblem(lineNumber, RECIPE_PROBLEM_MESSAGES.strayLine);
        return;
      }
      section.items[section.items.length - 1] += ` ${line.trim()}`;
    }
  });

  if (!hasSeenFirstLine) addProblem(null, RECIPE_PROBLEM_MESSAGES.missingTitle);
  const ingredientCount = ingredientSections.reduce((total, section) => total + section.items.length, 0);
  const stepCount = stepSections.reduce((total, section) => total + section.items.length, 0);
  if (ingredientCount === 0) addProblem(null, RECIPE_PROBLEM_MESSAGES.noIngredients);
  if (stepCount === 0) addProblem(null, RECIPE_PROBLEM_MESSAGES.noSteps);

  const recipe: ParsedRecipe = {
    title,
    servings,
    ingredientSections: finishSections(ingredientSections),
    stepSections: finishSections(stepSections),
    notes: noteLines.join('\n').trim(),
  };
  return { recipe, problems: sortByLineNumber(problems), warnings };
}

function finishSections<T>(builders: readonly SectionBuilder<T>[]): RecipeSection<T>[] {
  return builders.map((builder) => ({ heading: builder.heading, items: builder.items }));
}

function sortByLineNumber(issues: readonly RecipeIssue[]): RecipeIssue[] {
  const rank = (issue: RecipeIssue): number => issue.lineNumber ?? Number.POSITIVE_INFINITY;
  return [...issues].sort((left, right) => rank(left) - rank(right));
}
