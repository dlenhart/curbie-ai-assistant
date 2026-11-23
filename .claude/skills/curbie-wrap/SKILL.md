---
name: curbie-wrap
description: End-of-session wrap-up for Curbie — update the CLAUDE.md Status section, rewrite docs/next-session.md, and append the session's entry to docs/dev-log.md in its established format. Use when the owner says they're stopping, asks to wrap up or save progress, or at the end of a phase or working session.
---

# curbie-wrap

Three documents carry Curbie's state between sessions. Update all three, in this order, then tell the owner what changed. Never commit; the owner reviews and commits.

## 0. Gather facts first

- `git status --short`, `git branch --show-current`, `git log --oneline -5`: what is committed, on which branch, and what is still uncommitted.
- Run `bash .claude/skills/curbie-check/check.sh` and use its real test count and results. Never copy a count from an earlier doc.
- Re-read the current `CLAUDE.md` Status section, `docs/next-session.md`, and the most recent entry in `docs/dev-log.md`.
- Review the conversation for decisions made, pushback that changed a decision, ideas dropped, bugs found, and anything the owner still has to do by hand.

## 1. `CLAUDE.md` → `## Status`

- Keep it short. One paragraph per phase or state, newest last, each linking to the plan, spec or design section rather than restating it.
- State the branch, whether the work is committed, the test count, and whether the owner's manual check has passed.
- Update `### Layout` only if new top-level folders or module areas appeared.
- Don't duplicate design content here. Point to it.

## 2. `docs/next-session.md`

Rewrite it completely. It is a resume plan, not a log:

1. Where things stand, in two or three lines (branch, committed or not, tests).
2. **Do first:** the owner's pending manual checks as numbered steps with exact commands (for example `scripts/ollama-service.sh start`, `CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`) and what they should see. Flag known rough edges so they aren't mistaken for bugs.
3. **Next work:** what's queued, in order, with links.
4. **Deferred:** items consciously postponed, each with one line on why.

## 3. `docs/dev-log.md`

Append one entry and never edit earlier ones. Copy the structure of the latest entry exactly. As of Session 8 it is:

```
## Session N — YYYY-MM-DD: <short title>

### Goal
### How it unfolded
### Decided
### Produced
### Still open
### Takeaways for the blog
```

- **How it unfolded** tells the story, including ideas that were dropped and pushback that changed a decision, with the owner's own words quoted where they mattered.
- **Decided** gives each decision and its reason.
- **Takeaways for the blog** are 3–5 bold one-line lessons, each followed by a sentence or two.
- Use they/them for the owner if a pronoun is needed. Use today's date and the next session number.

## 4. Report

Tell the owner which three files changed and give a one-line summary of each, and remind them nothing was committed.
