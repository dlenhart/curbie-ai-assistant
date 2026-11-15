# Pick Up Where I Left Off

Resume plan, rewritten 2026-11-15 at the end of Session 6. Work through the steps in order, checking each one's current state before acting. Delete or rewrite this file once the steps are done.

## State on 2026-11-15

On the M1 (Apple M1, 16 GB, Node 20.20):

- **Phase 2 is built, uncommitted, on branch `phase-2-lan-settings-frame`.** 229 tests in 29 suites pass, and the typecheck and build are clean. The plan is `docs/superpowers/plans/2026-11-15-curbie-phase-2-lan-settings-frame.md`, and the dev log has Session 6.
- **Built:**
  - LAN access over plain HTTP by IP (opt-in, `CURBIE_HTTP_HOST=0.0.0.0`).
  - The Host/Origin guard.
  - The shared page frame with a nav of CHAT and MANAGE.
  - The Manage hub, and a Settings page for model, time zone, and units, stored in SQLite.
  - A `clock` skill.
- **Ollama 0.40.16** runs under Curbie's LaunchAgent with models on `CURBIE_BRAIN` (`installation.md` §1.3a). Installed: `qwen3:4b-instruct` (default), `qwen3:4b`, and `qwen3:8b`.
- **The data dir gains a `settings` table** (migration 2) the first time Phase 2 starts against it. Migrations are forward-only, so after that the Phase 1 code refuses that database.

## Starting a session

1. Plug in the drive, then run `scripts/ollama-service.sh status`. If Ollama is stopped, run `scripts/ollama-service.sh start`.
2. `cd server && npm test`.
3. To run Curbie for the whole network: `CURBIE_HTTP_HOST=0.0.0.0 CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`. The log prints the LAN URL.

## Plan

### 1. Manual check of Phase 2 (not done yet; do this first)

Nothing in Phase 2 has been checked in a browser yet. The first run against the real data dir adds the `settings` table, after which `main` (Phase 1) refuses that database. To keep a way back, try it on a copy of `/Volumes/CURBIE_BRAIN/curbie` first.

1. `scripts/ollama-service.sh start`, then `cd server && npm run build`.
2. `CURBIE_HTTP_HOST=0.0.0.0 CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`. Note the "On your home network" URL in the log.
3. On the Mac, open `http://127.0.0.1:3000`. The nav shows CHAT and MANAGE, and chat works as before.
4. On the phone (same Wi-Fi), open the LAN URL. Allow `node` if macOS asks. Chat works there too.
5. MANAGE → SETTINGS: all three models are listed. Switch units to metric and save. "Settings saved." appears.
6. Ask "Convert 5 miles". It answers in km without being asked.
7. Ask "What's today's date?". The answer is Sourced, cites Clock, and is in the chosen time zone.
8. Switch the model to `qwen3:4b`, save, and ask "Hi". A slow first reply confirms the switch. Then switch back. Watch whether the old model stays in memory (`scripts/ollama-service.sh status`).
9. Run `scripts/ollama-service.sh stop`, then reload Settings. The page loads with the "Couldn't reach Ollama" hint, and saving a time zone change still works.
10. Look over the layout against `docs/mockups/`: the nav position, the Settings form, and the "Settings saved." alignment in the footer.

Then:

- Report anything that looks wrong, and fix it test first.
- Review the branch diff and commit when satisfied.
- Reserve the M1's IP in the router's DHCP settings (`installation.md` §1.5a).
- Decide which of the final review's deferred notes to fix. Recommended first: the 180 s timeout on the installed-models check, since a hung Ollama hangs the Settings page.
  - Shorten the installed-models check's timeout to 2–5 s.
  - A failed save resets the other fields to their stored values.
  - Origin compared by host only, not normalised (scheme, non-canonical IPv6, explicit `:80`).
  - Add a `Sec-Fetch-Site` check for POSTs with no Origin header.
  - Bracket IPv6 addresses in the startup log.
  - Write the literal U+202F in `clock.adapter.ts` as ` `.
  - The clock reads the time zone outside the turn's settings snapshot.
  - Polish: unit tables typed from `UNITS`, page model interfaces, `display: contents` accessibility, more tests, and giving each skill adapter only the dependencies it needs.

### 2. Phase 3 planning (documents and recipes)

- Scope is in the Phase 1 plan's phase map, row 3 (design §4.3.1, §4.3.1a, §5.7).
- Brainstorm first, then write `docs/superpowers/plans/<date>-curbie-phase-3-documents-recipes.md`.

### 3. Smaller items

- **Drive speed.** Plug `CURBIE_BRAIN` straight into a USB-C port with a 10 Gb/s cable, then check `Link Speed` with `system_profiler SPUSBHostDataType`. Run `scripts/ollama-service.sh stop` first.
- **Model memory when Curbie isn't in use (deferred).** Curbie pins the model in memory (`keep_alive: -1`), about 3.8 GB after one question, until `ollama stop <model>` or `scripts/ollama-service.sh stop`. Options for later: an `unload` command in the script, or a keep-alive setting.
- **Time Machine.** The backup drives haven't been connected since about 2026-08-01.

### 4. Housekeeping

- Append a Session 7 entry to `docs/dev-log.md`.
- Update the Status section in `CLAUDE.md`.
- Rewrite this file.
