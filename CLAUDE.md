# Curbie

A small, self-hosted AI assistant running a local Qwen model through Ollama on a Mac M1. It answers only from the sources and skills it is given, and says plainly when it doesn't know. NestJS (TypeScript) backend, Handlebars web UI, SQLite storage.

## Status

Phase 1 (walking skeleton) is done: all 12 plan tasks, 152 tests in 20 suites, clean typecheck and build. The live go/no-go check passed on the M1 on 2026-11-15 with **`qwen3:4b-instruct`**, which replaced `qwen3:4b` as the default. Thinking models kept the answer contract but took 20–70 s per reply; the non-thinking 4B keeps it at 4–12 s. Every Ollama call now sets `num_ctx` and `num_predict` (design §4.5, §7.1; Session 5 in the dev log).

**The M1 is set up.** Ollama runs under Curbie's own LaunchAgent, with its models on the `CURBIE_BRAIN` USB drive (`installation.md` §1.3a). Use `scripts/ollama-service.sh start|stop|status`, and stop Ollama before ejecting the drive. The data dir is `/Volumes/CURBIE_BRAIN/curbie`.

**Phase 2 is committed on `main` and passed its manual check (2026-11-23).** Plan: `docs/superpowers/plans/2026-11-15-curbie-phase-2-lan-settings-frame.md`. Plain HTTP by IP (TLS deferred), opt-in LAN binding (`CURBIE_HTTP_HOST=0.0.0.0`), a Host/Origin guard, the shared page frame and nav, the Manage hub, a Settings page (model, time zone, units in SQLite), and a `clock` skill (design §4.13, §4.17, §5.3).

**Phase 2 follow-ups are built, uncommitted, on branch `phase-2-followups` (2026-11-23).** 270 tests in 33 suites. Model loading is now a separate step with its own timeout, and a model saved in Settings starts loading in the background. Also: a 3 s installed-models check, a hardened Origin guard, failed saves that keep valid fields, and the turn's settings passed to skills (design §4.5, §4.13, §4.17, §5.3, §5.7).

**Next session:** follow `docs/next-session.md`. The `hbs` advisory is accepted on one condition: render locals come only from server-side values, never from request data (design §5.7).

**Standing decisions:** **no users and no authentication, ever.** Curbie is an open chat for anyone on the home network (design §4.7, §5.3). Settings are household-only (§4.17).

### Commands

Run from `server/`:

- `npm ci`: install exact pinned dependencies.
- `npm test`: the full Jest suite, including the architecture rules and the end-to-end integration test (no Ollama needed; the model is scripted).
- `npm run typecheck`, then `npm run build` (output in `dist/`).
- `CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`: run the server at `http://127.0.0.1:3000`. The data folder must already contain an empty `.curbie-data-dir` marker file, or startup refuses. Other settings are in `docs/installation.md`.

### Layout

- `server/src/core/`: pure domain logic (answers, conversation, model port, skills, sources, shared), plus `core/testing/` test doubles.
- `server/src/adapters/`: model (Ollama), persistence (SQLite), skills (calculator, skill loader), system (clock, IDs), web (gateway, controller, app configurator).
- `server/src/infrastructure/config/`: environment parsing.
- `server/src/app.module.ts` is the composition root; `server/src/main.ts` boots the server.
- `server/views/` (Handlebars: `layout.hbs` is the shared frame with the nav; each page renders inside it) and `server/public/` (`curbie.css`, copied from the mockups, plus client JS); `skills/` at the repo root holds skill documents.
- `diagnostics/`: scripts that run the built server code against a real Ollama. `model-contract.diagnostic.js` asks the Phase 1 contract questions and logs every model call's timing and tokens (`--help` for usage). It needs a running Ollama and `npm run build` first. It's the seed of Phase 8's eval harness.

## Source of truth

- `docs/design.md`: the full design. Every decision, guardrail, and open question. Read the relevant section before changing behavior, and update it when a decision changes.
- `docs/superpowers/plans/2026-10-01-curbie-phase-1-walking-skeleton.md`: the Phase 1 build plan (12 tasks) and the phase map for everything after.
- `docs/installation.md`: what the host, dev machine, and clients need installed, configuration variables, and where the Wikipedia and Gutenberg ZIMs come from. Update it when a phase adds a dependency or a TBD provider is chosen.

- `docs/dev-log.md`: a chronological log of how Curbie is being built, kept for a blog post. At the end of each working session, append an entry following the existing format: goal, how it unfolded (including ideas that were dropped and pushback that changed a decision), what was decided and why, what was produced, and takeaways.

Don't duplicate design content here. Point to it.

## Project rules

- **No comments in code. Not one.** No `//`, `/* */`, JSDoc, or `#` comments in source, tests, client JS, CSS, HTML, or config. If something seems to need a comment, rename or restructure it instead.
- **TDD and subagent-driven builds are on for this project**, overriding the global defaults. Write the failing test first. Executing a plan with subagents end to end is fine; the owner reviews at the end.
- **Never run `git commit` or push, and never ask whether to.** Each task ends with a checkpoint (full test run). The owner reviews and commits on their own schedule.
- **Ports and adapters.** `server/src/core/` is pure TypeScript with no IO and no NestJS imports, enforced by an architecture test. Adapters live in `server/src/adapters/`.
- **Policies are enforced in code, not prompts.** The answer contract, web consent gate, confirm-before-save, and tool-call validation are harness checks (design §5).
- **No command execution.** Nothing imports `child_process` except the OCR invoker, enforced by an architecture test (design §5.7).
- **One declaration per file, in a role folder, with a role suffix.** Interfaces go in `<module>/interfaces/x.interface.ts`, type aliases in `<module>/types/x.type.ts`, error classes in `<module>/errors/x.error.ts`. Every other file is named `<name>.<role>.ts` (`ollama-model.adapter.ts`, `tool.registry.ts`, `conversation.orchestrator.ts`, `skill-document.parser.ts`); specs mirror it (`x.adapter.spec.ts`). Only `main.ts` and `constants.ts` are unsuffixed.
- **All constants live in `server/src/constants.ts`.** Not per module. Core may import that one file; an architecture test requires it to import nothing. The approved exceptions are the compiled ajv validator in `structured-answer.parser.ts`, paths built from `__dirname` (kept as locals), and browser code in `server/public/`.
- **The Phase 1 plan's code samples use the old layout** (inline interfaces, `composition/tokens.ts`, unsuffixed names). Translate to the conventions above; the real code is the reference.
- **Model output is text, never markup.** Render replies with `textContent` until Phase 9's sanitized markdown rendering.

## UI

Dark mode only: the Floaterball neon style, Courier New, a still grid outside the main window, and `.neon-button` buttons. Full spec in design §4.1.0. Approved mockups of every page (Chat, History, Manage, Settings, Health, Inbox) are in `docs/mockups/` with one shared `curbie.css`; match them when building a page, and take styles from that stylesheet.
