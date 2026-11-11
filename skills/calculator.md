---
name: calculator
description: Exact arithmetic, percentages, and unit conversions. Use for any question that needs a number computed.
kind: lookup
adapter: calculator
tools:
  - name: evaluate_expression
    description: Evaluate a math expression or unit conversion, for example "0.15 * 340" or "3/8 inch to mm".
    parameters:
      type: object
      properties:
        expression:
          type: string
          description: A math expression. Use * for multiplication and "to" for unit conversions.
      required: [expression]
      additionalProperties: false
---

# Calculator

## When to use
Any question that requires computing a number: arithmetic, percentages, unit conversions.

## How to answer
- Never compute numbers yourself. Always call evaluate_expression, even for simple sums.
- Report the result exactly as the tool returned it, and cite the calculator source.
- If the tool returns an error, say you couldn't compute it and include the error. Do not guess.
