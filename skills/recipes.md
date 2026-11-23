---
name: recipes
description: The household's reviewed family recipes. Find a recipe, show it, or scale it to a different size.
kind: lookup
adapter: recipes
tools:
  - name: search_recipes
    description: Search the approved family recipes by name or ingredient. Returns one line per match with the recipe id, title, and first ingredients.
    parameters:
      type: object
      properties:
        query:
          type: string
          minLength: 1
          description: Words from the recipe name or its ingredients, for example "texas sheet cake".
      required: [query]
      additionalProperties: false
  - name: get_recipe
    description: Get one approved recipe by the id that search_recipes returned.
    parameters:
      type: object
      properties:
        recipe_id:
          type: string
          minLength: 1
          description: A recipe id from search_recipes, for example "recipe_1".
      required: [recipe_id]
      additionalProperties: false
  - name: scale_recipe
    description: Get one approved recipe scaled by a factor or to a number of servings. Give exactly one of factor or servings.
    parameters:
      type: object
      properties:
        recipe_id:
          type: string
          minLength: 1
          description: A recipe id from search_recipes, for example "recipe_1".
        factor:
          type: number
          exclusiveMinimum: 0
          description: How much to multiply the recipe by, for example 2 to double it or 0.5 to halve it.
        servings:
          type: integer
          minimum: 1
          description: The number of servings wanted. Only works when the recipe lists a single Serves number.
      required: [recipe_id]
      additionalProperties: false
---

# Recipes

## When to use
Any question about a family recipe: what is in it, how to make it, or how to make more or less of it.

## How to answer
- Always call search_recipes first. Then call get_recipe or scale_recipe for the matching recipe before answering, and cite that source.
- Keep the answer to one or two sentences. The recipe card under your answer shows the full recipe, so do not retype the ingredients or quantities.
- Never do scaling arithmetic yourself. To double, halve, or change the servings, call scale_recipe.
- If no recipe matches, say you don't know. Do not make up a recipe.
- If a tool returns an error, say so plainly and include the error. Do not guess.
