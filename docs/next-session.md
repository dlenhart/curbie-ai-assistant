# Pick Up Where I Left Off

Resume plan written 2026-11-13 after a repo analysis. Work through the steps in order, checking each one's current state before acting. Delete or rewrite this file once the steps are done.

## State on 2026-11-13

On the M1 (Apple M1, Node 20.20):

- **No Ollama.** `ollama` isn't on the PATH, and neither model is installed.
- **Tests don't run.** `npm test` fails with `Module ts-jest in the transform option was not found`. `server/node_modules` is incomplete: about 357 top-level folders against 508 packages in the lockfile. It was probably copied rather than installed, so `server/dist/` may be stale too.
- **Typecheck is clean.** The working tree is clean.
- **`npm audit`: 27 vulnerabilities** (4 low, 18 moderate, 3 high, 2 critical). The ones that matter:
  - handlebars 3.0.0–4.7.9, **critical**. It's the view engine.
  - body-parser 2.0.0–2.3.0 and multer 2.0.0–2.4.0, **high**.
  - qs, fast-uri, glob, minimatch, moderate.

## Plan

### 1. M1 baseline

Everything after this depends on it.

1. Run `scripts/install.sh`. It's interactive, so run it yourself: `! ../scripts/install.sh` from `server/` in Claude Code. It checks for Node, Ollama, `qwen3:4b`, and `qwen3:8b`, and offers to install what's missing.
2. Create the data folder and its `.curbie-data-dir` marker (`docs/installation.md` §1.3).
3. `cd server && npm ci && npm test && npm run build`. `npm ci` deletes the incomplete `node_modules` and installs exactly what the lockfile pins. Expect 152 tests in 20 suites. If they don't all pass, find out what's different between the M2 and the M1 before going further.

### 2. Live go/no-go check (Phase 1 plan, Task 12 Step 7)

This is the project's core bet: can a small local Qwen keep the answer contract (source IDs, verbatim quotes, valid finalize JSON)?

- Compare `qwen3:4b` with `qwen3:8b` on the six checks.
- Run each check several times per model. A small model's contract failures are random, so a single clean run proves little.
- Record two things per model: how often it kept the contract, and how long replies took.

What to do with the result:

- **4b passes:** keep it as the default.
- **Only 8b passes:** make 8b the default and note its reply time. That affects Phase 7 (proactive features) and whether Phase 11's coding routing needs a second model loaded.
- **Neither passes reliably:** pull Phase 8's checking pass and eval harness forward, or rethink the two-step model call, before building anything else on top.

Optional: a small script that sends the same prompts through the real Ollama adapter would make the check repeatable. It would be an early version of Phase 8's eval harness and model-upgrade gate.

### 3. Audit triage

Do this before Phase 2 opens Curbie to the LAN.

- **Do not run `npm audit fix --force`.** It would push NestJS past the 11.2.7 pin. Nest 12 is ESM-only and breaks Jest + ts-jest.
- Move handlebars to a patched 4.7.x if the view engine accepts it.
- Fix body-parser, multer, and qs within the Nest 11 line, using `overrides` in `package.json` if needed.
- Record any risk accepted on purpose.

### 4. Phase 2 decisions, then the plan

- **HTTPS (mkcert) or plain HTTP (design §5.3).** First check whether any planned feature needs a browser secure context: clipboard, notifications, service workers, or the microphone. Browsers treat only localhost as secure over plain HTTP. If any feature needs one, that settles it in favor of TLS. Otherwise, weigh protecting LAN traffic against installing the mkcert root CA on every device.
- **IP address or `curbie.local`.** macOS advertises `<hostname>.local` over mDNS once the Mac is renamed. Keep the IP as a fallback, because Android has historically resolved `.local` names unreliably. With mkcert, the certificate must list every name chosen.
- **Which settings to build now.** Only the ones something actually reads today, such as the model name. The rest of the Settings mockup's fields land with the phases that use them.
- Then write `docs/superpowers/plans/<date>-curbie-phase-2-lan-settings-frame.md`.

### 5. Housekeeping

- Append a Session 5 entry to `docs/dev-log.md` with the live-check results: the models, how often each kept the contract, and reply times.
- Update the Status section in `CLAUDE.md`.
- Delete or rewrite this file.
