# Curbie

A small, self-hosted AI assistant running a local Qwen model through Ollama on a Mac M1. It answers only from the sources and skills it is given, and says plainly when it doesn't know. NestJS (TypeScript) backend, Handlebars web UI, SQLite storage.

## Status

Phase 1 (walking skeleton) is built: all 12 plan tasks, 152 tests in 20 suites, clean typecheck and build. The one step left is Task 12 Step 7, the live go/no-go check against `qwen3:4b` vs. `qwen3:8b`. It runs on the M1; the dev machine has no Ollama or models. Plans for Phase 2+ are written as each phase lands (see the phase map in the Phase 1 plan).

**Next session (on the M1):** run `scripts/install.sh` (it checks for Node, Ollama, and the models and offers to install them), create the data folder and its marker (`docs/installation.md` §1.3), then `cd server && npm ci && npm test && npm run build`, and run the live check in Task 12 Step 7. Record its results in the dev log. Also open: the `npm audit` warnings from the first install.

**Phase 2 (started planning, no plan or code yet):** decided: **no users and no authentication, ever.** Curbie is an open chat for anyone on the home network (design §4.7, §5.3). Settings are household-only (§4.17). Next decision: HTTPS via mkcert or plain HTTP on the LAN (trade-offs in §5.3). Then the remaining planning questions: how devices reach Curbie (IP address or a name like `curbie.local`), and which settings to build now. Then write the Phase 2 plan in `docs/superpowers/plans/`.

### Commands

Run from `server/`:

- `npm ci`: install exact pinned dependencies.
- `npm test`: the full Jest suite, including the architecture rules and the end-to-end integration test (no Ollama needed; the model is scripted).
- `npm run typecheck`, then `npm run build` (output in `dist/`).
- `CURBIE_DATA_DIR=/absolute/path npm start`: run the server at `http://127.0.0.1:3000`. The data folder must already contain an empty `.curbie-data-dir` marker file, or startup refuses. Other settings are in `docs/installation.md`.

### Layout

- `server/src/core/`: pure domain logic (answers, conversation, model port, skills, sources, shared), plus `core/testing/` test doubles.
- `server/src/adapters/`: model (Ollama), persistence (SQLite), skills (calculator, skill loader), system (clock, IDs), web (gateway, controller, app configurator).
- `server/src/infrastructure/config/`: environment parsing.
- `server/src/app.module.ts` is the composition root; `server/src/main.ts` boots the server.
- `server/views/` (Handlebars) and `server/public/` (client JS and CSS); `skills/` at the repo root holds skill documents.

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
