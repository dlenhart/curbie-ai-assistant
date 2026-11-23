# Pick Up Where I Left Off

Resume plan, rewritten 2026-11-23 at the end of Session 8. Work through the steps in order, checking each one's current state before acting. Delete or rewrite this file once the steps are done.

## State on 2026-11-23

- **Phase 2 and its follow-ups are committed on `main`** (`1a6904d`).
- **Phase 3 (recipes) is built on branch `phase-3-recipes`, uncommitted.** 543 tests in 54 suites pass, and the typecheck and build are clean. Dev log: Session 8. Spec: `docs/superpowers/specs/2026-11-23-curbie-phase-3-recipes-design.md`. Plan: `docs/superpowers/plans/2026-11-23-curbie-phase-3-recipes.md`.
  - Photos in `<data dir>/inbox/` are read by the Swift Vision helper, labelled by the model, assembled into a Markdown draft, and reviewed and approved on Manage › Recipes. Chat answers with a code-built recipe card and scales with code arithmetic.
  - The OCR helper was built and smoke-tested on the M1. The full flow has not been run by the owner yet.
  - All changes are staged in the git index (used as review baselines during the build). `git restore --staged .` unstages them if you prefer to review unstaged.
- **The old `phase-2-lan-settings-frame` branch** (local and on origin) matches `main` and can be deleted.

## Starting a session

1. Plug in the drive, then run `scripts/ollama-service.sh status`. If Ollama is stopped, run `scripts/ollama-service.sh start`.
2. `bash .claude/skills/curbie-check/check.sh` (or `/curbie-check`): tests, typecheck, build and a boot smoke test.
3. To run Curbie: `CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start` (add `CURBIE_HTTP_HOST=0.0.0.0` for the whole network).

## Plan

### 1. Manual check of Phase 3, then commit

1. `scripts/build-ocr.sh`. It produces `ocr/bin/curbie-ocr`.
2. Copy 2-3 card photos to `/Volumes/CURBIE_BRAIN/curbie/inbox/`: one as `texas-sheet-cake-1.heic` and `-2.heic`, one bare name, and one deliberately misnumbered (`pie-2.heic` alone).
3. `scripts/ollama-service.sh start`, then `cd server && npm run build && CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`. The log reports the scan.
4. Chat shows the `▲ N new recipes ready to review · N scan problem(s)` notice. MANAGE shows the RECIPES tile.
5. Open a recipe: the photos, the OCR panel with `▲` marks, and the Markdown draft. Try APPROVE while `## Unsorted` exists. It's refused with line numbers. Fix it, SAVE, then APPROVE.
6. In chat: "What's the recipe for Texas sheet cake?" Expect a short answer, the card with sections, and links to the photos.
7. "Double it." The card shows doubled quantities in kitchen fractions.
8. Edit the approved recipe (change a quantity) and SAVE without approving. Chat still shows the old quantity, and the list marks it `edited`. APPROVE, and chat shows the new one.
9. `pie-2.heic` is still in the inbox, with a numbering problem listed on Manage › Recipes. Rename it to `pie.heic`, then SCAN INBOX.
10. Review the branch diff and commit when satisfied.

Known rough edges to expect:
- Halving "2 cups" shows `1 cups`. The unit word is kept verbatim.
- A draft with a servings line always starts with that line under `## Unsorted`, so you confirm the `Serves:` number before approving. That's intended.
- DISCARD and DELETE RECIPE ask for confirmation in the browser. Check that Cancel keeps the recipe and DISCARD EDIT doesn't ask.

### 2. Developer tooling (done 2026-11-23, uncommitted)

- **Architecture-test rules** in `server/src/architecture.spec.ts`: no comments (TS, public JS, CSS, hbs, Swift, shell), no module-level variables outside `constants.ts` (allowlist: the two compiled ajv validators), interfaces and type aliases only in role files, one per file.
- **Repo-local skills** in `.claude/skills/`: `/curbie-check` runs tests, typecheck, build and a boot smoke test (`bash .claude/skills/curbie-check/check.sh`); `/curbie-wrap` updates CLAUDE.md Status, this file and the dev log at the end of a session.
- Deferred review findings worth doing next: Swift same-row line ordering (tune on real cards), keep the repository error cause on `saveFailed`, report files stranded by a crash between move and save, the 512-token cap on long labelling replies.

### 3. Deferred

- **Manuals, PDFs, page citations, and the device catalog** (design §4.3.1), the other half of Phase 3.
- **Export recipes as `.md` files.**
- **Recipe cards in the transcript.** Waits for the History page.
- **Drive speed.** Loading `qwen3:8b` took about 170 s, about 35 MB/s, which is USB 2 speed. Plug `CURBIE_BRAIN` straight into a USB-C port with a 10 Gb/s cable, then check `Link Speed` with `system_profiler SPUSBHostDataType`. Run `scripts/ollama-service.sh stop` first.
- **Reserve the M1's IP** in the router's DHCP settings (`installation.md` §1.5a).
- **Phone check of LAN access** (Phase 2 step 4, skipped).
- **Model memory when Curbie isn't in use.** Curbie pins the model in memory (`keep_alive: -1`) until `ollama stop <model>` or `scripts/ollama-service.sh stop`.
- **A "loading model…" status in chat.**
- **OCR confidence threshold.** Starts at 0.5; tune on real cards.
- **Remaining review polish:** unit tables typed from `UNITS`, page model interfaces, `display: contents` accessibility, and more tests.
- **Time Machine.** The backup drives haven't been connected since about 2026-08-01.
