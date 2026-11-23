---
name: curbie-check
description: Run Curbie's full verification in one go — Jest suite (including the architecture rules), typecheck, build, and a boot smoke test against a throwaway data folder — and report a pass/fail summary. Use before saying any Curbie change is done, at the end of every plan task, and before handing work to the owner for review.
---

# curbie-check

Run from anywhere in the repo:

```bash
bash .claude/skills/curbie-check/check.sh
```

It runs, in order, from `server/`:

1. `npm test` — the full Jest suite. This includes `architecture.spec.ts`, which enforces the project rules (core purity, no comments, constants only in `constants.ts`, types and interfaces only in role files, only the OCR invoker may spawn processes).
2. `npm run typecheck`
3. `npm run build`
4. **Boot smoke** (only if 1–3 pass): starts `node dist/main.js` on port 3917 (override with `CURBIE_CHECK_PORT`) with a temporary data folder containing the `.curbie-data-dir` marker, checks that `/`, `/manage` and `/manage/recipes` answer, then stops the server and deletes the folder. It needs no Ollama and never touches `/Volumes/CURBIE_BRAIN`.

The script prints a summary with one `PASS`/`FAIL`/`SKIP` line per step and exits non-zero on any failure. On a failure it prints the last 40 lines of that step's log and names the full log file.

## How to report

- Quote the summary lines verbatim. Do not claim a change is done unless every line is `PASS`.
- On a failure, read the named log and fix the cause before re-running. Do not weaken or skip a check to make it pass.
- The boot smoke proves the server starts and renders pages. It does not replace the owner's manual check in the browser, which is listed in `docs/next-session.md`.
