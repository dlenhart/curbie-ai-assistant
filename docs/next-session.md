# Pick Up Where I Left Off

Resume plan, rewritten 2026-11-23 at the end of Session 7. Work through the steps in order, checking each one's current state before acting. Delete or rewrite this file once the steps are done.

## State on 2026-11-23

On the M1 (Apple M1, 16 GB, Node 20.20):

- **Phase 2 is committed on `main`** (`c5a91f2`) and passed its manual check on the Mac (not from a phone). The real data dir now has the `settings` table. A pre-migration copy is at `/Volumes/CURBIE_BRAIN/curbie-phase1-backup-2026-11-23`.
- **Phase 2 follow-ups are built, uncommitted, on branch `phase-2-followups`.** 270 tests in 33 suites pass, and the typecheck and build are clean. The dev log has Session 7.
  - Model loading is a separate step with a 10-minute timeout, and saving a new model starts loading it in the background.
  - The installed-models check times out after 3 s.
  - Origin guard: canonical comparison, `http:` only, and a `Sec-Fetch-Site` check for unsafe requests with no Origin.
  - A failed Settings save keeps the valid fields.
  - Skills get the turn's settings through a `ToolExecutionContext`.
  - IPv6 is bracketed in the startup log, and U+202F is written as an escape.
- **The old `phase-2-lan-settings-frame` branch** (local and on origin) matches `main` and can be deleted.

## Starting a session

1. Plug in the drive, then run `scripts/ollama-service.sh status`. If Ollama is stopped, run `scripts/ollama-service.sh start`.
2. `cd server && npm test`.
3. To run Curbie: `CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start` (add `CURBIE_HTTP_HOST=0.0.0.0` for the whole network).

## Plan

### 1. Quick manual check of the follow-ups, then commit

1. `cd server && npm run build && CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`.
2. In Settings, switch to `qwen3:8b` and save. The page returns at once. `scripts/ollama-service.sh status` shows the 8B loading or loaded.
3. Ask "Hi" straight away. It waits for the load, then answers (slowly, since it's a thinking model) instead of timing out after 180 s.
4. Submit Settings with a valid model and units but a time zone that fails. Easiest way: stop Ollama and change the model, which gives the "Couldn't reach Ollama" model error. The units you picked stay selected.
5. Switch back to `qwen3:4b-instruct`.
6. Review the branch diff and commit when satisfied.

### 2. Phase 3 planning (documents and recipes)

- Scope is in the Phase 1 plan's phase map, row 3 (design §4.3.1, §4.3.1a, §5.7).
- Brainstorm first, then write `docs/superpowers/plans/<date>-curbie-phase-3-documents-recipes.md`.

### 3. Smaller items

- **Drive speed (now urgent).** Loading `qwen3:8b` took about 170 s, about 35 MB/s, which is USB 2 speed. Plug `CURBIE_BRAIN` straight into a USB-C port with a 10 Gb/s cable, then check `Link Speed` with `system_profiler SPUSBHostDataType`. Run `scripts/ollama-service.sh stop` first. Then retry the 8B.
- **Reserve the M1's IP** in the router's DHCP settings (`installation.md` §1.5a).
- **Phone check of LAN access** (Phase 2 step 4, skipped).
- **Model memory when Curbie isn't in use (deferred).** Curbie pins the model in memory (`keep_alive: -1`) until `ollama stop <model>` or `scripts/ollama-service.sh stop`. Switching models does unload the old one (seen 2026-11-23).
- **A "loading model…" status in chat.** Deferred until the chat refinement work.
- **Remaining review polish:** unit tables typed from `UNITS`, page model interfaces, `display: contents` accessibility, and more tests.
- **Time Machine.** The backup drives haven't been connected since about 2026-08-01.

### 4. Housekeeping

- Append a Session 8 entry to `docs/dev-log.md`.
- Update the Status section in `CLAUDE.md`.
- Rewrite this file.
