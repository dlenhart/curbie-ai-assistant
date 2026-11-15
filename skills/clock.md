---
name: clock
description: Today's date, the day of the week, and the current time in the household's time zone.
kind: lookup
adapter: clock
tools:
  - name: current_date_time
    description: Get the current date and time in the household's time zone.
    parameters:
      type: object
      properties: {}
      additionalProperties: false
---

# Clock

## When to use
Any question about today's date, the day of the week, or the current time.

## How to answer
- Never guess the date or time. Always call current_date_time.
- Report the date and time exactly as the tool returned it, and cite the clock source.
