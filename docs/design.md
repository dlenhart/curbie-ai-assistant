# Curbie — Design Document

> Status: **Draft / planning.** This captures decisions made so far. Nothing is implemented yet.

## 1. Vision

Curbie is a small, lightweight, self-hosted AI assistant running on a local model (Qwen). It answers questions and performs simple actions using **only the sources and skills we provide it**, and it is upfront when it doesn't know something.

### Guiding principles

- **Factual over agreeable.** Curbie's job is to be correct and honest, not to keep the user happy. "I don't know" is a valid, expected answer. Curbie doesn't cave to pushback without new evidence.
- **Grounded in provided sources.** Every factual answer comes from a cited source (a skill, the local knowledge bases, the user's documents and recipes, memory, or a consented web lookup). Curbie does not answer silently from the model's own training data.
- **No tangents.** Curbie doesn't roam the web or chain lookups on its own. The web is reachable only with explicit user consent.
- **Policies are enforced in code, not prompts.** A small model told "ask first" will eventually skip asking. The harness blocks anything the policy forbids.
- **Ports and adapters.** Domain logic stays pure and testable. The model, external APIs, storage, and interfaces are all adapters.

## 2. Hardware & Deployment

| Role | Device | Notes |
|---|---|---|
| Host | Mac M1, 16 GB RAM, always on | Runs everything: model, backend, skills, scheduler, memory, Wikipedia index |
| Thin client (future) | Raspberry Pi | Browser to the web UI now; voice daemon later. Never runs the model. |
| Not used | 2013 Mac Pro, 32 GB, dual FirePro D500 (3 GB each), Bazzite Linux | Considered as a remote model host and dropped (2026-10-06). The CPU lacks AVX2, and the GPUs likely can't be used (GCN 1.0, no ROCm), so CPU-only inference would be slower than the M1 running the same 4B model. |

- Services run under **launchd** so they start at boot and restart on crash.
- The M1's sleep settings must keep it awake so timers fire on time.
- Because the Pi talks to the host over the LAN, the host is a **network service**, not localhost-only. It has a defined API and **no authentication** (§5.3): anyone on the home network can use it.

## 3. Technology Stack

| Concern | Choice |
|---|---|
| Backend / core engine | **NestJS** (TypeScript) |
| Web UI | **Handlebars** templates served by NestJS, plus a small hand-rolled client script (WebSocket for messages, streaming replies, push alerts). No frontend framework. |
| Model runtime | **Ollama**, running **Qwen3 4B** (4-bit, ~2.5 GB) by default on the M1 (§4.5). Qwen3 8B (~5 GB) is the comparison baseline. |
| Embeddings | Served by Ollama (embedding model, TBD) |
| Storage | **SQLite** (conversation history, timers, search indexes via FTS5) |
| Long-term facts | **Markdown** file |
| Coding model | **Qwen2.5-Coder 7B** (or similar) via Ollama, loaded on demand for coding requests |
| OCR | **Apple Vision framework** (on-device, strong on handwriting) via a **small Swift CLI**. NestJS spawns it with a file path, and it prints recognized text with per-line confidence scores, then exits. |
| Voice daemon (future) | **Python** on the Pi (e.g. openWakeWord, whisper.cpp, Piper) |
| Python sidecar | Only if we hit an ML task Node can't handle well |

## 4. Architecture

Five layers. Dependencies point inward toward the core, and the core depends only on interfaces (ports).

```
┌─────────────────────────────────────────────────────────┐
│ 1. Interfaces (driving adapters)                        │
│    Web UI (now) · Voice daemon on Pi (later)            │
└───────────────────────────┬─────────────────────────────┘
                            │ shared host API
┌───────────────────────────▼─────────────────────────────┐
│ 2. Core (pure domain)                                   │
│    Conversation orchestration · Skill routing ·         │
│    Memory retrieval · Guardrail policies                │
└──────┬──────────────────┬──────────────────┬────────────┘
       │                  │                  │
┌──────▼───────┐  ┌───────▼────────┐  ┌──────▼────────────┐
│ 3. Capabil-  │  │ 4. Memory      │  │ 5. Model runtime  │
│    ities     │  │  SQLite trans- │  │  (driven adapter) │
│  Lookup      │  │  cripts +      │  │  Ollama / Qwen    │
│  skills,     │  │  markdown      │  │                   │
│  action      │  │  facts         │  │                   │
│  skills,     │  │                │  │                   │
│  scheduler   │  │                │  │                   │
└──────────────┘  └────────────────┘  └───────────────────┘
```

### 4.1 Interfaces
- The core does not know which interface it's talking to. Web UI and voice are both adapters over the same host API.
- Voice (future): wake word → speech-to-text → core → text-to-speech. Audio capture and playback live on the Pi. Whether transcription runs on the Pi or the M1 is TBD.
- **Mobile-friendly from the start:** the web UI is used from a phone on the LAN (e.g. pulling up a recipe in the kitchen).
- **Chat rendering:** markdown, syntax highlighting, and a copy button for code blocks.

#### 4.1.0 Visual design
The web UI uses a neon, cyberpunk style taken from the owner's Floaterball game (github.com/dlenhart/floaterball, `css/style.css`).

**Reference mockups:** `docs/mockups/` holds approved static mockups of every page (`chat.html`, `history.html`, `manage.html`, `settings.html`, `health.html`, `inbox.html`) sharing one stylesheet, `curbie.css`. Open them in a browser. They are the visual source of truth; implementations should match them, and later phases lift styles from `curbie.css`.

- **Dark mode only.** There is no light theme, and the page does not follow the system color-scheme setting.
- **Typeface:** Courier New (monospace) everywhere, including the title.
- **Palette:**

| Token | Value | Use |
|---|---|---|
| `--deep-black` | `#0a0a0a` | Page background, inside of the chat window, input field |
| `--dark-gray` | `#1a1a1a` | Surfaces: title box, reply cards, input bar, button fill |
| `--neon-cyan` | `#00ffff` | Frame, borders, buttons, focus, Sourced badge, title |
| `--neon-magenta` | `#ff00ff` | The user's own messages |
| `--neon-yellow` | `#ffff00` | Don't know badge, section headings, inbox count, health Degraded, held deliveries, "needs attention" flags |
| `--neon-orange` | `#ff8c00` | Generated badge |
| `--neon-green` | `#00ff00` | Health status OK, delivered-alert tags |
| `--neon-red` | `#ff0000` (border `#ff6666`) | Error badge and error card, health Down, urgent alerts, failed deliveries |
| `--grid-color` | `#00ffff33` | Background grid lines |
| `--reply-text` | `#e6f2f2` | Body text of replies (softer than cyan for long reading) |
| `--muted-text` | `#8fb3b3` | Citations, placeholder text |

- **Layout:** stacked like Floaterball. A framed title box ("CURBIE", cyan with the neon `text-shadow` glow and wide letter spacing) sits on top of a cyan-bordered chat window, with the input bar framed below it. Single centered column, max 760px wide, mobile-friendly.
- **Grid:** the Floaterball grid (two repeating `linear-gradient`s on a 50px tile, 0.3 opacity) covers the page background **outside** the chat window. It is **static**: no scrolling animation. The inside of the chat window is solid `--deep-black`.
- **Messages:** every message is a bordered card on `--dark-gray`. The user's messages have a magenta border, a faint magenta tint, and a left indent. Curbie's replies have a dim cyan border.
- **Answer-type badges:** Sourced (cyan), Don't know (yellow), Generated (orange), Error (red). Conversational replies have no badge. Badges are small uppercase text with a light glow in their own color.
- **Citations:** listed under the answer with a cyan `▸` marker, in `--muted-text`.
- **Error state:** red border plus Floaterball's `dangerPulse` glow animation.
- **Status line:** below the input bar, in cyan. Shows "Curbie is processing…" while a reply is pending and "Disconnected. Reconnecting…" when the socket drops.
- **Navigation bar** (from Phase 2, when a second page exists): sits between the title box and the main window, styled like Floaterball's `.pause` bar. Links: **CHAT · HISTORY · MANAGE · HEALTH · INBOX**. The current page's link has a soft cyan fill and a bright underline; hover fills it solid cyan. INBOX carries the unread-alert count as a small glowing yellow tag (no emoji). Settings lives inside Manage, not in the nav. On narrow screens the labels shrink so all five fit on one row. Phase 1 has only the chat page and no nav.
- **Shared page frame:** every page uses the same stack: title box, nav, a cyan-bordered main window (solid black inside, grid outside), and an optional framed footer bar for actions.
- **Buttons:** an exact copy of Floaterball's `.playButton` (dark-gray fill, 2px cyan border, 5px radius, 600 weight, 2px letter spacing, soft cyan glow; on hover the fill turns cyan, text turns black, glow grows, and it lifts 2px over 0.3s). Implemented as real `<button>` elements with `font-family: inherit` and `cursor: pointer`, and `:focus-visible` gets the same styling as hover so keyboard users can see focus.

**Pages** (see the mockups for exact layout):

| Page | Contents | Phase |
|---|---|---|
| Chat (`/`, `/c/<conversation-id>`) | The conversation, input bar, status line. When a past conversation is reopened, a thin strip above the messages shows its title and start time. | 1 (strip in 5) |
| History (`/conversations`) | Past conversations, newest first, grouped under TODAY / YESTERDAY / EARLIER. Each card shows the first message as its title, the time or date, and the message count, and opens the conversation. Footer: the 30-day retention note and a `+ NEW CHAT` button. | 5 |
| Manage (`/manage`) | A tile per area (§4.1.1) with a count, a one-line summary, and a yellow `▲` flag for items needing attention (e.g. "3 need OCR review"). Tiles link to each area's page. | 2 (hub + Settings), area pages as their phases land |
| Settings (`/manage/settings`) | Two groups matching §4.17: **Household** (home location, time zone, briefing contents) and **Your settings** (alert email, units, quiet hours, briefing time, email delivery preference). A framed footer with SAVE. | 2 |
| Health (`/health`) | A summary banner when anything isn't OK, a tile per check (§4.20) showing status, detail, and last-checked time, and the 30-day incident log. Status colors: OK green, Degraded yellow, Down red with the pulse. | 9 (checks themselves in 4) |
| Inbox (`/inbox`) | Alerts from the last 30 days, newest first. Each card shows the kind (Timer, Reminder, Watcher, Briefing, Health), time, text, and a delivery tag per channel: sent (green), skipped (grey), held for quiet hours or for the internet to return (yellow), failed with the reason (red). Unread alerts have a bright border and a glowing dot; urgent ones get the red pulse. Footer: unread count and MARK ALL READ. | 4 |

#### 4.1.1 Manage section
Alongside the chat, the web UI has a **Manage** area to view, add, edit, and delete everything Curbie holds:
- Timers and reminders
- Watchers
- Memory facts
- Logs
- Lists
- Documents and the device catalog
- Recipes (including correcting OCR errors)
- Skills
- Settings (§4.17)

The Health dashboard (§4.20) and the alert Inbox (§4.6) are separate pages with their own nav links (§4.1.0).

**Rule: chat and Manage call the same core use cases.** "Set a timer for 15 minutes" and the timer form both go through one `CreateTimer` service, with identical validation and rules. The Manage UI is just another driving adapter, never a second, weaker path into the data. It also doubles as a debugging tool, because a misparsed command shows up as a visibly wrong entry that can be fixed in place.

**Skills in Manage:** a skill is a *document plus an adapter*.
- **Config-driven skills** are fully UI-authorable: a new RSS feed, knowledge document, or device manual.
- **Skills needing a new integration** (a new API with its own auth and response shape) require adapter code. There is deliberately **no** generic "call any HTTP endpoint" skill definable from the UI, because it would undermine the no-tangents and safety principles.

#### 4.1.2 Conversation history and resume
Past conversations can be reopened and continued from the History page.

- **Resuming needs no special mechanism.** Every turn already loads the conversation's recent messages from SQLite by conversation ID (§4.11). Reopening a conversation just means sending new messages with its existing ID, so Curbie picks up where it left off.
- **What the model sees:** only the most recent messages (`CURBIE_HISTORY_MESSAGE_LIMIT`, default 10), even though the whole conversation is shown on screen. Accepted as-is; summarizing older turns remains part of the open context policy (§4.11).
- **Citations are stored with each message** (a JSON column on `messages`, from Phase 1), so a reopened conversation shows its badges *and* sources exactly as they first appeared.
- **Rendering:** opening `/c/<conversation-id>` renders the stored messages server-side with Handlebars, then the client script continues over the WebSocket as usual.
- **Ownership:** a user can only list and open their own conversations. Opening someone else's is refused with the same ownership error the transcript repository already raises.
- **Retention:** conversations disappear from History after 30 days (§4.14). Forgotten content appears redacted (§4.4).
- **Phase 5**, alongside conversation recall. Phase 1 already stores everything needed.

### 4.2 Core
- Our logic, not the model. It owns the conversation loop, decides which skills and memories are relevant each turn, invokes the model, validates tool calls, executes them via capabilities, and enforces guardrails.
- Testable with a fake model adapter.
- **Tool-call validation:** model-produced tool calls are checked against the tool's schema. Invalid calls fail loudly or get one re-prompt. Garbage never reaches an external API.

### 4.3 Capabilities (skills)
A **skill** is a document (similar to a Claude skill) describing when it applies, plus its tool schema(s) and usage instructions. A short description is always available to routing, and the full body loads only when it's relevant.

**Document format (decided in Phase 1):** one markdown file per skill in the repo's `skills/` folder (overridable with `CURBIE_SKILLS_DIR`). YAML frontmatter holds `name` (lowercase-kebab), `description`, `kind` (`lookup`, `action`, or `generative`), `adapter` (the adapter in code that runs it), and `tools`: each with a snake_case `name`, a `description`, and a JSON Schema `parameters` object of `type: object`. The markdown body is the usage instructions. Startup fails loudly on a malformed document, on a skill naming an adapter that doesn't exist in code, or on two skills declaring the same tool. `skills/calculator.md` is the reference example.

Three kinds:

- **Lookup skills** are read-only and return a trimmed, normalized result to the model.
  - **News:** one generic feed-reader adapter configured with a list of RSS feeds (Slashdot, Google News, local outlets) rather than one adapter per site.
  - **Weather:** one API adapter (AccuWeather or similar).
  - **Offline knowledge bases:** local Wikipedia, Project Gutenberg, and potentially other Kiwix ZIMs (iFixit, Stack Exchange) through one shared pipeline (see §6 for the chosen collections).
  - **Personal documents:** appliance and equipment manuals, recipes, notes (see §4.3.1).
  - **Calculator / unit conversion / date math:** the model translates the question into an expression and a deterministic evaluator computes it. Curbie never does arithmetic "in its head" (see §5.4).
  - **Calendar (read):** "What's on today?" via CalDAV or iCal feeds.
  - **Quick facts:** sports scores, package tracking, stock prices. One small API adapter each.
  - **System status:** "Is the Pi online?", "How much disk is left on the Mac?"
  - **Web search:** consent-gated (see §5.2).
- **Action skills** change state or do something in the world.
  - **Timers:** "Set a timer for 15 minutes."
  - **Reminders and alarms:** "Remind me at 5 to call the shop."
  - **Lists:** shopping, to-do, packing, stored in SQLite. "Add milk to the shopping list" / "What's on the list?"
  - **Logs / journal:** "Log that I changed the oil today at 82k miles" → later, "When did I last change the oil?" (see §4.4).
  - **Memory writes:** "Remember that…" (see §4.4).
  - **Watcher builder:** creates watchers from natural language (see §4.3.3).
  - **Skill builder:** walks the user through creating a new skill (see §4.3.5).
  - **Music control (deferred):** Spotify play, pause, queue. Wanted eventually, not a priority.
- **Generative skills** produce new content rather than looking it up.
  - **Light coding:** random scripts and small fixes, not heavy workloads. Routed to the coding model. Output is labeled **generated** (see §5.1). Curbie **generates but never executes** code. The user runs it. Factual questions about languages and APIs still follow normal grounding rules (offline docs could come from Kiwix DevDocs ZIMs).

#### 4.3.1 Personal documents
- Drop a PDF (or markdown) into an ingestion folder. It's chunked by page and indexed, and answers cite the source: *"Microwave manual, p. 14."*
- **Device catalog:** a small registry mapping device name and aliases → make/model → manual file, so "my microwave," "the GE microwave," and "the kitchen microwave" all resolve to the same document. Registering a manual is done when adding it (drop the file and tell Curbie what it is).
- **Scanned documents:** image-only PDFs and photos have no extractable text and go through **OCR** (Apple Vision). OCR is a core part of ingestion, not an edge case. If a document yields no usable text even after OCR, ingestion **fails loudly** rather than silently indexing an empty document.
- **Keep originals:** every ingested document keeps its original file or image alongside the extracted text, so answers can show the source.
- **OCR confidence:** low-confidence passages are flagged in answers, not presented as certain.

#### 4.3.1a Recipes
A primary use case: scanning a physical folder of family recipes (printed and handwritten) so Curbie can answer "What's the recipe for our Texas sheet cake?", including from a phone in the kitchen.
- **Printed vs. handwritten:** printed recipes OCR reliably. Handwritten cards are much harder, which is why Apple Vision was chosen over Tesseract.
- **Show the original card** alongside the answer. OCR errors in recipes fail quietly ("1 tbsp" read as "1 tsp"), so the source image is always one tap away.
- **Structured on ingest:** title, ingredients (with parsed quantities and units), steps, source. This allows "What do I need for the sheet cake?" to return just the ingredients.
- **Recipe scaling:** "Double the chili recipe" / "Scale this to 6 servings" combines structured quantities with the calculator, so there's no model arithmetic.
- **Correct once, stays fixed:** OCR mistakes are corrected in the Manage → Recipes page, and the corrected text becomes the indexed version.

#### 4.3.2 Morning briefing
- At a configured time, Curbie compiles weather + news headlines + today's calendar + pending reminders and delivers it through the notification channels (§4.6).
- **Code orchestrates the briefing** by calling each skill in sequence. The model only writes the final summary, because small models are poor at multi-step plans.
- Contents (which feeds, sections, time) are configuration, possibly editable by voice later.

#### 4.3.3 Watchers and the watcher builder
A watcher is a scheduled check plus a condition: *"Tell me if it's going to freeze tonight"*, *"Flag any Slashdot story about Rust."* Watchers are **created only by the user** through natural language (typed now, voice later), via the watcher-builder action skill.
- The model compiles the request into a structured **watcher spec**: source, condition, check schedule, expiry.
- The harness validates the spec against a **fixed menu**: only registered sources (weather, news feeds, …) and only supported condition types (threshold, keyword match, …). The model cannot invent new sources. This keeps watchers within the no-tangents principle.
- **Echo and confirm before saving:** *"Watching: overnight low below 32°F for tonight, checking hourly, expires tomorrow 8am. OK?"* A paraphrase error here means silent wrong alerts, so confirmation is mandatory.
- Watchers are stored in SQLite and run by the same polled scheduler.
- Companion commands: "List my watchers", "Stop watching X."

**Scheduler:** action skills like timers need a long-running background service, separate from the chat request/response loop:
- Fires events even if no chat tab is open.
- Pushes events to interfaces through a WebSocket gateway (later, the voice daemon can speak alerts).
- Is reusable for reminders, alarms, and scheduled briefings.

**Decision: DB-polled scheduler.** SQLite is the single source of truth for scheduled jobs. In-memory timers (`SchedulerRegistry` / `setTimeout`) are not used as state, because they're lost on crash or reboot.
- Creating a job is an insert (`id`, `label`, `fire_at`, `status`). Cancelling is an update.
- A single `@Interval` ticker (~1s) queries for `pending` jobs with `fire_at <= now`, fires them, and marks them done.
- Restarts are handled by construction: the first tick after boot picks up anything that came due while the app was down. Overdue jobs are fired and flagged as late (exact late/missed policy TBD).
- No `setTimeout` delay cap (~24.8 days), so long-range reminders work without special handling.
- The "what's due?" logic is pure and takes an injected clock, so it's unit-testable without real time.
- Tradeoff: up to ~1s firing jitter, which is acceptable.
- Rejected: registry + rehydration (two copies of state to keep in sync) and BullMQ (requires Redis, overkill for single-user).

**Routing at scale:** with a handful of skills, every description fits in the prompt. Past roughly 15–20, add a cheap pre-selection step (keyword or embedding similarity) so the model only sees the few relevant skills per turn.

**Context budget:** API payloads are trimmed to the needed fields before they reach the model.

#### 4.3.4 @mentions (user-forced routing)
Typing `@weather` or `@slashdot` lets the user **do the routing themselves** instead of leaving it to the model.
- **Parsed in code before the model sees the message.** The core scans for `@name` tokens and resolves them against the skill registry deterministically.
- **Declared in skill frontmatter**, with optional aliases that preset tool arguments:
  ```yaml
  name: news
  mentions:
    news: {}
    slashdot: { feed: Slashdot }
    local:    { feed: Local }
  ```
- **Mention + question:** "@weather will it rain Saturday?" skips routing, and the model is offered *only* that skill's tools.
- **Bare mention:** "@slashdot" alone runs the skill's default tool directly from the harness. The model only summarizes the result.
- **Multiple mentions:** "@weather @slashdot" offers both skills.
- **Unknown mention fails loudly:** *"No skill named @wether. Did you mean @weather?"* It never silently falls back to normal routing.
- **Policies still apply:** argument validation, echo-and-confirm for action skills, and so on. Mentions don't bypass guardrails. The one exception is `@web`, which counts as consent (§5.2).
- **Only user-typed mentions count.** An `@web` appearing inside retrieved content (RSS, documents, web pages) is just text (§5.6).
- **UI:** typing `@` opens an autocomplete list of skills and aliases with their one-line descriptions. This also makes skills discoverable.
- **Voice (later):** needs a spoken equivalent (e.g. "Curbie, Slashdot headlines" → `@slashdot`). To be designed with voice.

#### 4.3.5 Skill builder
An action skill whose output is **a new skill file**. Activated by mention (`@skill-builder`, name to be finalized) or by natural language ("help me make a new skill"). The Manage → Skills page offers the same flow as a form, through the same use case.

**Scope:**
- **Config-driven skills, fully:** anything backed by an existing adapter (e.g. a new RSS feed) can be built end to end.
- **New integrations, as a draft only:** it can draft the skill document and describe the adapter that's needed. The coding model may sketch adapter code, labeled *generated*, for the user to review. The builder **never installs or runs adapter code**.

**Code-driven wizard:** small models are poor at running multi-step interviews, so the flow is a **state machine in code**. The model only interprets answers and drafts wording.
1. **Purpose:** "What should this skill do?"
2. **Adapter:** match the purpose to an existing adapter, or state plainly that none fits and a new adapter is required.
3. **Config:** collect what the adapter needs (e.g. feed URL).
4. **Dry run:** call the adapter once and show a sample result for the user to confirm. This catches bad URLs or broken feeds immediately.
5. **Description and mentions:** the model drafts the one-line routing description and suggests a mention name. The user edits or approves.
6. **Routing check:** code tests the description against sample questions to confirm they route to the new skill and don't steal traffic from existing skills.
7. **Preview:** show the complete skill file.
8. **Confirm and save:** write to `skills/`, run the same validation as at boot, and hot-reload the skill registry (no restart).

**Properties:**
- A new skill appears as an **uncommitted change** in git. The user reviews and commits it.
- Guardrails carry over: only the user can start it, it confirms before saving, and the output passes the same validation as a hand-written skill. A builder-made skill is never more powerful than a hand-written one.

### 4.4 Memory
Two kinds:

| Kind | What | Storage |
|---|---|---|
| Episodic | Raw past conversation transcripts | SQLite (FTS5 for search) |
| Semantic | Distilled long-term facts ("prefers Fahrenheit") | Markdown file, human-readable and hand-editable |
| Logs | Events in time ("changed the oil at 82k miles") | SQLite: date, subject, free text, optional values (e.g. mileage) |

Facts are things that stay true. Logs are things that happened. "When did I last…?" is a query over logs, not a guess.

**Conversation recall:** "What did we talk about last week regarding the garage?" searches the episodic transcripts.

Rules:
- **Explicit writes only.** Facts are saved only when the user asks: "remember this…", "save that to memory", "keep in mind that…". The model detects the intent from flexible phrasing, with no exact trigger phrases required.
- **Writes happen in code.** Detection produces a `save_memory` tool call. The harness appends the entry to the markdown file with a date. The model never edits the file directly.
- **Echo what was saved.** Curbie confirms the exact wording (*"Saved: 'You prefer Fahrenheit.'"*) so a bad paraphrase of "that" is caught immediately.
- **Inverse operations:** "Forget that I…" and "What do you remember about me?"
- **Forget scrubs transcripts too.** Forgetting removes the fact from `facts.md` *and* redacts the matching content from stored transcripts, so conversation recall can't resurface it.
- **Forget is scoped to memory only.** It never deletes skills, timers, reminders, watchers, lists, logs, recipes, or documents. "Forget that skill" does not remove a skill. Deleting those is always an explicit action through its own command or the Manage page.
- **Recall horizon:** transcripts are kept 30 days (§4.14), so conversation recall reaches back 30 days. Anything worth keeping longer belongs in memory facts or logs.
- **Memory is a cited source.** "You told me on Sept 3 that…" When memory conflicts with a live source, the live source wins and the conflict is surfaced.
- **Retrieval, not dumping.** Each turn retrieves only the relevant memories, because full history won't fit in a small model's context.

### 4.5 Model runtime
- Ollama adapter behind a model port, so Qwen is swappable.
- Qwen 2.5 / Qwen 3 class models are trained for function calling. The 7B–8B sizes are known to be reliable at choosing tools and filling arguments; 1.5B–3B models slip more often.
- **Default: `qwen3:4b`** (owner's choice, 2026-10-02). About half the size and roughly twice the speed of 8B. The trade-off is reliability against the answer contract (§7.1, risk 1), which is settled by measurement: the Phase 1 live check compares 4B with an 8B baseline. Switching models is a config change (`CURBIE_MODEL`), not a code change.
- **Where the model runs:** on the M1, alongside Curbie. Using the 2013 Mac Pro as a remote model host was considered and dropped (§2).
- **Keep the main model loaded.** Ollama unloads idle models after ~5 minutes by default, causing a reload delay on the next question. The main model is configured to stay loaded permanently (`keep_alive`). The coding model loads on demand.

### 4.6 Notifications
Timers, reminders, watchers, and the morning briefing all produce **alerts** that must reach the user even when no chat tab is open.

- **Notification port** with multiple channel adapters:
  - **WebSocket**: live delivery to a connected web UI.
  - **Email (SMTP)**: delivery when the user isn't connected. Implemented with Nodemailer (or similar) against an SMTP provider (TBD).
  - **Voice (future)**: the Pi daemon speaks the alert.
- **Alert inbox:** every alert is persisted in SQLite with its delivery status per channel, never just emitted into the void. The web UI shows undelivered/unread alerts on the next connect.
- **Fail loudly:** a failed email send is recorded on the alert and visible in the inbox. It is never silently dropped.
- **Credentials:** SMTP credentials live in environment/config outside the repo (or the macOS Keychain), never in source.
- **Quiet hours:** during configured quiet hours (a setting, §4.17), alerts go to the inbox only, with no email (and later, no spoken alerts). Alerts the user explicitly marked **urgent** are the exception. Held alerts are delivered when quiet hours end.

### 4.7 Users
Curbie is **one shared household assistant** with no users and no sign-in (decided 2026-10-09; see §5.3). Anyone on the home network who opens it is the same user.
- Everything is shared: conversations, history, memory facts, logs, lists, reminders, watchers, alerts, and settings. Anyone on the network can see and change all of it.
- Records keep the `user_id` / owner column Phase 1 created, always set to the single seeded `owner` user. It costs nothing, and it means nothing has to be migrated if this decision is ever revisited.
- No per-person preferences: "I prefer Fahrenheit" applies to the whole household.
- The conversation ownership check in the transcript repository stays in place; with one user it always passes.

### 4.8 Processes

```
┌──────────────────────── Mac M1 (always on) ─────────────────────────┐
│                                                                     │
│  ┌─────────────── curbie (NestJS, one process) ──────────────────┐  │
│  │  Driving adapters → Core → Driven adapters                    │  │
│  │  + Scheduler ticker  + Ingestion pipeline                     │  │
│  └──────┬───────────────┬────────────────┬───────────────────────┘  │
│         │ HTTP          │ spawn          │ files                    │
│  ┌──────▼──────┐  ┌─────▼──────────┐  ┌──▼──────────────────────┐   │
│  │ Ollama      │  │ OCR helper     │  │ Data dir                │   │
│  │ Qwen3 4B    │  │ (Apple Vision, │  │ curbie.db  (SQLite)     │   │
│  │ Qwen-Coder  │  │  Swift CLI)    │  │ knowledge.db (Wiki/etc) │   │
│  │ embeddings  │  └────────────────┘  │ facts.md                │   │
│  │             │                      │ originals/ (PDFs, scans)│   │
│  └─────────────┘                      └─────────────────────────┘   │
└─────────────────────────────▲───────────────────────────────────────┘
                              │ HTTP(S) + WebSocket (LAN, open)
            ┌─────────────────┼──────────────────┐
       Phone browser     Laptop browser     Raspberry Pi
                                            (browser now, Python voice daemon later)
```

- Long-running under launchd: **NestJS** and **Ollama**. The OCR helper is spawned on demand during ingestion.
- The large knowledge index (Wikipedia, Gutenberg) lives in its own database file, separate from Curbie's operational data.
- **One generation at a time.** A single model on one M1 serializes requests. Requests queue in arrival order. Waiting for an in-progress job (e.g. the morning briefing) to finish is acceptable, so no priority scheme is needed for v1.

### 4.9 Code structure (inside NestJS)

**Core** (pure TypeScript, no IO, no framework coupling)
- Conversation orchestrator: runs a turn end to end
- Router: picks candidate skills and memory per turn
- Tool registry: skill definitions and schemas
- Policies: answer contract, web consent gate, confirm-before-save, tool-call validation, untrusted-content handling
- Use cases: `CreateTimer`, `CreateReminder`, `CreateWatcher`, `SaveMemory`, `ForgetMemory`, `AddLogEntry`, `AddListItem`, `IngestDocument`, `ScaleRecipe`, … (shared by chat and Manage)
- Domain logic: due-job selection, watcher condition evaluation, recipe quantity scaling
- Ports: `ModelPort`, `ClockPort`, `NotificationChannel`, `SearchPort`, `SkillAdapter`, repositories per store

**Driving adapters** (ways in)
- Web controllers: Handlebars chat page and Manage pages
- WebSocket gateway: streaming replies and pushed alerts
- REST API: the Pi voice daemon later

**Driven adapters** (ways out)
- Ollama (`ModelPort`)
- SQLite repositories, FTS5 and embedding search (`SearchPort`)
- Markdown facts store
- RSS, weather, calendar, web search, and quick-facts adapters
- mathjs evaluator
- SMTP and WebSocket notification channels
- OCR helper invoker

**Infrastructure**
- Scheduler ticker, ingestion worker, config/secrets, TLS, turn tracing

### 4.10 Key flows

**Chat turn**
1. Message arrives over WebSocket, and the core loads recent conversation context for that user.
2. `@mentions` are resolved first (§4.3.4). Mentioned skills replace routing, and a bare mention executes directly. Otherwise, the router selects candidate skills. Relevant memory, documents, and knowledge passages are retrieved (each with a source ID).
3. The prompt is assembled: system rules, skill descriptions, retrieved passages (marked as untrusted data), history.
4. The model returns a tool call or an answer.
5. Tool call: validate against the schema → policy checks (consent? confirmation?) → execute the adapter → trim the result → back to step 4.
6. Answer: answer-contract check (§5.1: citations, quote verification) → checking pass → persist transcript and turn trace → stream the reply.

**Scheduler tick**
1. The ticker queries due jobs (timers, reminders, watcher checks, briefing).
2. Each job executes: fire the timer, evaluate the watcher condition, or compile the briefing.
3. The result becomes an alert, persisted to the inbox.
4. The dispatcher delivers it to the channels (WebSocket if connected, email per policy) and records status per channel.

**Ingestion**
1. A file is dropped or uploaded, and its type is detected.
2. Text is extracted, using the OCR helper if the file is image-only. It fails loudly if there's no usable text.
3. The content is structured (recipe fields, device catalog entry), chunked, and indexed (FTS5 plus embeddings). The original is kept.
4. The user reviews and corrects it in Manage.

### 4.11 Conversation context management
A small model can't hold long chats. A policy is needed for how many recent turns go into each request and when older turns are summarized or dropped. **Undecided.** To be settled by experimenting once the chat loop exists.

### 4.12 Observability
Every turn records a **trace** (retained 30 days, §4.14): what was retrieved (with source IDs), which tools were called with which arguments, what each policy decided, the checking-pass verdict, and the final answer category (cited / don't-know / generated / conversational). This is essential for debugging routing with a small model, and stored traces can feed a future "show your work" panel.

### 4.13 Time and locale
- All timestamps are stored in **UTC**.
- A configured **home time zone** is used to interpret relative times ("at 5", "tonight", "tomorrow morning") and to display times.

### 4.14 Data retention
- **Transcripts, alerts, and turn traces: 30 days.**
- A purge job runs on the polled scheduler and deletes expired records.
- Memory facts, logs, lists, recipes, documents, and skills are **not** subject to retention. They persist until explicitly deleted.

### 4.15 Reliability
**Degraded mode: say what's broken, never guess.** When a dependency fails (Ollama down, weather API unreachable, internet out), Curbie states exactly that (*"The weather service isn't responding"*) rather than falling back to a guess. Dependency status is tracked by self-monitoring (§4.20) and shown on the Health dashboard.

**Caching:**
- Weather and RSS results are cached, and answers state the data's age (*"as of 10 minutes ago"*).
- The weather provider's plan appears to limit calls on an hourly basis (to be confirmed when the provider is chosen). The cache TTL and the call budget shared by chat, watchers, and the morning briefing will be set to fit that limit.

### 4.16 Persona and response style
- A single **persona file** defines Curbie's tone, verbosity, and personality.
- **Response style per interface:** screen answers can be fully formatted (e.g. a recipe as a full list). Voice answers (later) must be short and step-by-step. The interface tells the core which style to use, so adding voice doesn't require rewriting skills or prompts.

### 4.17 Settings
Settings are **configuration, not memory**, and are kept separate from `facts.md`. They're **stored in SQLite** and editable in a **Settings panel** in Manage.

**One level: household.** With no users (§4.7), every setting applies to the whole household: home location, home time zone, morning briefing contents and time, alert email address, units, quiet hours, and email notification preferences. Alerts are delivered using these household settings.

The Settings mockup (`docs/mockups/settings.html`) still shows separate **Household** and **Your settings** groups from before this decision; the built page merges them, or keeps both headings purely as visual grouping.

### 4.18 Clarify, don't guess
When a request is ambiguous, Curbie **asks a clarifying question** instead of silently assuming. Examples: "Remind me Tuesday" said on a Tuesday (today or next week?), or "Add that to the list" when there are several lists. This is the action-skill counterpart of "I don't know."

### 4.19 Undo
"Undo that" / "Cancel that" reverses the most recent action (a wrong list item, a mistaken reminder). Every action use case records what it did so it can be reversed.

### 4.20 Self-monitoring and the Health dashboard
Curbie watches itself and its environment, shows the results on a dashboard, answers questions about its own health in chat, and warns the user when something breaks (e.g. the internet goes down).

**Health checks:** small adapters behind one `HealthCheck` port. Each returns a status (**ok / degraded / down**), a detail message, and a checked-at time.

| Check | What it verifies |
|---|---|
| Internet | Connectivity, via multiple probe targets (see below) |
| Ollama | Running, main model loaded, response latency |
| External services | Each API a skill depends on (weather, RSS feeds, web search), plus SMTP |
| USB data drive | Mounted, writable, free space |
| Database | SQLite integrity (`PRAGMA quick_check`) |
| Scheduler heartbeat | Time since the last tick. Catches a stalled scheduler that would otherwise silently stop firing timers. |
| Backups | Age of the last backup, if the owner's backup job writes a timestamp file Curbie can read |
| TLS certificate | Days until the local certificate expires |
| Pi (later) | Reachable on the LAN |

**Health monitor:** a job on the polled scheduler runs all checks every few minutes and stores results in SQLite. This gives history, not just current status: an **incident log** such as *"Internet down 2:14–2:41am."* Health history follows the 30-day retention policy (§4.14).

**Two views of the same data:**
- **Health dashboard** in the UI: a tile per check with current status, plus the recent incident log.
- **Health lookup skill** in chat: "Is everything OK?", "When did the internet last go down?", `@health`. Answers are built from stored check results and **cited like any other source**.

**Alerting rules:**
- **Alert on status transitions, not on every failed check.** An hour-long outage produces exactly two alerts: *"Internet is down"* and *"Internet is back after 47 minutes."*
- **Confirm before alarming:** a check is marked down only after several consecutive failures. Internet status uses more than one probe target, so one slow site doesn't look like a dead connection.
- **Email can't report its own outage.** When the internet is down, the alert goes to the inbox and any connected LAN browser, which work without internet. The email is sent once connectivity returns, including the full outage window.
- **Distinguish failure modes:** "your internet is down," "the weather API is down but the internet is fine," and "Ollama isn't responding" are different alerts with different wording.
- Health alerts respect quiet hours (§4.6) unless marked urgent in settings.

**Safety:** the internet check **never runs `ping`** or any other command (§5.7). It uses Node's DNS and network APIs against a **fixed list of probe targets defined in code**. The model has no influence over what is checked.

**Known limitation:** if Curbie itself is completely down (Mac off or frozen), nothing can alert. launchd restarts it after a crash, but total failure is invisible from inside. A future mitigation: the Pi periodically checks that the M1 is alive and alerts independently.

## 5. Guardrails (policies)

Cross-cutting policies enforced by the core.

### 5.1 Grounding / answer contract
Every answer is one of:
1. Grounded in a **cited** source: a skill result, a Wikipedia article, a document, memory, or a consented web result.
2. An explicit **"I don't know"** / "I don't have that in my sources."
3. Clearly labeled **generated** content (e.g. code Curbie wrote). This is Curbie's own output, not sourced fact.
4. **Conversational** replies: casual chit-chat, jokes, small talk. Allowed freely, as long as they contain **no uncited factual claims**.

No silent answers from model memory. Factual claims never hide inside generated or conversational content.

**Honesty stance:** no design can make a language model incapable of a bogus answer. The goal is layered defenses that make bogus answers rare, catch most of them, and make the rest visible. Curbie never trades accuracy for agreeableness.

**Enforcement (in code, not the prompt):**
- Every retrieved passage or tool result handed to the model carries a **source ID**.
- The model returns **structured output**: the answer text, its category (cited / don't-know / generated / conversational), and the source IDs it relied on.
- The harness verifies that cited source IDs were **actually retrieved in this turn**. A "cited" answer with no sources, or one citing an ID it was never given, is rejected (re-prompt once, then fail loudly as "I don't know").
- Citations shown to the user are rendered by the harness from the source records, not from model-written text.

**Quote-backed answers:** citation checks alone can't catch a model that cites the right source but garbles what it says. For document, manual, and recipe answers especially, the model must include the **exact passage** it relies on, and the harness verifies the quote appears verbatim in the retrieved text. A failed quote check is treated like a failed citation.

**Checking pass:** after a draft answer is produced, a **separate model call** checks it against the retrieved passages: *is every factual claim supported?* Unsupported claims cause the answer to be rejected or downgraded to "I don't know." This also polices conversational replies for slipped-in facts. It adds latency per answer, which is acceptable.
- **Known limitation:** the checking pass uses the same model that wrote the answer, so it is **not an independent check** and may share the writer's blind spots. A separate call with a narrow "is this supported?" question still catches a lot, but it should not be treated as stronger than it is. The code-level checks (source IDs, verbatim quotes) are the hard guarantees. The checking pass is a best-effort layer on top.

**Hold ground without new evidence (anti-sycophancy):** Curbie changes an answer only when there is **new evidence**, such as a new source or an explicit correction from the user. Pushback alone ("Are you sure?", "I think it's actually X") triggers a re-check against the sources and a reaffirmed answer, never a reversal to agree with the user. An explicit user correction is treated as new information and is stated as such ("Going by your correction…"), not presented as sourced fact.

### 5.2 Web consent gate
- Web search is a registered tool, but the harness **refuses to execute it without explicit user approval in that turn.**
- Flow: local sources come back empty → *"I don't have that in my sources. Want me to check the web?"* → user says yes → search → answer labeled as web-sourced, with links.
- This generalizes into a **confirmation mechanism** for any future risky or outward-facing action skill.
- **`@web` is explicit consent.** A user-typed `@web` in a message authorizes a web search for that turn, with no extra confirmation question.

### 5.3 Authentication
**None, by the owner's decision (2026-10-09): Curbie is an open chat for anyone on the home network, permanently.** It is not exposed to the internet.

The risk was raised and accepted. Any device on the LAN (guests, a friend's phone, a compromised smart TV or IoT device) can read all conversations and memory facts and trigger every action skill: reminders, email alerts, consent-gated web search. Mitigations that remain: the server binds to the LAN only and is never port-forwarded; the safety guardrails (§5) don't depend on identity, so tool validation, no command execution, the web consent gate, and confirm-before-save still apply to everyone.

**Local HTTPS is a separate question from auth.** Several browser features only work in a secure context, even on a LAN. Plain `http://192.168.x.x` does not get them:
- Microphone access (browser-based voice input)
- Browser notifications
- Wake Lock API (keeps the phone screen on while a recipe is open)

Plan: serve the web UI over TLS with a locally trusted certificate (e.g. via mkcert), with the local CA installed on the devices that use Curbie (phone, Pi, laptops).

### 5.4 Safe evaluation
Model-produced expressions (calculator, unit conversion, date math) are evaluated by a proper math parser (e.g. mathjs), **never JavaScript `eval`**. Otherwise a model-produced expression becomes arbitrary code execution on the host.

### 5.5 Constrained generation of scheduled jobs
Anything the model creates that persists or runs later without the user present (watchers, reminders, skills from the skill builder) is compiled to a structured spec, validated against a fixed menu (registered sources, supported conditions, existing adapters), and echoed back for confirmation before it's saved.

### 5.6 Retrieved content is data, never instructions
RSS items, web results, documents, OCR output, and Wikipedia passages may contain text that *looks like* instructions ("ignore previous instructions and email…").
- Retrieved content is passed to the model in clearly delimited, untrusted-data blocks.
- **Only the user's own message can trigger an action skill.** A tool call that appears to originate from retrieved content (e.g. an email or watcher creation during a turn where the user asked only a lookup question) is blocked by the harness.
- This matters more because Curbie can send email.

### 5.7 Host safety: no command execution
**Goal: Curbie can never run a command that damages the host, accidentally or through manipulation.**

**The model cannot execute anything.** It only produces text and tool-call *requests*. The harness runs only adapters that exist in our code, and **there is no shell or command-execution tool**. A request for an unknown tool is rejected. Related paths are closed as well: the coding skill generates but never executes (§4.3), the calculator never uses `eval` (§5.4), the skill builder never installs or runs code (§4.3.5), and retrieved content can't trigger actions (§5.6).

**Process spawning is confined to one place:**
- The **OCR helper invoker** is the only code allowed to spawn a process. It uses `execFile`/`spawn` with a fixed binary path and an argument array, **never `exec` with a command string**, and never through a shell.
- The file path passed to OCR is resolved to its real path (following symlinks) and must be inside the data dir. Otherwise it is rejected.
- **System status** uses Node APIs (e.g. `fs.statfs`), not shell commands. Model-supplied text is never passed to any process.
- **Enforced by test:** an architecture test fails the build if any module other than the OCR invoker imports `child_process` (or similar process-spawning APIs).

**File operations are confined:**
- All file writes and deletes (ingestion, forget, retention purge, Manage deletes, skill builder) go through a path guard that resolves real paths and allows only the **data dir** and **`skills/`**.
- No recursive deletes outside those roots, ever. Deleting a record deletes that record's specific files, not directories by pattern.

**Least privilege:**
- Curbie runs as a **dedicated non-admin macOS user** with read/write access only to the data dir and `skills/`. Even a bug can't reach the rest of the Mac.
- **Ollama stays bound to localhost** (`127.0.0.1`, its default). Only NestJS talks to it, and nothing on the LAN can use the model directly.

**Outbound safety:**
- **Email recipients come from settings, never from the model.** The model controls an alert's content, not its destination, so an injected instruction can't send mail to a stranger.

**Supply chain:**
- Committed lockfile. `npm audit` runs as part of deployment.

## 6. Local Wikipedia and offline knowledge

- **Source: Kiwix ZIM files**, read directly by the indexer through `@openzim/libzim`. No Kiwix software runs on the host. Download details are in `docs/installation.md` §4.
- **Initial collections (~91 GB before indexing):**
  - **Wikipedia:** `wikipedia_en_all_nopic`. All English articles, full text, no images (49 GB). `mini` variants are rejected because they hold only article intros, which would undermine grounded answers.
  - **Project Gutenberg, by Library of Congress subject class:** PR (English literature, 15 GB), PS (American literature, 15 GB), and T (Technology, including cookery, 12 GB). The full English collection (206 GB) is not downloaded. Other classes (e.g. PZ fiction, PQ and PG translated classics) are added as needed.
- **Optional later sources** through the same pipeline: iFixit, Stack Exchange, and DevDocs ZIMs.
- Keyword search (SQLite FTS5) over the full set is cheap. Embedding all ~7M Wikipedia articles is heavy, so a hybrid approach is likely. **Indexing strategy is still open** (§8).
- Simple English Wikipedia (`wikipedia_en-simple_all_nopic`, 1.0 GB) remains an option for proving the indexing pipeline quickly before running it on the full 49 GB file.
- Whole books don't fit in context, so questions are answered from retrieved passages. Requests like "summarize all of *Moby-Dick*" exceed what retrieval can honestly do, and Curbie should say so.

## 6a. Out of Scope (for now)

- **Phone push notifications** (ntfy, Pushover). Email covers out-of-UI delivery.
- **Home automation** (Home Assistant).
- **Music control** is deferred, not rejected.

## 6b. Repository Layout & Data

**One repo**, with a top-level folder per sub-project (folder names proposed):

```
ai-assistant/
├── docs/        # design and planning docs
├── server/      # NestJS app (core, adapters, web UI)
├── ocr/         # Swift CLI wrapping Apple Vision
├── voice/       # Python voice daemon for the Pi (later)
└── skills/      # skill documents (versioned with the code)
```

**What lives where:**

| Data | Location | Backup |
|---|---|---|
| Skill documents, config (non-secret) | Repo | Git |
| Memory facts (markdown) | Data dir, outside the repo | Same backup job as the databases |
| SQLite databases (conversations, jobs, alerts, logs, lists, recipes, documents index) | Data dir, outside the repo | Owner-scheduled backup job |
| Original files (PDFs, scans) | Data dir, outside the repo | Same backup job (irreplaceable) |
| Knowledge index (Wikipedia, Gutenberg) | Data dir, outside the repo | Rebuildable from the dumps, so backup is optional |
| Secrets (API keys, SMTP) | Env / Keychain | Never in the repo |

**Data dir on an attached USB drive:** the data dir (databases, facts, originals, knowledge index) lives on an external USB drive attached to the M1, because full Wikipedia, Gutenberg, scans, and indexes may exceed 100 GB. Consequences:
- **Fail loudly if the drive isn't mounted.** On startup, and on every write, Curbie verifies the data dir is present and writable. If it isn't, Curbie refuses to start (or enters degraded mode with a clear message), rather than silently creating an empty data dir on the internal disk.
- **Startup ordering:** the launchd service must not start until the drive is mounted. The startup check above backs this up.
- **Backups go somewhere other than the same USB drive.**
- The Health dashboard (§4.20) shows drive status and free space.

**Why memory facts are not in the repo:** the facts file holds personal information about the owner and possibly household members. In git, "Forget that…" couldn't truly forget (the fact would persist in history), and pushing the repo to any remote would copy everyone's personal facts there. Facts live in the data dir and are backed up with the databases. The data dir is never committed.

## 6c. Schema Migrations & Deployment

**Migrations only.** Every SQLite schema change is a versioned, forward-only migration checked into the repo. Tables are never hand-edited. The recipe archive, logs, and memory-adjacent data depend on this.

**Migration tool (decided in Phase 1):** a small in-house migrator, no third-party dependency. Migrations are numbered 1..n in `server/src/constants.ts` (`MIGRATIONS`), each applied in its own transaction and recorded in `schema_migrations`. The migrator refuses a gap in the numbering and refuses a database carrying a migration the code doesn't know.

**Deploying updates to the M1:**
0. Make sure any skills created by the skill builder (uncommitted changes in `skills/`) are committed or discarded first. The owner does this manually before deploying.
1. Pull the latest code, install dependencies from the lockfile, and run `npm audit`.
2. Run migrations. **If a migration fails, stop. Don't restart on a half-migrated database.**
3. Restart the service via launchd.

## 7. Testing approach

- Unit tests for core logic: routing, policies, tool-call validation, memory rules. These use a fake model adapter.
- **Honesty evals:** a set of questions Curbie *shouldn't* be able to answer, to verify it admits ignorance instead of making things up.
- **Memory evals:** phrases that should and should not trigger memory writes.
- **Watcher-builder evals:** natural-language requests → expected watcher specs, including requests that must be rejected (unregistered sources, unsupported conditions).
- **Answer-contract tests:** answers citing unretrieved source IDs, "cited" answers with no sources, and quotes that don't appear in the retrieved text must be rejected.
- **Checking-pass tests:** drafts with unsupported claims (including facts slipped into chit-chat) must be caught.
- **Pushback tests:** deliberately challenge *correct* answers ("Are you sure?", "I think it's X") and verify Curbie re-checks and holds its ground. Also verify that a genuine correction with new information is accepted and labeled as user-provided.
- **Injection tests:** retrieved content containing instructions, or containing `@mentions` such as `@web`, must never trigger a skill or count as consent.
- **Skill-builder tests:** the wizard produces valid skill files, rejects configs whose dry run fails, flags descriptions that fail the routing check, and never installs generated adapter code.
- **Host-safety tests:** architecture test that only the OCR invoker imports `child_process`; unknown tool calls (e.g. a requested shell command) are rejected; path guard rejects paths outside the data dir and `skills/`, including via symlinks and `..`; email recipients cannot be set by model output.
- **Health-monitoring tests:** alerts fire only on status transitions (one down, one recovery), a single failed probe doesn't mark a check down, an internet outage queues the email until connectivity returns, and failure modes produce distinct messages. The architecture test confirms health checks don't spawn processes.
- **Forget tests:** forgetting removes the fact and its transcript content, and never deletes skills, timers, watchers, lists, logs, or recipes.
- **Ambiguity tests:** ambiguous requests produce a clarifying question, not a guess.
- **Mention tests:** aliases resolve to the right skill and preset arguments, unknown mentions fail with a suggestion, and a mention restricts the model to that skill's tools.
- **Model-upgrade gate:** when swapping or upgrading the model, the full eval suite (honesty, memory, watcher, answer contract, checking pass, pushback, injection, forget, ambiguity, mentions, skill builder) runs and results are compared against the current model before switching.
- **TDD for this project.** Tests are written before implementation. This is an explicit project-level choice by the owner, overriding the default of tests-after.

### 7.1 Known risks to test early
Raised in a design review (2026-10-02). These are the assumptions everything else depends on, so they should be measured on the real M1 as soon as possible, not discovered late.

**1. Model reliability (the biggest risk).** The design assumes the chosen Qwen model (default 4B, §4.5) reliably picks the right tool, fills arguments correctly, returns a valid structured answer, and quotes sources exactly. If it often fails, the answer contract falls back to "I don't know." The system would be *correct* but would feel useless.
- Treat Phase 1's live verification on the M1 as a **go/no-go gate**, not a formality.
- Measure, don't eyeball: run a fixed set of questions and record how often answers are accepted on the first try, how often they need the one re-prompt, and how often they fall back to "don't know." Turn traces (§4.12) hold this data.
- LM Studio chats don't test this, because nothing checks the model's output there.
- **Compare models with the same questions:** `qwen3:4b` and `qwen3:8b` (the baseline), both on the M1. Keep 4B as the default only if its numbers are close to 8B's.
- If reliability is poor, likely levers: prompt and schema simplification, a different Qwen size or version, or relaxing a rule. Decide with data.

**2. Latency (low risk, but measure).** The owner has run larger models on the M1 through LM Studio with a couple of seconds of delay, which is acceptable. Speed per call is not expected to be a problem. What differs in Curbie:
- **Several sequential calls per answer:** gather with tools, then finalize (Phase 1), plus the checking pass (Phase 8).
- **No streaming in Phase 1:** the structured answer is verified before display, so nothing appears until it passes.
- **Longer prompts once retrieval arrives:** retrieved passages increase prompt-processing time before the first token.
- Record time-to-reply in the Phase 1 live check, and again after the checking pass and retrieval are added.

**3. Retrieval quality over large knowledge bases.** The model never searches the 49 GB itself. The indexer builds the search index ahead of time, and each turn gives the model only the few best-matching passages. Collection size doesn't change the model's workload. It changes index build time and how hard it is to find the *right* passage among many near-matches.
- **Develop and test against a subset first** (a "shim"): Simple English Wikipedia (1.0 GB), a topic collection (a few hundred MB), `top_nopic` (2.6 GB), or a script that extracts a chosen set of articles from the full ZIM. All go through the same ZIM reader and pipeline, so only the input changes.
- Benefits: rebuilds take minutes instead of hours, so chunking and ranking can be iterated quickly; and a known subset allows **retrieval tests with an answer key** (questions paired with the article that should be found), which separates "retrieval missed it" from "the answer isn't in the collection."
- Move to the full `wikipedia_en_all_nopic` only once retrieval works well on the subset. This also feeds the open indexing-strategy question (§8).

**4. Breadth before real use.** Many features (multi-user, skill builder, watcher builder, briefing, Manage pages) are designed before any real conversations with Curbie. The design is coherent, but daily use will reshape priorities. Consider using Curbie for a while after the core pieces work (chat, documents and recipes, a Wikipedia subset) and revisiting the phase order with that experience.

## 8. Open Questions

- Model confirmation: `qwen3:4b` is the default pending the Phase 1 comparison with `qwen3:8b`.
- Web search provider.
- Weather API provider (AccuWeather or alternative), API key handling, and its actual rate limit (believed hourly, to be confirmed).
- Persona file contents (tone, verbosity).
- Default quiet hours, and how an alert gets marked urgent.
- Knowledge indexing strategy (FTS5 vs. hybrid with embeddings) for Wikipedia and Gutenberg (§6).
- Embedding model for semantic search.
- SMTP provider (and sending address) for email notifications.
- Delivery policy: when to email (only when no UI is connected? always? per alert type?).
- In-browser alert presentation (browser notification, sound).
- Policy for jobs that came due while the host was down: fire late, or mark missed and report.
- Conversation retention basis: is the 30 days counted from when a conversation started or from its last message (relevant now that conversations can be resumed, §4.1.2)?
- Conversation context policy: turns per request, summarization (§4.11).
- Recipe ingestion flow: batch scanning (scanner vs. phone photos) and how recipes are reviewed before indexing.
- Model swapping: acceptable load latency when switching between the general and coding models on 16 GB.
- Local TLS setup and certificate distribution to devices.
- Watcher condition types for v1 (threshold, keyword match, others?).
- Morning briefing contents and schedule.
- Calendar source (which calendar service).
- Voice: where transcription runs (Pi vs M1), wake word choice.
