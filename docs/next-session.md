# Pick Up Where I Left Off

Resume plan, rewritten 2026-11-15 at the end of Session 5. Work through the steps in order, checking each one's current state before acting. Delete or rewrite this file once the steps are done.

## State on 2026-11-15

On the M1 (Apple M1, 16 GB, Node 20.20):

- **Phase 1 is done.** 152 tests in 20 suites pass, the typecheck and build are clean, and the live go/no-go check passed with `qwen3:4b-instruct` (dev log, Session 5).
- **Ollama 0.40.16** (Homebrew) runs under Curbie's own LaunchAgent, `~/Library/LaunchAgents/com.curbie.ollama.plist`, with its models on the USB drive (`installation.md` §1.3a). Installed: `qwen3:4b-instruct` (the default), `qwen3:4b`, and `qwen3:8b`, 9.5 GB in all.
- **The USB drive** `CURBIE_BRAIN` holds `curbie/` (the data dir, with its marker file) and `ollama-models/`. It's linked at USB 2 speed, so the first model load after Ollama starts takes about 1.5 minutes.
- **`npm audit`: 27 vulnerabilities** (4 low, 18 moderate, 3 high, 2 critical), unchanged since 2026-11-13.

## Starting a session

1. Plug in the drive, then run `scripts/ollama-service.sh status`. If Ollama is stopped, run `scripts/ollama-service.sh start`.
2. `cd server && npm test`.
3. To run Curbie: `CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`, then open `http://127.0.0.1:3000`.

## Plan

### 1. Audit triage

Do this before Phase 2 opens Curbie to the LAN. With no authentication, by design, anyone on the network can reach it.

The ones that matter:
- handlebars 3.0.0–4.7.9, **critical**. It's the view engine.
- body-parser 2.0.0–2.3.0 and multer 2.0.0–2.4.0, **high**.
- qs, fast-uri, glob, and minimatch, moderate.

How:
- **Do not run `npm audit fix --force`.** It would push NestJS past the 11.2.7 pin. Nest 12 is ESM-only and breaks Jest + ts-jest.
- Move handlebars to a patched 4.7.x if the view engine (`hbs`) accepts it.
- Fix body-parser, multer, and qs within the Nest 11 line, using `overrides` in `package.json` if needed.
- Record any risk accepted on purpose.
- Full test run, then a manual check that the chat page still renders.

### 2. Phase 2 decisions, then the plan

- **HTTPS (mkcert) or plain HTTP (design §5.3).** First check whether any planned feature needs a browser secure context: clipboard, notifications, service workers, or the microphone. Browsers treat only localhost as secure over plain HTTP. If any feature needs one, that settles it in favor of TLS. Otherwise, weigh protecting LAN traffic against installing the mkcert root CA on every device.
- **IP address or `curbie.local`.** macOS advertises `<hostname>.local` over mDNS once the Mac is renamed. Keep the IP as a fallback, because Android has historically resolved `.local` names unreliably. With mkcert, the certificate must list every name chosen.
- **Which settings to build now.** Only the ones something actually reads today, such as the model name. The rest of the Settings mockup's fields land with the phases that use them.
- Then write `docs/superpowers/plans/<date>-curbie-phase-2-lan-settings-frame.md`.

### 3. Smaller items

- **Drive speed.** Plug `CURBIE_BRAIN` straight into a USB-C port with a 10 Gb/s cable, then check `Link Speed` with `system_profiler SPUSBHostDataType`. Run `scripts/ollama-service.sh stop` first.
- **Config parser defaults** (`curbie-config.parser.ts`) are inline literals, against the single-constants-file rule. A small cleanup, if wanted.
- **Time Machine.** The backup drives haven't been connected since about 2026-08-01. That isn't Curbie's problem, but the M1 has no recent backup.

### 4. Housekeeping

- Append a Session 6 entry to `docs/dev-log.md`.
- Update the Status section in `CLAUDE.md`.
- Rewrite this file.
