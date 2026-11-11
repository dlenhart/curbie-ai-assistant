# Curbie

A small, self-hosted AI assistant for the home network. Curbie runs a local Qwen model through [Ollama](https://ollama.com) on an always-on Mac M1, answers **only** from the sources and skills it is given, and says plainly when it doesn't know.

Curbie is an experiment in building a self-contained, partly offline AI assistant. The model, storage, and knowledge bases (offline Wikipedia and Gutenberg in a later phase) all live on one machine. The internet is used only for specific lookups such as weather or news, and for web search only when the user explicitly agrees to it.

- **Factual over agreeable.** "I don't know" is a valid answer. Curbie doesn't cave to pushback without new evidence.
- **Grounded.** Every factual answer cites a source that was actually retrieved in that turn. No silent answers from the model's training data.
- **Policies live in code, not prompts.** A small model told "ask first" will eventually skip asking, so the harness enforces the rules itself.
- **Local and private.** The model, data, and UI all run on one machine on the LAN. Nothing is exposed to the internet.

> **Status:** Phase 1 (walking skeleton) is built and tested: chat over WebSocket, a calculator skill, the answer contract, and SQLite transcripts. The live go/no-go check against `qwen3:4b` and `qwen3:8b` on the M1 is the remaining step. Later phases are mapped in the [Phase 1 plan](docs/superpowers/plans/2026-10-01-curbie-phase-1-walking-skeleton.md#phase-map).

## How it works

```
Browser ──WebSocket──▶ Chat gateway ──▶ Conversation orchestrator ──▶ Model port ──▶ Ollama (Qwen)
                                              │
                                              ├──▶ Tool registry ──▶ Skill adapters (calculator, …)
                                              ├──▶ Answer contract (validates the model's structured answer)
                                              └──▶ Transcript repository ──▶ SQLite
```

1. A message arrives over the WebSocket and goes into a single generation queue, so the model handles one reply at a time.
2. The orchestrator builds a system prompt from the loaded skill documents and recent history, then calls the model.
3. If the model requests a tool, the registry validates the call against that tool's JSON Schema and runs the adapter. Each result gets a source ID. Up to `CURBIE_MAX_TOOL_ROUNDS` rounds are allowed.
4. The model's final reply must be a structured answer: `{ category, text, sourceIds, quotes }`, where `category` is one of `cited`, `dont_know`, `generated`, or `conversational`.
5. The **answer contract** rejects a `cited` answer with no sources, a citation of a source that wasn't retrieved this turn, or a quote that doesn't appear verbatim in the source. A rejected answer is re-prompted once, then becomes "I don't know."
6. The reply and its harness-rendered citations are stored and sent back to the browser, where they're rendered as plain text.

### Answer types in the UI

| Badge | Meaning |
|---|---|
| **Sourced** (cyan) | Grounded in cited sources, listed under the reply |
| **Don't know** (yellow) | Nothing in Curbie's sources answers it |
| **Generated** (orange) | Curbie's own output (e.g. code), not sourced fact |
| **Error** (red) | Something failed, such as the model not responding |
| *(none)* | Conversational small talk, with no factual claims |

## Tech stack

| Concern | Choice |
|---|---|
| Backend | NestJS 11 (TypeScript), Node ≥ 20.19 (24 LTS on the host) |
| Web UI | Handlebars templates and a small hand-written client script over WebSocket. No frontend framework. |
| Model | Ollama running `qwen3:4b` by default (`qwen3:8b` as the comparison baseline) |
| Storage | SQLite via `better-sqlite3`, with versioned schema migrations |
| Validation | ajv for tool arguments and structured answers |
| Math | mathjs with dangerous functions disabled. Never `eval`. |
| Tests | Jest and supertest |

## Getting started

### Prerequisites

`scripts/install.sh` checks the Mac for everything Curbie needs (Xcode Command Line Tools, Homebrew, Node, Ollama, the models, the data folder, sleep settings) and offers to install what's missing, asking before each step.

```bash
scripts/install.sh             # check and offer to install
scripts/install.sh --check     # report only
scripts/install.sh --dry-run   # show what each "yes" would run, without running it
```

Or by hand:

```bash
brew install node@24 ollama
ollama pull qwen3:4b
```

Ollama is optional on a development machine. Without it the server still starts, and chat replies show a "model isn't responding" error.

### Data folder

Curbie refuses to start unless its data folder exists and contains a marker file. This guards against writing to the wrong place when the USB drive isn't mounted.

```bash
mkdir -p /Volumes/<usb-drive>/curbie
touch /Volumes/<usb-drive>/curbie/.curbie-data-dir
```

### Build and run

```bash
cd server
npm ci
npm test
npm run build
CURBIE_DATA_DIR=/Volumes/<usb-drive>/curbie npm start
```

Then open <http://127.0.0.1:3000>.

### Configuration

| Variable | Default | Notes |
|---|---|---|
| `CURBIE_DATA_DIR` | *(required)* | Absolute path to the data folder |
| `CURBIE_MODEL` | `qwen3:4b` | Ollama model tag |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | |
| `CURBIE_HTTP_HOST` | `127.0.0.1` | Loopback only in Phase 1. LAN binding arrives in Phase 2. |
| `CURBIE_HTTP_PORT` | `3000` | |
| `CURBIE_SKILLS_DIR` | repo `skills/` | |
| `CURBIE_HISTORY_MESSAGE_LIMIT` | `10` | 0–100 past messages sent to the model |
| `CURBIE_MAX_TOOL_ROUNDS` | `4` | 1–10 |

Invalid values fail at startup with a clear error rather than falling back silently. See [`docs/installation.md`](docs/installation.md) for the full host setup, including the offline Wikipedia and Gutenberg downloads planned for later phases.

## Skills

A skill is a **Markdown document plus an adapter**. The document's front matter declares the tools and their JSON Schema parameters. The body tells the model when and how to use them. Skill documents live in [`skills/`](skills/) and are loaded at startup.

```markdown
---
name: calculator
description: Exact arithmetic, percentages, and unit conversions.
kind: lookup
adapter: calculator
tools:
  - name: evaluate_expression
    description: Evaluate a math expression or unit conversion.
    parameters:
      type: object
      properties:
        expression: { type: string }
      required: [expression]
      additionalProperties: false
---

# Calculator

## How to answer
- Never compute numbers yourself. Always call evaluate_expression.
```

The `adapter` field must name an adapter that exists in code. There is deliberately no generic "call any endpoint" skill, and no shell or command-execution tool at all.

## Project layout

```
server/
  src/
    core/              Pure domain logic: answers, conversation, model port, skills, sources, shared
      testing/         Test doubles (scripted model, in-memory repository, fixed clock)
    adapters/
      model/           Ollama adapter
      persistence/     SQLite, migrations, data-folder guard
      skills/          Calculator, skill-directory loader
      system/          Clock, ID generator
      web/             WebSocket gateway, chat page controller, app configurator
    infrastructure/
      config/          Environment parsing and validation
    app.module.ts      Composition root
    constants.ts       Every constant in the app
    main.ts            Entry point
  views/               Handlebars templates
  public/              Client JS and CSS
skills/                Skill documents
scripts/install.sh     Host setup check
docs/                  Design, plans, installation, mockups, dev log
```

## Architecture rules

Curbie uses **ports and adapters** (hexagonal architecture). Several rules are enforced by `server/src/architecture.spec.ts`, so breaking them fails the build:

- `core/` is pure TypeScript: no IO and no NestJS imports. It depends only on interfaces (ports).
- `constants.ts` imports nothing. All constants live there.
- Nothing imports `child_process` except the future OCR invoker.

Codebase conventions:

- **One declaration per file**, in a role folder with a role suffix: `interfaces/x.interface.ts`, `types/x.type.ts`, `errors/x.error.ts`, otherwise `<name>.<role>.ts` (e.g. `conversation.orchestrator.ts`, `ollama-model.adapter.ts`). Specs mirror their subject.
- **No comments in code.** If something needs explaining, rename or restructure it.
- **Test-driven.** The test comes first.
- **Model output is text, never markup.** Replies are rendered with `textContent`.

## Testing

```bash
cd server
npm test            # full Jest suite
npm run typecheck
```

The suite covers the core domain, every adapter, the architecture rules, and an end-to-end integration test. The model is scripted (`core/testing/scripted.model.ts`), so no Ollama is needed. Shared behavior such as the transcript repository is checked with contract tests that run against both the in-memory and SQLite implementations.

## Roadmap

| Phase | Scope |
|---|---|
| **1. Walking skeleton** | Chat, calculator, answer contract, SQLite transcripts (built) |
| 2. LAN access & settings | LAN binding, HTTPS decision, page frame and nav, Manage hub, Settings |
| 3. Documents & recipes | Full-text search, ingestion, Apple Vision OCR helper, recipe scaling |
| 4. Scheduler & notifications | Timers, reminders, alert inbox, email, quiet hours, health checks |
| 5. Memory | Long-term facts, lists, logs, conversation history and resume, undo |
| 6. Lookup skills | Weather, news, calendar, consent-gated web search, `@mentions` |
| 7. Proactive | Watchers, morning briefing |
| 8. Honesty hardening | Checking pass, pushback rule, injection blocking, real-model evals |
| 9. Manage UI | Remaining Manage pages, Health dashboard, skill builder, markdown rendering |
| 10. Knowledge bases | Offline Wikipedia and Gutenberg from Kiwix ZIM files |
| 11. Coding & deployment | Coding model, persona, launchd, deploy script |

**No users or authentication, ever.** Curbie is an open chat for anyone on the home network and is never exposed to the internet. The trade-offs are in design §5.3.

## Documentation

- [`docs/design.md`](docs/design.md): the full design, with every decision, guardrail, and open question
- [`docs/installation.md`](docs/installation.md): host, dev machine, and client requirements, configuration, and knowledge-source downloads
- [`docs/superpowers/plans/`](docs/superpowers/plans/): phase build plans
- [`docs/mockups/`](docs/mockups/): approved static mockups of every page (open in a browser)
- [`docs/dev-log.md`](docs/dev-log.md): a running log of how Curbie is being built
