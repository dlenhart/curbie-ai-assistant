# Pick Up Where I Left Off

Resume plan, rewritten 2026-11-15 at the end of Session 5. Work through the steps in order, checking each one's current state before acting. Delete or rewrite this file once the steps are done.

## State on 2026-11-15

On the M1 (Apple M1, 16 GB, Node 20.20):

- **Phase 1 is done.** 152 tests in 20 suites pass, the typecheck and build are clean, and the live go/no-go check passed with `qwen3:4b-instruct` (dev log, Session 5).
- **Ollama 0.40.16** (Homebrew) runs under Curbie's own LaunchAgent, `~/Library/LaunchAgents/com.curbie.ollama.plist`, with its models on the USB drive (`installation.md` §1.3a). Installed: `qwen3:4b-instruct` (the default), `qwen3:4b`, and `qwen3:8b`, 9.5 GB in all.
- **The USB drive** `CURBIE_BRAIN` holds `curbie/` (the data dir, with its marker file) and `ollama-models/`. It's linked at USB 2 speed, so the first model load after Ollama starts takes about 1.5 minutes.
- **`npm audit` is triaged.** 21 findings remain, none critical or high: `hbs` (accepted under a rule, design §5.7) and the dev-only Jest toolchain. NestJS is at 11.2.10. Re-check at each audit; never run `npm audit fix --force`.

## Starting a session

1. Plug in the drive, then run `scripts/ollama-service.sh status`. If Ollama is stopped, run `scripts/ollama-service.sh start`.
2. `cd server && npm test`.
3. To run Curbie: `CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`, then open `http://127.0.0.1:3000`.

## Plan

### 1. Phase 2 decisions, then the plan

- **HTTPS (mkcert) or plain HTTP (design §5.3).** First check whether any planned feature needs a browser secure context: clipboard, notifications, service workers, or the microphone. Browsers treat only localhost as secure over plain HTTP. If any feature needs one, that settles it in favor of TLS. Otherwise, weigh protecting LAN traffic against installing the mkcert root CA on every device.
- **IP address or `curbie.local`.** macOS advertises `<hostname>.local` over mDNS once the Mac is renamed. Keep the IP as a fallback, because Android has historically resolved `.local` names unreliably. With mkcert, the certificate must list every name chosen.
- **Which settings to build now.** Only the ones something actually reads today, such as the model name. The rest of the Settings mockup's fields land with the phases that use them.
- Then write `docs/superpowers/plans/<date>-curbie-phase-2-lan-settings-frame.md`.

### 2. Smaller items

- **Drive speed.** Plug `CURBIE_BRAIN` straight into a USB-C port with a 10 Gb/s cable, then check `Link Speed` with `system_profiler SPUSBHostDataType`. Run `scripts/ollama-service.sh stop` first.
- **Model memory when Curbie isn't in use (deferred).** Curbie pins the model in memory (`keep_alive: -1`), so after one question it holds about 3.8 GB until `ollama stop qwen3:4b-instruct` or `scripts/ollama-service.sh stop`. For now the owner frees it by hand. Options for later: an `unload` command in `scripts/ollama-service.sh`, or a `CURBIE_MODEL_KEEP_ALIVE` setting.
- **Config parser defaults** (`curbie-config.parser.ts`) are inline literals, against the single-constants-file rule. A small cleanup, if wanted.
- **Time Machine.** The backup drives haven't been connected since about 2026-08-01. That isn't Curbie's problem, but the M1 has no recent backup.

### 3. Housekeeping

- Append a Session 6 entry to `docs/dev-log.md`.
- Update the Status section in `CLAUDE.md`.
- Rewrite this file.
