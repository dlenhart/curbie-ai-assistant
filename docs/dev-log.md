# Curbie — Development Log

A running, chronological record of how Curbie is being built with Claude Code: the plans, the ideas tried and dropped, the pivots, and the decisions that stuck. Raw material for a step-by-step blog post.

Each entry covers one working session: what we set out to do, how it unfolded, what got decided (and why), and what was produced. Newest entries go at the bottom.

---

## Session 1 — 2026-10-01: From idea to design doc to build plan

**Goal:** turn a vague idea ("a small local AI assistant") into a complete design before writing any code.

**Shape of the session:** about three hours of back-and-forth, with no code written. The pattern that repeated all session: the owner brings an idea, Claude explains what it implies for the architecture and flags any risk, a decision is made, and Claude writes it into `docs/design.md`. Several of the best decisions came from one side pushing back on the other.

### 1. The pitch: "is this doable?"

The opening idea was a lightweight assistant on a small model like Qwen, with a chat interface and "some kind of document (much like skills in Claude)" that it looks things up in. For example, a weather section that knows how to call AccuWeather's API.

Claude's first answer reframed it in standard terms: **tool calling plus skill routing**. The model doesn't need to know how to reach AccuWeather. It needs to recognize a weather question and emit a structured request like `get_weather(location=…)`, and the *harness* (our code) makes the real HTTP call. Key points from that first answer, all of which carried through to the final design:
- Qwen 2.5/3 are trained for function calling. The 7B–8B sizes are reliable, while 1.5B–3B models slip more often.
- The real engineering is in the harness, not the model: routing as the skill count grows, a tight context budget (trim API payloads), and validating tool calls.
- It maps cleanly onto **ports and adapters**: the model and every external API are adapters, so Qwen stays swappable.

The owner asked to "plan this out perfectly." Claude asked to hear the other ideas first, because memory, scheduling, and actions would each change the core design.

### 2. The wish list and the first architectural consequences

The owner listed a web chat UI (voice later, maybe a wake-word daemon), news (Slashdot, Google News, local), weather, "set a timer for 15 minutes," general questions (maybe a local Wikipedia), and one principle: *"I want this to be as dependent on what we provide it as possible. I don't want it going off on tangents."*

Claude mapped each idea to the architecture:
- **Voice** is just another interface adapter, so the core never knows which interface it's talking to.
- **News** is one generic RSS adapter configured with feeds, not one adapter per site.
- **The timer is the one that changes the architecture.** It's the first *action skill*: it outlives the request, so it needs a background scheduler, a push channel to the UI, and persistence so a restart doesn't drop it.
- **Local Wikipedia** through Kiwix ZIM dumps fits the "only what we provide" goal.
- **"Only what we provide" has to be enforced by the harness, not requested in the prompt**, because small models happily answer from training data.

### 3. The honesty principle (pushback #1)

Claude's first draft said "no open web access." The owner pushed back: *"Let's not say NO open web access. I think if the assistant doesn't know, it should ask, do you want me to check the web? We don't just want to make the user happy. We need to be factual and up front when we don't know an answer."*

This became Curbie's defining principle, **factual over agreeable**, and it produced two mechanisms:
- **A consent-gated web tool.** The model can *propose* a web lookup, but the harness refuses to run it without an explicit yes that turn. Claude's reasoning: "A small model told 'ask first' will eventually skip asking, but a harness that blocks the call can't be talked around." This is the origin of *policies are enforced in code, not prompts*.
- **The answer contract.** Every factual answer is either grounded in a cited source or an explicit "I don't know."

### 4. Hardware

The host is a Mac M1 with 16 GB, always on, with a Raspberry Pi as a future thin client. The owner asked whether a 2013 Mac Pro (32 GB, running Bazzite Linux) could run Qwen. Claude's answer: it would run, but badly. Its Ivy Bridge Xeon lacks AVX2/FMA, its FirePro GPUs are GCN 1.0 with no ROCm support, and slow prompt processing would hurt retrieval-heavy answers. The M1's unified memory and Metal acceleration win despite half the RAM. Consequence: the host becomes a LAN service, so it needs a defined API and authentication.

### 5. Stack: a misunderstanding that resolved well (pushback #2)

The owner said "Python backend, and TS/Node are fine. You can use NestJS." Claude pushed back on what sounded like *two* backends (an extra network hop, two type systems, two runtimes under launchd for a single-user app) and argued NestJS could carry the whole backend. The owner clarified: *"Dude, NestJS can act as a front end as well… I was originally hinting at using NestJS as a front end tool. It can do the web UI."*

Result: **one NestJS process** serves the core, skills, scheduler, WebSocket push, and the UI. The owner chose **Handlebars templates and a hand-rolled client script, no frontend framework**. Python is reserved for the Pi voice daemon or an ML sidecar if ever needed.

### 6. Memory, and naming the layers (pushback #3, from Claude)

From outside research, the owner proposed layers: "The Core" (the model), a memory layer (markdown or a database), and "guardrails" (UI, actions, schedulers). Claude split memory into **conversation history in SQLite** and **long-term facts in a Markdown file** that can be opened and audited by hand. Then it pushed back on the naming: in ports and adapters, *the core is our logic* (orchestration, routing, policies), and the model is just an adapter like AccuWeather. "Guardrails" should mean policies, not the UI and timers. The owner agreed, and the five-layer architecture (Interfaces → Core → Capabilities / Memory / Model runtime) came out of this exchange.

Memory is written **only on explicit request** ("remember this…", "save that to memory"). Claude added the details that make that trustworthy: the harness echoes exactly what it saved (*"Saved: 'You prefer Fahrenheit.'"*), the model detects the intent but code performs the write, and there's an inverse "forget that…".

### 7. Documenting, and the name

Claude offered to write the decisions down. The owner said yes, asked for a `docs/` folder, and named the system **Curbie**. `docs/design.md` was created, and from here on every decision was written into it as it was made.

### 8. The scheduler: a concern sharpened into a better design (pushback #4)

The owner raised a design concern: *"NestJS has an @Schedule decorator. If we need to create a timer on the fly… we'd have to restart the app. That's bad design."* Claude agreed static scheduling would be bad, but corrected the premise: `SchedulerRegistry` can add timers at runtime. Then it pointed out the *real* problem the owner's instinct was circling: those timers live only in memory, so a crash or reboot silently loses them. Two options were laid out:
- registry plus rehydration (two copies of state, and Node's `setTimeout` caps at about 24.8 days)
- a **DB-polled scheduler**: one ticker every second queries SQLite for due jobs

The owner chose the polled approach: one source of truth, restarts handled by construction, and testable with a fake clock.

### 9. Brainstorming features

Claude proposed a menu grouped by architecture: more lookup skills, more action skills, scheduled/proactive jobs, and memory-powered recall. The owner's reactions:
- **Appliance manuals:** "I LOVE THIS… 'How do I reset the front panel on my microwave?'" Claude added a device catalog so "my microwave" resolves to the right manual, and loud failure for scanned PDFs with no text.
- **Project Gutenberg**, a **calculator** (Claude: through a math parser, *never* `eval`, or a model-written expression becomes code execution), **logs/journals**, and the **morning briefing** (code orchestrates the steps, and the model only writes the summary).
- **Watchers**, with a twist from the owner: they must be created *by the user*, so there needs to be a **watcher-builder** skill. Claude constrained it: the request compiles to a structured spec, it's validated against a fixed menu of sources and conditions, and it's echoed back for confirmation.
- **Rejected:** phone push notifications and home automation. **Deferred:** Spotify control.
- Dropping push notifications created a gap: alerts would vanish if no tab was open. That led to the **alert inbox**, and the owner added **email via SMTP**.

### 10. Manage UI, light coding, and recipes

The owner asked for a way to manage watchers, timers, skills, and memory, plus "light coding in this chat window." Claude proposed the **Manage section**, with the key rule that *chat and Manage call the same core use cases* (one `CreateTimer` for both). Light coding became a third answer type, **generated**: Curbie writes code but never runs it.

Then came the most enthusiastic moment of the session: *"Recipes, holy shit this is great. I have a whole manila folder I can scan… pull up a chat window on my phone and ask for the recipe to our Texas sheet cake."* This made OCR a core feature. Claude recommended **Apple Vision** (on-device, better at handwriting than Tesseract) through a tiny Swift CLI. It also recommended keeping the original scan and showing it beside the answer, because "'1 tbsp' read as '1 tsp' ruins the Texas sheet cake." It flagged that phone features like the Wake Lock API need **local HTTPS** even on a LAN, which led to mkcert.

### 11. Architecture breakdown and a numbered gap list

The owner asked for the architecture. Claude produced the process diagram, the code structure inside NestJS, and the three key flows, then listed 11 gaps. The owner answered them as a numbered list:
- **How the answer contract is enforced:** source IDs checked in code.
- **Prompt injection:** retrieved content is data, never instructions.
- **Users:** "me and maybe the household."
- **One generation at a time:** fine with waiting.
- **Also settled:** traces, a model-upgrade eval gate, UTC timestamps, and one repo with a folder per sub-project.

**Pushback #5, from Claude:** the owner wanted the memory markdown in the repo. Claude disagreed: "forget" can't truly forget if the fact lives on in git history, and pushing the repo anywhere would ship household members' personal facts with it. The owner replied, *"I get your concern, I'm fine with the recommendation."* Facts now live in the data dir.

### 12. "Are we a closed system?" (pushback #6)

Claude listed exactly what crosses the network: weather, RSS, consented web search, and SMTP (easy to forget: email content leaves the house). It proposed an outbound **host allowlist** to make "closed" enforceable. The owner rejected it: *"I need Curbie to be able to go to the web when allowed."* The consent gate stays the control.

### 13. Conversation and "at all costs"

Asked whether Curbie could carry a conversation, Claude explained that multi-turn works within a conversation, that continuity across conversations comes from memory, and that the grounding contract makes Curbie a poor casual chatter. The owner allowed chit-chat freely "as long as it doesn't slip," and added: *"I don't want Curbie constantly trying to please me with bogus answers. Claude does this sometimes and I want to prevent that at all costs."*

Claude's honest answer: no design makes a model *incapable* of bogus answers, but layered defenses make them rare and visible. It identified a gap: a model can cite the right source and still garble it. This added:
- **quote-backed answers**, verified against the retrieved text
- **a checking pass**, a second model call that asks "is every claim supported?"
- **holding ground:** Curbie changes an answer only on new evidence, never because the user sounded doubtful. "Are you sure?" gets a re-check, not a reversal.
- **pushback tests** that challenge *correct* answers on purpose

### 14. Skills in detail, @mentions, and the skill builder

- **Skills:** a markdown document (frontmatter with name, description, kind, adapter, and tool schemas, plus a body with instructions) paired with a TypeScript adapter. They load in three tiers, like Claude skills.
- **@mentions** (the owner's idea): `@weather` or `@slashdot` force routing. They're parsed in code before the model sees anything, aliases can preset arguments, a bare mention runs directly, and unknown mentions fail loudly ("did you mean @weather?"). `@web` counts as consent.
- **Skill builder** (the owner's idea, triggered by mention): "a skill that helps build a skill." Claude designed it as a code-driven wizard, because small models are poor at multi-step interviews. It includes a dry run and a routing check. It fully builds config-only skills, but only *drafts* new integrations and never installs code.

### 15. A sweep of smaller policies

Claude listed 13 remaining design gaps, and the owner settled them quickly:
- **Forget** touches only memory, never skills or timers.
- **30-day retention** for transcripts, alerts, and traces.
- **Migrations only**, no hand-edited tables.
- **Clarify, don't guess**, plus **undo**.
- **Degraded mode** that names exactly what's broken.
- **Caching** for the hourly weather API.
- The **main model stays loaded**.
- A **persona file** with screen vs. voice styles.
- **Settings stored separately from memory.**
- **Quiet hours.**
- **No roles** for now.

### 16. An outside article

The owner shared a Wired article on running local LLMs. Claude's verdict: "Honestly, not much." It confirmed existing choices (Apple Silicon, 16 GB, Ollama). Two ideas were noted for later and not adopted: MLX-based runtimes (an adapter swap thanks to the model port), and vision models for reading recipe cards. Claude steered away from vision models as the primary path because they give a *plausible* reading of messy handwriting with no signal they guessed, whereas Apple Vision gives per-line confidence scores.

### 17. Final gap check and process choices

Claude re-read the whole doc. It found six internal inconsistencies and four real gaps:
- the skill builder writing into a repo that deploys `git pull` into
- per-person settings, such as whose email an alert goes to
- disk space for Wikipedia
- the checking pass not being an independent check

The owner resolved them: commit skill-builder output by hand, settings in the DB with a UI panel, and data on an attached USB drive. Then came a process decision: *"I'm a fan in this instance of doing TDD, even though my global will tell you not to. I'm also a fan of sub-agent driven… just letting you test and build the whole thing and at the end I'll check it out."*

### 18. Security: "is the model going to execute command line operations?"

Claude's answer: no. The model only produces text and tool-call requests, there's no shell tool, and unknown tools are rejected. The only process-spawning code is the OCR invoker (fixed path, argument list, path-checked), enforced by an architecture test that fails the build if anything else imports `child_process`. Also added:
- a path guard limiting writes to the data dir and `skills/`
- running Curbie as a non-admin macOS user
- Ollama kept on localhost
- email recipients only from settings
- `npm audit` on deploy

The owner's framing: *"I don't want it accidentally running a local command that wipes my computer."*

### 19. Scope and the build plan

Scope was set to everything except voice, the Pi daemon, and music. Claude checked the dev machine and found an M2 without Ollama, so real-model testing would happen on the M1. The **Phase 1 plan** was written with the Superpowers `writing-plans` skill, after checking current package versions: 12 test-first tasks, full code, and a phase map (Phases 1–11). Decisions the plan made:
- **NestJS 11, not 12:** 12 is ESM-only, which breaks Jest.
- **TypeScript 5.9:** ts-jest doesn't support 7.
- **A small home-made migrator.**
- **A marker-file check** so a missing USB drive fails loudly.
- **Loopback only** until auth and TLS exist.
- **Two model calls per turn:** Ollama can't combine tool calls and forced-JSON output in one request.

Then the owner added: *"Make a note in the plans somewhere to not leave a single god damn comment in my code, code speaks for itself."* Claude removed all 91 comments from the plan's code and made it the first global constraint.

### 20. Stopping, one more feature, and the cliffhanger

Offered a hands-off build, the owner chose to stop. Asked for "any other cool features," they picked **Curbie keeping an eye on itself**: a Health dashboard plus a health skill, alerting on status changes only, confirming outages across several probes, queuing email until the internet returns, and never running `ping`.

The last exchange was "What will the UI look like?" Claude showed the planned structure and admitted the visual design didn't exist yet. The owner: *"Can I give you some colors to use? I think we should have this designed before we implement."* Then the session was lost.

### Produced
- `docs/design.md`: the full design document.
- `docs/superpowers/plans/2026-10-01-curbie-phase-1-walking-skeleton.md`: the Phase 1 build plan.
- Two Claude memory notes: TDD and subagents for this project; no code comments.

### Takeaways for the blog
- **Pushback went both ways and improved the design each time.** The owner's pushback produced the web consent gate, NestJS serving the UI, and dropping the allowlist. Claude's produced core-vs-model layering and memory out of git. On the scheduler, the owner's concern led to the real issue (in-memory state).
- **The guiding principles came out of conversation, not a template.** "Factual over agreeable" started as a one-line objection to "no web access."
- **"Enforced in code, not prompts" became the reusable answer** for the web gate, the answer contract, @mentions, the watcher builder, and command execution.
- **The owner's real-life use cases drove the hardest features:** the microwave manual, the manila folder of recipes, the Texas sheet cake on a phone in the kitchen.
- **Design first, then the plan, then code.** No code was written in session 1.

---

## Session 2 — 2026-10-02: Recovering context, visual design, installation plan

**Goal:** pick up the UI design discussion after the previous session was lost.

### How it unfolded

1. **Recovering from a lost session.** Context was rebuilt from the design doc, the plan, Claude's memory notes, and the previous session's transcript. Lesson: decisions that live only in chat are fragile. Everything important needs to be written to files.
2. **Bringing in a personal aesthetic.** The colors came from an earlier project of the owner's, the **Floaterball** browser game: neon cyan, magenta, and yellow on deep black, with a faint cyan grid. A screenshot of the game set the target feel.
3. **Contrast check.** Cyan, yellow, and magenta all pass contrast on black. Two gaps were found: there was no error color, and the palette couldn't support a light mode.
4. **Decisions:**
   - **Neon red** for errors, borrowed from the game's red "danger" square with its pulsing glow.
   - **Dark mode only.** No light theme.
   - **Courier New** everywhere.
   - **Buttons copied exactly** from Floaterball's `.playButton`, after reading the game's CSS from its GitHub repo. They're adapted as real `<button>`s with a keyboard focus style.
5. **Visual mockup.** A static HTML mockup with every reply type (Sourced, Don't know, Generated, conversational, Error) was opened in the browser to review.
6. **Iterating on the mockup:**
   - The grid moved from inside the chat window to the page background *outside* it, and stays still with no scrolling animation. The inside of the chat window is solid black.
   - The status text changed from "Curbie is thinking…" to "Curbie is processing…".
7. **A comparison with claude.ai.** Same basic model: a scrolling column with the input pinned at the bottom, Enter to send, Shift+Enter for a new line. Curbie differs in boxing every reply as a card with a type badge and citations, and in what it leaves for later (streaming display, a sidebar, retry and copy buttons).
8. **Docs updated, build postponed.** The visual design went into `design.md` §4.1.0, and the plan's chat page markup and stylesheet were replaced to match the mockup. The owner chose not to start implementation yet.
9. **Project `CLAUDE.md`.** Added so every future session starts with the project rules (no comments, TDD and subagents, never commit, ports and adapters, no command execution) instead of reconstructing them.
10. **Installation plan.** A list of everything the M1, the dev machine, and the clients need: Xcode CLT, Node 24, Ollama and the models, mkcert later, the USB data drive, config variables, and accounts.
11. **Choosing offline knowledge.** Browsed the Kiwix library together, checking live file listings for real names and sizes:
    - `mini` Wikipedia was rejected because it holds only article intros, which undermines grounded answers.
    - Full Gutenberg turned out to be **206 GB**, not the "tens of GB" first estimated. It's split by Library of Congress subject class instead.
    - **Chosen:** `wikipedia_en_all_nopic` (49 GB), plus Gutenberg PR (English literature), PS (American literature), and T (Technology), about 91 GB total. Other classes get added as needed.
    - No Kiwix software is needed. Curbie reads the `.zim` files directly.
12. **Keeping docs in sync.** The design doc's §6 and open questions were updated to match the installation plan.
13. **This log** was started so the whole process can become a blog post. Session 1's entry was then rebuilt in detail from the old transcript, covering both sides of each exchange.
14. **How Curbie saves chats.** A question about how conversations persist got answered first about Claude Code (a misread), then about Curbie: every turn goes to SQLite, each page load starts a new conversation, the model sees the last 10 messages, transcripts expire after 30 days, and memory facts are saved only on request.
15. **A gap surfaced: no way back to an old conversation.** The owner asked for a page of previous conversations that could be re-sent to the model to pick up where they left off. The key realization: resuming needs no special mechanism, because every turn already reloads history from SQLite by conversation ID. Reopening just means reusing the ID. Two details were settled: seeing only the last 10 messages is acceptable, and **citations should be stored** so a reopened conversation shows its sources. Citation storage went into Phase 1 to avoid a later migration.
16. **The rest of the UI, mocked up page by page.** The owner noticed Settings and Health had no links, which led to designing the full app in the neon style, one approval at a time:
    - **Nav bar:** CHAT · HISTORY · MANAGE · HEALTH · INBOX, styled like Floaterball's pause bar, with a glowing yellow unread count instead of a bell emoji.
    - **History:** conversation cards grouped by day, with `+ NEW CHAT`.
    - **Manage:** a tile per area with counts and "needs attention" flags, and a **Settings** form with household and personal groups.
    - **Health:** a summary banner, a tile per check, and an incident log. **Neon green** was added to the palette for OK, borrowed from the game's green square.
    - **Inbox:** alert cards with a delivery tag per channel (sent, skipped, held, failed), making the design's "never silently dropped" rule visible.
17. **Everything written down.** The mockups were copied into `docs/mockups/` as the visual source of truth. The design doc gained the nav, a page table, and §4.1.2 (conversation history and resume). The Phase 1 plan now stores citations with every message, across Tasks 2, 8, and 10. Its phase map assigns each page to a phase: nav, Manage, and Settings in 2; Inbox in 4; History and resume in 5; Health in 9. One new open question was recorded: whether 30-day retention counts from a conversation's start or its last message.

18. **A design review.** Asked whether this is a good V1 design, Claude said yes to the design but questioned the V1 scope. Its main concerns: model reliability against the strict answer contract is the untested core bet, retrieval (the most valuable feature) comes late, and many features are designed before any real use. The owner countered on speed: larger models run acceptably on the M1 in LM Studio. Claude agreed speed is low risk, and noted the real unknown is reliability, which LM Studio chats don't test.
19. **The subset "shim."** The owner suggested testing Wikipedia retrieval against a subset rather than all 49 GB. Claude clarified that the model never searches the whole collection (only the top passages reach it), and that a subset helps by making rebuilds fast and allowing retrieval tests with an answer key. These risks went into the design doc as §7.1, the Phase 1 live check became an explicit go/no-go gate with measurements, and Phase 10 became subset-first.
20. **An install script.** `scripts/install.sh` checks the Mac for everything in the installation plan and offers to install each missing piece, asking first. The owner asked for a test mode. `--check` (report only) already existed, so the owner chose a true **dry run** instead: `--dry-run` asks every question but prints the exact command each "yes" would run. It was verified by answering yes and confirming nothing was installed or created.
21. **Revisiting the 2013 Mac Pro, and choosing 4B.** The owner asked again about running Qwen on the Mac Pro (32 GB, dual FirePro D500). Claude explained that generation speed depends on memory bandwidth and prompt reading on raw compute, that the Ivy Bridge CPU lacks AVX2, and that the GPU model decides everything: an 8B model (~5 GB) doesn't fit comfortably on two 3 GB D500s. The owner then asked why 8B at all. The answer: it was Claude's default from session 1 ("7B–8B reliable, 1.5B–3B slip"), never tested. The owner chose **`qwen3:4b`**, which fits the D500s. The plan became: develop and run Curbie on the M1, and try the Mac Pro as a remote model host. Claude flagged two catches: GPU use depends on Vulkan (Ollama's support is newer, and llama.cpp would need a second adapter), and Ollama on the LAN has no login, so the Mac Pro's firewall must allow only the M1. The docs now default to 4B. The Phase 1 live check compares 4B on the M1, 4B on the Mac Pro, and 8B on the M1 as a baseline, and the installation doc has Mac Pro setup steps.

### Produced
- `docs/design.md` §4.1.0, Visual design. §6 rewritten for the chosen knowledge sources.
- The Phase 1 plan's Task 12, updated with the neon chat page.
- `CLAUDE.md`, the project rules for every session.
- `docs/installation.md`, the installation plan.
- `docs/dev-log.md`, this file.
- `docs/mockups/`: approved mockups of every page plus the shared `curbie.css`.
- `scripts/install.sh`: the setup script, with `--check` and `--dry-run`.
- `docs/design.md` §4.1.0 pages and nav, §4.1.2 conversation history and resume, and §7.1 known risks to test early.
- The Phase 1 plan: citation storage, plus UI pages mapped to phases.

### Takeaways for the blog
- Reusing your own past work (a game's stylesheet) is a fast way to give a project a distinct identity.
- A throwaway HTML mockup made the design concrete in minutes, and it caught a layout preference (where the grid goes) that text descriptions hadn't.
- Verifying with live data (actual Kiwix listings) corrected a confident but wrong size estimate.
- Clickable mockups beat descriptions: seeing the chat page prompted "where are Settings and Health?", which led to designing the whole app before any code existed.
- A feature request ("re-send the old conversation to the model") turned out to already be supported by the architecture. Understanding *why* (history is reloaded from the database every turn) kept the feature small.

---

## Session 3 — 2026-10-06: Dropping the Mac Pro

**Goal:** settle whether the 2013 Mac Pro has a role.

### How it unfolded

1. **A second opinion.** The owner had asked Gemini, which said the Mac Pro's GPUs can't be used, and suggested relying on the CPU and the 32 GB of RAM for Qwen 4B instead.
2. **Why RAM size doesn't help.** Claude agreed it would work, but slowly. The 4B model needs only about 3 GB, so the extra RAM sits idle. CPU speed depends on memory bandwidth (generation) and compute (prompt reading), and the Ivy Bridge CPU lacks AVX2/FMA. The M1 runs the same 4B model with GPU acceleration, likely several times faster, and has plenty of room for it. Offloading to the Mac Pro would make things slower, not faster.
3. **Decision: the Mac Pro is out.** Curbie and the model both run on the M1. The design marks the Mac Pro "not used" with the reason. The installation doc's Mac Pro setup section, the LAN exception for Ollama, and the Mac Pro run in the Phase 1 live check were removed. The live check now compares `qwen3:4b` with the `qwen3:8b` baseline, both on the M1.

### Takeaways for the blog
- Asking a second AI was a useful cross-check. It agreed on the GPU question, and the follow-up ("but 32 GB of RAM?") showed why memory *size* isn't the bottleneck for local inference.
- Dropping a component is a decision worth writing down too: the design now records *why* the Mac Pro isn't used, so the idea doesn't get re-litigated later.

---

## Session 4 — 2026-10-08 to 2026-10-09: Building the walking skeleton

**Goal:** build Phase 1 on the dev machine (an M2 with no Ollama), without downloading the models or the Wikipedia and Gutenberg files. Those get installed on the M1 later.

### How it unfolded

1. **Recovering context first.** The session opened with Claude reading the memory notes, the design doc, the dev log, and the Phase 1 plan before touching anything. The notes did their job: nothing from sessions 1–3 had to be re-asked.
2. **Pace: one task at a time.** The project rules allow an unattended, subagent-driven run, but the owner chose to go task by task, saying "proceed" after each checkpoint. Claude built every task itself, test first, and reported after each one.
3. **Two shell surprises.** The npm install looked hung for over seven minutes. It had finished long before; the command's final `ls` was aliased to `eza --icons`, which hung without a terminal. Later, `cd` turned out to be aliased to zoxide, which broke a file-writing command. The fixes were `/bin/ls`, `builtin cd`, and absolute paths.
4. **Tasks 1–6 as planned.** Scaffold and config parsing, core contracts and test doubles, the architecture tests, the tool registry, skill documents with the first real skill (`skills/calculator.md`), and the hardened calculator. For the architecture test, Claude added temporary violations to prove the rules catch them. For the calculator, a temporary probe confirmed each dangerous expression (`import`, `zeros(100000, 100000)`, …) was refused as "disabled" within 2 ms, not by some unrelated error.
5. **Pushback #1 (owner): interfaces get their own files.** The owner noticed interfaces declared next to the code that used them and asked for an `interfaces/` folder in each module. All 16 were split out, one per file.
6. **Pushback #2 (owner, over Claude's objection): one constants file.** The owner asked for every constant in a single `src/constants.ts`. Claude pushed back once: a file outside `core/` breaks the core-purity rule, and it would sit adapter details next to domain values. Claude suggested per-module constants files instead. The owner kept the single file. To make it safe, the architecture rule was relaxed for exactly that one file, and a new test requires `constants.ts` to import nothing. That new test immediately caught a bug in the import scanner: it read the quoted `'import',` in the calculator's list of disabled functions as a real import statement.
7. **A comment sweep that found nothing.** Asked to remove every Claude-written comment, Claude scanned the whole repo and found none. The no-comments rule had held from the start.
8. **Tasks 7–10.** The answer contract, SQLite persistence (data-folder guard, migrator, transcript repository), the Ollama adapter, and the conversation orchestrator. With these, all five "Review Focus" risks in the plan are pinned by tests.
9. **Pushback #3 (owner): a real project as the reference.** The owner pointed Claude at one of their work repos (gift-card-api, a NestJS service) as the model for splitting responsibilities. It uses NestJS's `<name>.<role>.ts` naming. Decisions:
   - Type aliases and error classes also get their own files, like interfaces.
   - They're called **types**, not "attributes". In gift-card-api, "Attributes" is part of a name (the Sequelize convention for a record's fields), not a category of file.
   - Files carry a role suffix: `clock.interface.ts`, `chat-message.type.ts`, `model-unavailable.error.ts`.
   - Asked whether the suffix made the folders redundant, the owner kept both the role folders and the suffixes.
   A script moved 21 declarations and rebuilt every import from a symbol map, and the tests passed unchanged.
10. **Tasks 11–12.** The NestJS composition root, the WebSocket gateway, an end-to-end integration test, the neon chat page, and the server bootstrap. A smoke test of the real server on the dev machine:
    - The page rendered with a fresh conversation ID.
    - A real WebSocket message came back as "The model isn't responding: … fetch failed", which is correct with no Ollama installed.
    - Pointing the data folder at a missing drive printed "Is the USB drive mounted?" and exited with code 1.
11. **"Stop asking me to commit."** Claude's global instructions say to ask about committing when a task is done. The owner asked it to stop, and that's now a project memory.
12. **Finishing up.** The owner opened the chat mockup and approved it, then ran the real server and confirmed the built page matches it, including the red Error reply that appears with no model installed. Two loose ends were settled:
    - Every remaining source file also gets a role suffix, for example `ollama-model.adapter.ts`, `tool.registry.ts`, `conversation.orchestrator.ts`, `schema.migrator.ts`.
    - The compiled answer validator may stay at module level, as the one approved exception to the single-constants rule.

13. **Testing the UI without a model.** Curbie talks to Ollama through one HTTP call, so Claude wrote a throwaway fake Ollama (kept outside the repo) that picks scripted replies from keywords. With Curbie pointed at it, the owner clicked through every reply type in the real browser: Sourced with the real calculator, Don't know, Generated, conversational, invented citations and malformed JSON falling back to "don't know", the tool-round limit, and a simulated model outage. Literal `<b>` and `<script>` tags rendered as plain text. This covered the UI half of the live check; only the model's own reliability is left for the M1.
14. **"Are we done?" Not quite: there are 11 phases.** The owner had read "Phase 1 is built" as "Curbie is built". Claude should have been clear that the walking skeleton is the first of eleven phases.
15. **Pushback #4 (Claude, overruled): no authentication, ever.** Starting Phase 2 planning, Claude proposed per-person usernames and passwords. The owner wanted no auth at all. Claude pushed back once on the later consequences: anyone on the network could read conversations and memory facts and trigger reminders and emails, and per-person settings would collapse into one. Claude offered a middle path (open now, revisit auth before personal data arrives in Phase 4 or 5). The owner chose no auth, permanently. The design now records the decision and the accepted risk; records keep the existing `owner` column so nothing needs migrating if it's ever revisited, and the safety guardrails still apply because none of them depend on identity.
16. **Paused for the M1.** The next Phase 2 decision, HTTPS via mkcert or plain HTTP on the LAN, waits until the owner is on the M1.

### Produced
- `server/`: the Phase 1 walking skeleton. All 12 tasks are built. There are 152 tests in 20 suites, and the typecheck and production build are clean.
- `skills/calculator.md`: the first skill document.
- Layout conventions: role folders (`interfaces/`, `types/`, `errors/`), role suffixes on every file, and one `src/constants.ts`.
- Claude memory notes: role folders and suffixes, the single constants file, and no commit prompts.

### Still open
- **The live go/no-go check on the M1** (Task 12, Step 7). It compares `qwen3:4b` with `qwen3:8b` on the six checks, recording contract reliability and reply time. This is the real test of the project's core bet.
- Reviewing the `npm audit` warnings.
- Phase 2 planning: the HTTPS decision, then the remaining questions, then the plan itself.

### Takeaways for the blog
- **Plan code is a starting point, not scripture.** The Phase 1 plan had full code for every task, yet the owner's layout preferences changed nearly every file's location and name. Having tests in place first made each restructure a mechanical, verifiable change.
- **Push back once, then build what the owner chose, safely.** Claude objected to the single constants file on architectural grounds and was overruled. The answer wasn't to drop the guardrail but to narrow it: one allowed file, plus a test that keeps that file harmless. That test found a real bug within minutes.
- **Point at your own code.** "Look at how we did it in this other repo" settled several naming questions faster than discussing them in the abstract.
- **Prove that tests can fail.** Temporary violations and a probe showed the architecture rules and the calculator lockdown catch what they claim to, instead of passing for the wrong reason.
- **A fake dependency is a cheap stand-in for expensive hardware.** One small script replaced a GPU-backed model for every UI and pipeline check, and left only the question it can't answer (does the model behave?) for the real machine.
- **Say what "done" means.** "Phase 1 is built" was true, but read as "the project is done." Naming the phase count up front avoids that.
- **Your shell is part of the environment.** Two aliases (`ls` → eza, `cd` → zoxide) caused the session's only confusing moments.

---

## Session 5 — 2026-11-15: The live check on the M1

**Goal:** get the M1 to a working baseline, install Ollama and the models, and run the Phase 1 go/no-go check (Task 12 Step 7): can a small local Qwen keep the answer contract at a usable speed?

### How it unfolded

1. **Resuming from a written plan.** A 2026-11-13 repo analysis had left `docs/next-session.md`, a step-by-step resume plan recording the M1's state: no Ollama, an incomplete copied `node_modules`, and 27 `npm audit` findings. The session started by reading it back, and nothing had to be rediscovered.
2. **Models on the USB drive.** The owner asked whether the models could live on the project's external drive (`CURBIE_BRAIN`, a 500 GB APFS SSD). Ollama reads `OLLAMA_MODELS`, but how the variable is set depends on how Ollama runs: `launchctl setenv` doesn't survive a reboot, and `brew services` ignores it and can be overwritten by upgrades. The answer was Curbie's own LaunchAgent running `ollama serve`, with `KeepAlive` → `PathState` so Ollama only runs while the drive's models folder exists. The models went to `ollama-models/` *beside* the data dir, not inside it, so they stay out of its backups.
3. **A paste that never ended.** Pasting the heredoc that wrote the plist left the terminal stuck at `heredoc>`. The copied lines had picked up leading spaces, so the closing `EOF` was never recognized. Claude wrote the file directly instead and validated it with `plutil -lint`.
4. **A disk-space detour.** The owner had deleted "gigs worth of data" and the free space didn't move. The cause was Time Machine local snapshots: both backup drives had been unplugged since about August 1, so a three-month-old snapshot was still holding every deleted file. Snapshots are copy-on-write and are not real backups.
5. **The baseline.** `npm ci` replaced the broken `node_modules`, and the full suite passed on the M1 exactly as on the M2: 152 tests in 20 suites.
6. **The first live question took over two minutes.** It came back correct (**Sourced**, 51), but slowly, for two separate reasons:
   - **The drive.** The model loaded at about 2 MB/s. The drive's NVMe-to-USB bridge was linked at USB 2 speed (480 Mb/s) behind a hub, on a Mac whose own ports do 40 Gb/s. Loading only happens once, because Curbie pins the model in memory.
   - **The model.** Even with the model loaded, a calculator answer took about 38 s over three model calls. The Ollama adapter never turned off Qwen3's thinking mode, so every call wrote a long reasoning pass first.
7. **The second question failed in a way that mattered.** "Convert 3/8 inch to mm" ended in "The model isn't responding." Ollama's log told the real story: the finalize call generated more than 3,500 tokens without stopping, overflowed Ollama's default 4,096-token context window, and Ollama **silently discarded the oldest half of the conversation, including the system prompt that holds the answer contract**. The 180 s timeout finally ended it. Nothing in the request capped the output or set the context size.
8. **Pause and diagnose (Claude's recommendation; the owner's direction to focus on speed).** Claude recommended stopping the check, since it was measuring configuration gaps, not the model. The owner agreed, and asked to work out the performance first so the results would mean something. Claude wrote a throwaway diagnostic that runs the real orchestrator and Ollama adapter with a logging fetch, recording every call's tokens, timing, and thinking output. Three settings on `qwen3:4b`:
   - Default and thinking explicitly on behaved the same: 800–2,200 characters of hidden reasoning per call, 27–66 s per reply.
   - **"Thinking off" didn't turn thinking off.** The reasoning moved into the visible reply text ("Okay, let's see…") and was fed back into the next call, making prompts longer. Ollama serves this model through a generic `chatml` template, so the switch never reached the model.
   - The contract held, 9 of 9 across the three settings, though one accepted answer was garbled ("0.15 * 3: 51"). The model could keep the contract; it just couldn't do it quickly.
9. **A non-thinking model.** Qwen3-4B-Instruct-2507 (`qwen3:4b-instruct`) answers without a reasoning pass. Three repetitions of the three contract checks: **9 of 9, at 3.6–9.4 s per reply**, with quotes matching the calculator output exactly. Each call now produces 14–91 tokens instead of hundreds. There is no non-thinking 8B, and the thinking 8B would be about twice as slow as the thinking 4B, so the 8B dropped out of the comparison. The owner kept it installed: the drive exists for this project.
10. **The contract caught a hallucination.** In one run, the model's tool-phase text claimed *"The 1987 World Series was won by the Philadelphia Phillies"*. It was the Minnesota Twins. The finalize step still answered "don't know," because there was no source to cite, and the tool-phase text is never shown. This is the design working: the model made something up, and the code stopped it from reaching the user.
11. **The fix, test first.**
    - The default model is now `qwen3:4b-instruct`.
    - Every request sets `num_ctx: 8192` and `num_predict: 512`.
    - A finalize answer cut off at the limit is invalid JSON, so it takes the existing re-prompt and "don't know" path. No new code path was needed.
12. **The live check, take two: all six pass.** Timed from Ollama's log:

    | Check | Result | Time |
    |---|---|---|
    | 15% of 340 | Sourced, "15% of 340 is 51." | ~12 s |
    | 3/8 in → mm | Sourced, "3/8 inch is 9.525 mm." | ~11 s |
    | 1987 World Series | Don't know | ~4 s |
    | `<b>bold</b>` | Literal text, Generated | ~3.5 s |
    | Hi Curbie | Conversational, no badge | ~3.4 s |
    | Ollama stopped | Error, immediately; recovered when Ollama returned | instant |

    Finalize took about 8 s in the browser against about 5 s in the scripted runs. Conversation history makes the prompt longer, a preview of what retrieval will cost.
13. **"Make me a script so I don't forget."** The owner asked for the `launchctl` command in a script. `scripts/ollama-service.sh` handles `start`, `stop` (before ejecting the drive), `restart`, and `status`. It refuses to start without the drive and copes with being run twice. The installer gained a model-storage check, and it now offers this service instead of `brew services`, which would have quietly put models on the internal disk.

14. **Audit triage.** The owner chose to finish the `npm audit` work before stopping, and to leave Phase 2 for the next session.
    - Every critical and high finding was fixable within the pinned major versions:
      - handlebars, via `hbs` 4.3.1 → 4.4.0;
      - multer, via NestJS 11.2.7 → 11.2.10 (all six `@nestjs/*` packages kept in step);
      - body-parser, qs, and fast-uri, via in-range lockfile updates.
    - The result: 27 findings → 21, with none critical or high, and only one left in production code.
    - That one is `hbs`, which has an unpatched 2021 advisory and is flagged in every version. Claude read the advisory before accepting it: the issue needs request data to reach `render()`'s locals, and Curbie's only render passes a server-generated conversation ID. The design now records the rule that keeps it safe.
    - The other 20 are the Jest toolchain, which is dev-only. The audit's "fix" for them is a downgrade to Jest 25.
    - Verified with the full test suite, the typecheck and build, and a fresh server on a spare port serving the chat page and its static files.

### Decided
- **Default model: `qwen3:4b-instruct`** (design §4.5). Thinking models kept the contract but were too slow; the non-thinking 4B kept it at a usable speed.
- **Bounded context and output on every call:** 8,192 and 512 tokens (design §4.5). Without them, a runaway generation silently cut the contract out of the prompt.
- **The go/no-go gate is passed.** Phase 1 is done.
- **Audit:** NestJS 11.2.10 and `hbs` 4.4.0. The `hbs` advisory is accepted under a rule: render locals come only from server-side values. The Jest-chain findings are accepted as dev-only (design §5.7).
- **Models live on the project drive, beside the data dir,** under Curbie's own LaunchAgent (design §6b, `installation.md` §1.3a).

### Produced
- `server/`: the new default model and the `num_ctx`/`num_predict` options, with their specs updated first. 152 tests in 20 suites.
- `server/package.json` and the lockfile: NestJS 11.2.10, `hbs` 4.4.0, and patched transitive dependencies.
- `scripts/ollama-service.sh`, plus a model-storage check in `scripts/install.sh`.
- `diagnostics/model-contract.diagnostic.js`: the diagnostic from this session, kept as the seed of Phase 8's eval harness. It runs the real orchestrator and Ollama adapter and logs every call's timing, tokens, and thinking output.
- `~/Library/LaunchAgents/com.curbie.ollama.plist` on the M1 (outside the repo; documented in `installation.md` §1.3a).
- Docs: design §4.5, §6b, §7.1, §8; `installation.md`; `README.md`; the Phase 1 plan's Step 7 marked done.

### Still open
- Phase 2 decisions: HTTPS or plain HTTP, IP address or `curbie.local`, which settings to build now.
- Move the drive to a direct USB-C port with a 10 Gb/s cable.
- The config parser keeps its defaults inline, against the single-constants-file rule.

### Takeaways for the blog
- **Read the server log, not the error message.** "The model isn't responding" was true but useless. Ollama's log showed a 3,500-token runaway, a context overflow, and a silently discarded system prompt.
- **Defaults are decisions you didn't make.** Ollama's default context size and unlimited output, and Qwen3's default thinking mode, shaped every result until they were set on purpose.
- **"Off" isn't always off.** The thinking switch was accepted without complaint and quietly did nothing useful. Measure what a setting actually does.
- **Keeping the contract and being usable are separate tests.** Every model kept the contract; only one did it fast enough to use.
- **The harness earned its keep on day one.** A real hallucination (the Phillies) was produced and then blocked by code, not by the prompt.
- **Pick the model for the job, not the size.** The planned 4B-vs-8B question turned into thinking vs. non-thinking, and that difference was worth a 5–7× speedup.
- **Hardware fails quietly too.** A cable or hub can turn a fast SSD into a USB 2 device, and nothing reports it until a 2.5 GB file takes 1.5 minutes to read.
- **Read the advisory before accepting the risk.** "Critical, no fix available" sounded alarming. Reading the advisory turned it into a precise condition (request data reaching `render()`) and a one-line rule that keeps Curbie clear of it.

## Session 6 — 2026-11-15: Phase 2, from decisions to a built branch

**Goal:** settle the open Phase 2 decisions, write the plan, and build it: reach Curbie from other devices, add the shared page frame, and give it a Settings page.

### How it unfolded

1. **Two decisions in one line.** The owner settled both open questions at once: plain HTTP, reached by IP address. HTTPS only matters for browser features that need a secure context (microphone, notifications, Wake Lock), and voice comes much later. "We have a lot of refining to do with the chat first."
2. **Which settings to build.** Claude laid out three options: model only, model plus time zone and units, or the whole mockup. The owner picked the middle one, where every setting does something on day one.
3. **No sign-in still needs a guard.** Recon turned up a risk that "no auth" doesn't cover. A hostile website visited by anyone in the house could open a WebSocket to Curbie, or post its Settings form, through that person's browser. DNS rebinding was a second route. The fix doesn't touch the no-auth decision: refuse any `Host` that isn't an IP or `localhost`, and any `Origin` that doesn't match the `Host`.
4. **The date belongs to a tool, not the prompt.** Putting today's date in the system prompt would have been the easy path, but the honesty rules say facts come only from tool results. So the date became a `clock` skill: a cited source, like the calculator.
5. **The model moved onto the request.** Choosing a model on a web page meant the model name could no longer be fixed when the adapter is built. It now travels on every model request, read from one settings snapshot per turn. That's also the hook Phase 11's coding-model routing needs.
6. **Built in one pass.** The owner chose inline execution: "just power through all tasks and we'll check in at the end." Eight tasks, test first, on a branch, uncommitted. Small rulings along the way are listed under Decided.
7. **The review found a lockout.** A fresh reviewer read the whole branch and found that a bad stored setting (or a host time zone the runtime doesn't list) broke the Settings page, which was the only screen that could fix it. Chat still fails loudly, but the Settings page now shows the bad field and lets it be saved over, and bad defaults stop startup. Thirteen smaller notes were deferred for the owner.

### Decided
- **Plain HTTP by IP; TLS deferred** until a feature needs a secure context (design §5.3).
- **LAN binding is opt-in:** `CURBIE_HTTP_HOST=0.0.0.0`. The default stays loopback.
- **Host/Origin guard** on every HTTP request and WebSocket upgrade (design §5.3).
- **Settings now: model, time zone, units** (design §4.17). `CURBIE_MODEL` becomes only the default. A model must be installed to be chosen, and saving an unchanged model never calls Ollama.
- **`clock` skill** for the date and time (design §4.13).
- **Field errors never echo input,** which keeps the `hbs` render-locals rule (design §5.7).
- **Rulings while building:**
  - No `@types/express` or `@types/hbs` (no new dependencies), so the middleware uses Node's `http` types, and the nav is inlined in the layout instead of registered as a partial.
  - The catalog adapter has its own GET-shaped fetch type.

### Produced
- `server/`: config (LAN host, defaults moved to `constants.ts`), `request-origin.policy.ts`, the settings core (`core/settings/`) with SQLite and in-memory repositories under one contract test, migration 2, the Ollama model catalog adapter, the orchestrator reading settings per turn, the `clock` adapter, `views/layout.hbs`, the Manage and Settings pages, and `public/curbie.css` (replacing `chat.css`). 229 tests in 29 suites.
- `skills/clock.md`.
- `diagnostics/model-contract.diagnostic.js`: updated for the per-request model, plus a date question.
- Docs: design §4.1.0, §4.5, §4.13, §4.17, §5.3, §8; `installation.md` §1.4 and the new §1.5a; README; the Phase 1 plan's phase map.

### Still open
- The owner's review and live check, including from a phone (the plan's Task 8, Step 3).
- Phase 3 planning (documents and recipes).
- Carried over: drive speed, model memory when idle, Time Machine.

### Takeaways for the blog
- **"No auth" isn't "no security."** Deciding against sign-in still left a browser-shaped hole. The guard is a few lines, and it's about where requests come *from*, not *who* sends them.
- **Keep facts in tools, even the boring ones.** Today's date is the most trivial fact there is, and it still went through a cited tool, because the rule only works if it has no exceptions.
- **A settings page changes the shape of the code.** Making one value user-editable moved the model name from wiring onto every request, and that turned out to be the right shape anyway.

## Session 7 — 2026-11-23: Phase 2's live check, and the follow-ups it shaped

**Goal:** run Phase 2's manual check against the real data dir, then fix the deferred review notes before Phase 3.

### How it unfolded

1. **The state didn't match the notes.** The resume file said Phase 2 was uncommitted on its branch, but the owner had already committed it to `main`. The real data dir still had no `settings` table, so Phase 2 had never actually run. Before the first start applied migration 2 (forward only), Claude copied the data dir to a dated backup.
2. **Checked from the Mac only.** The owner skipped the phone step. The model list, the switch, the date answer (Sourced, citing Clock), the "Couldn't reach Ollama" hint, saving while Ollama was down, and the layout against the mockups all passed.
3. **The 8B timed out, and the log showed why.** Switching to `qwen3:8b` and asking a question hit the 180 s timeout. That looked like a thinking model being slow. Ollama's log told a different story: the request started at 09:20:16 and the model finished loading at 09:23:08. About 170 s of the budget went to reading 5.7 GB off the drive, roughly 35 MB/s, which is USB 2 speed. The model got 8 seconds to think. The cancel did reach Ollama, so nothing kept running on the GPU after Curbie gave up.
4. **That turned a deferred idea into a fix.** Claude laid out three options: warm the model when Settings saves it (only helps that one path), load it as its own step before every call (covers every cold start), or both. The owner took both, plus every remaining review note: the models-list timeout, Origin hardening, and the polish batch.
5. **The `hbs` rule shaped the failed-save fix.** A failed save reset every field, because echoing request data into a template is exactly what the `hbs` advisory forbids. The fix keeps the rule: each valid field is shown as the server-side value it matched (the installed-model entry, the supported zone, the `UNITS` member), never the submitted text. The design now says that matching against a server list counts as server-side.
6. **Built test first, in one pass.** Writing the tests turned up an edge case the plan had missed. If the stored time zone is invalid and a failed save fixes it, the page still showed the stored-value error, so that page now uses only the save's own errors. TypeScript's header types showed that Node already joins repeated headers into one string, so the planned array handling was dropped as dead code.

### Decided
- **Loading is a separate step** (design §4.5). A `ModelLoadingDecorator` (Decorator pattern) wraps the model port. Before each call, the `OllamaModelLoader` checks `/api/ps` (3 s timeout) and, if needed, loads with an empty `/api/generate` (10-minute timeout, same `num_ctx` as chat, so Ollama doesn't load it twice). Concurrent loads share one request. A failed load is retried next time.
- **Saving a model starts loading it in the background.** A failure is only logged, because the next chat reports it loudly.
- **The installed-models check gets 3 s, not 180 s.**
- **Origin guard** (design §5.3): canonical URL comparison, `http:` only. An unsafe method with no `Origin` is refused unless `Sec-Fetch-Site` is absent, `same-origin`, or `none`. `same-site` is refused, since on an IP host it means another port.
- **Skills get the turn's settings** through a `ToolExecutionContext`. The clock adapter now depends only on `Clock`.
- **Failed saves keep valid fields as server-matched values** (design §4.17, §5.7).

### Produced
- `server/`: `core/model/model-loading.decorator.ts`, `ModelLoaderPort`, `adapters/model/ollama-model.loader.ts`, `RecordingModelLoader`; `origin-check-input.reader.ts` shared by the middleware and the WebSocket guard; `http-url.formatter.ts`; `ToolExecutionContext`; `ModelCheck`; `InvalidSettingsError.acceptedValues`. 270 tests in 33 suites.
- `diagnostics/model-contract.diagnostic.js`: wraps the adapter with the loader so load time is no longer counted as reply time.
- Docs: design §4.5, §4.13, §4.17, §5.3, §5.7; `next-session.md`; `CLAUDE.md` Status.

### Still open
- The owner's review and commit of `phase-2-followups`.
- The drive link (now urgent), then a retry of the 8B.
- Phase 3 planning. Carried over: DHCP reservation, the phone check, model memory when idle, Time Machine.

### Takeaways for the blog
- **A timeout measures everything inside it.** "The 8B is too slow" was the obvious reading. The log showed the model had 8 seconds to think, because loading had used up the rest.
- **Split the phases you want to measure separately.** Once loading had its own step and timeout, a slow drive and a slow model became two different problems with two different fixes.
- **A security rule can shape a feature without blocking it.** "Never echo request data into a template" sounded like it ruled out keeping form input. Matching input against server-side lists kept both the rule and the usability.
- **Back up before a one-way door.** A forward-only migration on the only copy of the data takes one `cp -R` to make safe.
