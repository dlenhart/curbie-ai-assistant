# Curbie Phase 2: LAN Access, Settings, Page Frame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curbie is reachable from any device on the home network at `http://<Mac's IP>:3000`. Every page shares a frame with a nav bar, and a Settings page (under a new Manage hub) edits three household settings stored in SQLite: the model, the home time zone, and units. Each one takes effect on the next chat turn.

**Architecture:** Settings get a core service (`HouseholdSettingsService`) over a key-value repository port, with SQLite and in-memory adapters sharing a contract test, the same pattern as transcripts. The orchestrator reads one settings snapshot per turn: the model name goes into each `ModelRequest`, and the units preference goes into the system prompt. The date and time reach the model through a new `clock` skill, a cited tool result like the calculator, so the answer contract stays intact. One web-layer policy checks the `Host` and `Origin` headers on every HTTP request and WebSocket upgrade. Pages render through one Handlebars layout, and every render local is built on the server.

**Tech Stack:** NestJS 11.2.10 (Express and the `ws` platform), `hbs` 4.4.0 layouts and partials, better-sqlite3 12.11.1, Jest 30 with ts-jest, and supertest. No new dependencies.

**Spec:** `docs/design.md` §4.1.0 (visual design, nav bar, page table), §4.7 (no users), §4.13 (time and locale), §4.17 (settings), §5.3 (no auth; HTTPS deferred), and §5.7 (the `hbs` render-locals rule). Phase map row 2 is in `docs/superpowers/plans/2026-10-01-curbie-phase-1-walking-skeleton.md`. Mockups: `docs/mockups/manage.html`, `docs/mockups/settings.html`, `docs/mockups/curbie.css`.

## Decisions Made in This Plan

These were decided with the owner on 2026-11-15 or are settled here. Task 8 writes them into the design.

- **Plain HTTP, reached by IP address.** No TLS and no `.local` name for now. The features that need a secure context (the microphone, notifications, Wake Lock) are deferred, not dropped (§5.3).
- **LAN binding is opt-in.** `CURBIE_HTTP_HOST` defaults to `127.0.0.1`. The owner sets `CURBIE_HTTP_HOST=0.0.0.0` to serve the LAN. The parser now accepts any IP literal or `localhost`, and rejects hostnames.
- **Host and Origin guard.** With no sign-in, the threats are a hostile website that a household member visits, driving Curbie from the browser (cross-site WebSocket hijacking and cross-site form posts), and DNS rebinding. Rules:
  - The `Host` header must be present, and its hostname must be an IP literal or `localhost`. This alone defeats DNS rebinding.
  - When an `Origin` header is present, its `host` must equal the `Host` header.
  - When `Origin` is absent, the request is allowed. Browsers always send it on WebSocket upgrades and cross-origin POSTs. A non-browser client on the LAN can do everything anyway, because there's no auth.
  - These rules apply to every HTTP request (Express middleware, `403`) and every WebSocket upgrade (`verifyClient`, `403`).
  - A future `.local` name would need an allowlist. Not now.
- **Settings built now:** `modelName`, `timeZone`, `units`. Nothing else from the mockup is built.
- **Defaults when nothing is stored:**
  - `modelName`: `config.modelName` (`CURBIE_MODEL`, else `qwen3:4b-instruct`). The environment variable becomes the default for the stored setting.
  - `timeZone`: the host's zone, `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `units`: `imperial`.
- **The model must be installed to be chosen.** Saving a *changed* model checks Ollama's `/api/tags`. Saving an unchanged model never calls Ollama, so the time zone and units can be saved while Ollama is down.
- **Stored settings are trusted but checked.** Only validated writes reach the table. A stored value that fails validation on read throws `InvalidSettingsError`, so it fails loudly rather than silently falling back.
- **Date and time come from a `clock` skill**, not from the system prompt. HONESTY_RULES say facts come only from tool results this turn, and a cited `Clock` source keeps "what's today's date?" inside the contract. Units are a preference, not a fact, so they go in the system prompt.
- **One settings snapshot per turn.** The orchestrator calls `settings.current()` once at the start of each turn and uses that snapshot for every model call in the turn.
- **Render locals are server-built only** (design §5.7, the `hbs` advisory). Field errors are fixed strings, never echoes of submitted values. A failed save re-renders from the *stored* settings plus those messages. Submitted keys never reach `render()`.
- **The Settings page has one group, HOUSEHOLD** (§4.17 merges the mockup's two groups). It submits as a plain form POST, then redirects to `/manage/settings?saved=1` (post-redirect-get). No client JS.
- **The nav shows only built pages:** CHAT and MANAGE. The other links stay hidden until their phases land.
- **The stylesheet becomes `public/curbie.css`:** a copy of `docs/mockups/curbie.css`, plus the chat page's two `:disabled` button rules. It replaces `public/chat.css`.
- **The config parser's inline defaults move to `constants.ts`.** This is the cleanup listed in `next-session.md`, done here because Task 1 rewrites the parser anyway.

## Global Constraints

- **No comments in code. Not one.** This covers source, tests, client JS, CSS, Handlebars, and config.
- **TDD:** every task writes the failing test first.
- **Never run `git commit` or `git push`.** Each task ends with a checkpoint: `cd server && npm test`, all green.
- **Core stays pure.** `server/src/core/**` imports only core-relative modules, `constants.ts`, `ajv`, and `gray-matter`. Intl and other JS built-ins are fine. This is enforced by `architecture.spec.ts`.
- **Every constant lives in `server/src/constants.ts`.** That file imports nothing.
- **One declaration per file, in a role folder, with a role suffix:**
  - Interfaces go in `interfaces/x.interface.ts`, type aliases in `types/x.type.ts`, and errors in `errors/x.error.ts`.
  - Everything else is `<name>.<role>.ts`, with specs mirroring the name.
- **No `child_process`, no `eval`, no `new Function`.**
- **Model output is rendered with `textContent` only.**
- **Render locals come only from server-side values, never from request data** (design §5.7).
- **Exact dependency pins. No new dependencies.**
- **Naming:**
  - Booleans start with `is`, `has`, `should`, `can`, or `was`.
  - No abbreviations beyond `id` and `url`.
  - Classes are nouns; methods are verbs.

## Review Focus

These are the inputs most likely to bite a real user that the spec doesn't spell out. Each one is pinned by a test in the task named.

1. **Ollama is down when someone opens or saves Settings.** The page still renders, showing the current model and a "couldn't reach Ollama" hint. Saving with the model unchanged succeeds. Tests: Task 3 (`update` skips the catalog when the model is unchanged) and Task 7 (GET with a failing catalog).
2. **The current model isn't in Ollama's list** (it was uninstalled, or the env default was never pulled). The select still shows it, selected, so a save doesn't silently switch models. Test: Task 7 (`buildSettingsPageModel`).
3. **Host headers in unusual forms:** bracketed IPv6 (`[::1]:3000`), no port (`192.168.1.20`), and `localhost:3000` are allowed. A hostname (`curbie.example`) or a missing Host is refused. Test: Task 2.
4. **A cross-site POST to `/manage/settings` from a hostile page** gets `403`, and nothing is saved. Test: Task 7 integration.
5. **A form post carrying extra keys** such as `layout`, `settings`, or `__proto__` never reaches `render()`: the save succeeds, and a failed save renders normally. Test: Task 7 integration.

---

### Task 1: LAN host binding and config defaults in constants

**Files:**
- Modify: `server/src/constants.ts`. Remove `LOOPBACK_HOSTS`. Add `DEFAULT_HTTP_HOST = '127.0.0.1'`, `DEFAULT_HTTP_PORT = 3000`, `DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434'`, `DEFAULT_MODEL_NAME = 'qwen3:4b-instruct'`, `DEFAULT_HISTORY_MESSAGE_LIMIT = 10`, `MAX_HISTORY_MESSAGE_LIMIT = 100`, `DEFAULT_MAX_TOOL_ROUNDS = 4`, `MAX_TOOL_ROUNDS_LIMIT = 10`, `WILDCARD_HTTP_HOSTS: ReadonlySet<string> = new Set(['0.0.0.0', '::'])`.
- Modify: `server/src/infrastructure/config/curbie-config.parser.ts`
- Modify: `server/src/infrastructure/config/curbie-config.parser.spec.ts`
- Create: `server/src/adapters/system/lan-address.finder.ts`
- Modify: `server/src/main.ts`

**Interfaces:**
- Produces: `parseConfig` (signature unchanged) now accepts any IP literal (`isIP` from `node:net`) or `localhost`. `listLanAddresses(): string[]` lists the non-internal IPv4 addresses from `os.networkInterfaces()`.

- [ ] **Step 1: Write the failing tests** in `curbie-config.parser.spec.ts`. Replace the loopback-rejection test with these:

```ts
it.each(['0.0.0.0', '192.168.1.20', '::', '::1', 'localhost', '127.0.0.1'])('accepts %s as the HTTP host', (host) => {
  expect(parseConfig({ CURBIE_DATA_DIR: '/data', CURBIE_HTTP_HOST: host }, defaults).httpHost).toBe(host);
});

it.each(['curbie.local', 'example.com', '192.168.1', 'http://0.0.0.0'])('rejects %s as the HTTP host', (host) => {
  expect(() => parseConfig({ CURBIE_DATA_DIR: '/data', CURBIE_HTTP_HOST: host }, defaults)).toThrow(
    /CURBIE_HTTP_HOST must be an IP address \(such as 0\.0\.0\.0 for the home network\) or localhost/,
  );
});

it('still defaults to loopback so LAN access is opt-in', () => {
  expect(parseConfig({ CURBIE_DATA_DIR: '/data' }, defaults).httpHost).toBe('127.0.0.1');
});
```

Keep every existing default-value test. They must still pass after the defaults move to `constants.ts`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd server && npx jest src/infrastructure/config`
Expected: FAIL. `0.0.0.0` is rejected with the old "not a loopback address" message.

- [ ] **Step 3: Implement.**
  - In `parseConfig`, replace the loopback check with the IP-literal-or-`localhost` check. The error message is: `` `CURBIE_HTTP_HOST must be an IP address (such as 0.0.0.0 for the home network) or localhost; got "${httpHost}".` ``
  - Every inline default and bound now reads from the new constants.
  - Write `listLanAddresses()`.
  - In `main.ts`, keep the existing log line. When `WILDCARD_HTTP_HOSTS.has(config.httpHost)`, also log one line per LAN address: `` `On your home network: http://${address}:${config.httpPort}` ``.
  - The model in the log line becomes the *effective* model. Task 4 changes this; until then leave `config.modelName`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd server && npx jest src/infrastructure/config && npm run typecheck`
Expected: PASS, and the typecheck is clean (no remaining `LOOPBACK_HOSTS` imports).

- [ ] **Step 5: Checkpoint.** `cd server && npm test`: all green.

---

### Task 2: Host and Origin guard for HTTP and WebSocket

**Files:**
- Create: `server/src/adapters/web/request-origin.policy.ts`
- Create: `server/src/adapters/web/request-origin.policy.spec.ts`
- Create: `server/src/adapters/web/types/origin-verdict.type.ts`
- Create: `server/src/adapters/web/interfaces/origin-check-input.interface.ts`
- Modify: `server/src/adapters/web/app.configurator.ts`
- Modify: `server/src/adapters/web/chat.gateway.ts`
- Modify: `server/src/app.integration.spec.ts`

**Interfaces:**
- Produces:
  - `evaluateRequestOrigin(input: OriginCheckInput): OriginVerdict`, where `OriginCheckInput = { readonly host: string | undefined; readonly origin: string | undefined }` and `OriginVerdict = { readonly isAllowed: true } | { readonly isAllowed: false; readonly reason: string }`.
  - `configureApp` installs an Express middleware that calls it for every request and answers `403` with `reason` as plain text.
  - `ChatGateway`'s `@WebSocketGateway` options gain `verifyClient: (info: { origin: string; req: IncomingMessage }) => boolean`, built from the same policy (the Nest `ws` adapter passes `verifyClient` through to `ws`). A refused upgrade gets `403`.

- [ ] **Step 1: Write the failing unit tests** in `request-origin.policy.spec.ts`:

```ts
it.each([
  ['127.0.0.1:3000', undefined],
  ['192.168.1.20:3000', 'http://192.168.1.20:3000'],
  ['192.168.1.20', 'http://192.168.1.20'],
  ['localhost:3000', 'http://localhost:3000'],
  ['[::1]:3000', 'http://[::1]:3000'],
])('allows host %s with origin %s', (host, origin) => {
  expect(evaluateRequestOrigin({ host, origin })).toEqual({ isAllowed: true });
});

it.each([
  [undefined, undefined, 'missing Host header'],
  ['curbie.example:3000', undefined, 'Host must be an IP address or localhost'],
  ['192.168.1.20:3000', 'http://evil.example', 'Origin does not match Host'],
  ['192.168.1.20:3000', 'http://192.168.1.20:4000', 'Origin does not match Host'],
  ['192.168.1.20:3000', 'null', 'Origin does not match Host'],
])('refuses host %s with origin %s', (host, origin, reasonFragment) => {
  const verdict = evaluateRequestOrigin({ host, origin });
  expect(verdict.isAllowed).toBe(false);
  expect(verdict.isAllowed === false && verdict.reason).toContain(reasonFragment);
});
```

- [ ] **Step 2: Write the failing integration tests** in `app.integration.spec.ts`:
  - `refuses an HTTP request whose Host is a hostname`: `request(server).get('/').set('Host', 'curbie.example')` returns status `403`.
  - `refuses a WebSocket upgrade from another origin`: `new WebSocket(url, { headers: { Origin: 'http://evil.example' } })` emits `unexpected-response`, with `response.statusCode === 403`.
  - `accepts a WebSocket upgrade from its own origin`: Origin is `http://${serverAddress}`, and the existing calculator round trip still answers.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd server && npx jest src/adapters/web/request-origin src/app.integration`
Expected: FAIL. The module is missing, and the hostile requests get 200 or 101.

- [ ] **Step 4: Implement.**
  - Parse with `new URL('http://' + host)`. Compare `hostname` (with the IPv6 brackets stripped for `isIP`) and `host`.
  - An `Origin` that doesn't parse, including `null`, counts as a mismatch.
  - Register the middleware in `configureApp` before the static assets.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `cd server && npx jest src/adapters/web src/app.integration`
Expected: PASS.

- [ ] **Step 6: Checkpoint.** `cd server && npm test`: all green.

---

### Task 3: Household settings: storage and service

**Files:**
- Modify: `server/src/constants.ts`:
  - Append migration 2, `settings`:

    ```sql
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    ```

  - Add `UNITS = ['imperial', 'metric'] as const` and `DEFAULT_UNITS = 'imperial'`.
  - Add the field error copy, `SETTINGS_FIELD_ERRORS`:
    - `modelRequired`: `'Choose a model.'`
    - `modelNotInstalled`: `"That model isn't installed in Ollama."`
    - `modelCatalogUnavailable`: `"Couldn't reach Ollama to check which models are installed, so the model wasn't changed."`
    - `timeZoneInvalid`: `'Choose a time zone from the list.'`
    - `unitsInvalid`: `'Choose imperial or metric.'`
  - Add the tokens `SETTINGS_REPOSITORY`, `SETTINGS`, `MODEL_CATALOG`, `SUPPORTED_TIME_ZONES`.
- Create in `server/src/core/settings/`:
  - `types/units.type.ts`: `Units = (typeof UNITS)[number]`
  - `interfaces/household-settings.interface.ts`: `{ readonly modelName: string; readonly timeZone: string; readonly units: Units }`
  - `interfaces/household-settings-reader.interface.ts`: `{ current(): HouseholdSettings }`
  - `interfaces/settings-repository.interface.ts`: `{ loadAll(): Readonly<Record<string, string>>; saveAll(values: Readonly<Record<string, string>>, updatedAt: string): void }`
  - `interfaces/household-settings-service-dependencies.interface.ts`: `{ repository; modelCatalog: ModelCatalogPort; clock: Clock; defaults: HouseholdSettings; supportedTimeZones: ReadonlySet<string> }`
  - `types/settings-field-errors.type.ts`: `Readonly<Partial<Record<keyof HouseholdSettings, string>>>`
  - `errors/invalid-settings.error.ts`: `InvalidSettingsError`, which takes `fieldErrors: SettingsFieldErrors`. Its message lists the field names.
  - `household-settings.service.ts` and `household-settings.service.spec.ts`
- Create: `server/src/core/model/interfaces/model-catalog-port.interface.ts`: `{ listInstalledModelNames(): Promise<readonly string[]> }`. It throws `ModelUnavailableError` when Ollama can't be reached.
- Create in `server/src/core/testing/`:
  - `in-memory-settings.repository.ts`
  - `settings-repository.contract.ts` (`describeSettingsRepositoryContract`)
  - `in-memory-settings.repository.spec.ts`
  - `fake-model.catalog.ts` (`FakeModelCatalog`, constructed with `readonly string[] | Error`; it counts calls in `callCount`)
  - `fixed-settings.reader.ts` (`FixedSettingsReader`, constructed with a `HouseholdSettings`, with a `replace(next)` method for tests)
- Create: `server/src/adapters/persistence/sqlite-settings.repository.ts` and its spec. The spec runs the contract against a migrated `:memory:` database.
- Create: `server/src/adapters/model/ollama-model-catalog.adapter.ts` and its spec. Options: `{ baseUrl: string; fetchFunction: FetchFunction; timeoutMilliseconds?: number }`.
- Modify: `server/src/adapters/persistence/schema.migrator.spec.ts`, if it asserts the applied versions.

**Interfaces:**
- Produces:
  - `HouseholdSettingsService implements HouseholdSettingsReader`, constructed with `HouseholdSettingsServiceDependencies`, with:
    - `current(): HouseholdSettings`
    - `update(submission: Readonly<Record<string, unknown>>): Promise<HouseholdSettings>`
    - `supportedTimeZones(): readonly string[]` (sorted)
  - `OllamaModelCatalogAdapter implements ModelCatalogPort`

- [ ] **Step 1: Write the repository contract** (`settings-repository.contract.ts`):
  - It returns `{}` when nothing is saved.
  - It returns the saved values.
  - A second `saveAll` overwrites only the keys it names, and keeps the others.

  Wire it into the in-memory and SQLite specs.

- [ ] **Step 2: Write the service tests** in `household-settings.service.spec.ts`. Setup: defaults `{ modelName: 'qwen3:4b-instruct', timeZone: 'America/New_York', units: 'imperial' }`, zones `America/New_York`, `America/Chicago`, `UTC`, and catalog `['qwen3:4b-instruct', 'qwen3:8b']`.
  - `current() returns the defaults when nothing is stored`
  - `current() overlays stored values on the defaults`
  - `current() throws InvalidSettingsError when a stored time zone is not supported`
  - `update() saves all three fields with the clock's timestamp and returns the new settings`: expect `repository.loadAll()` to equal `{ modelName: 'qwen3:8b', timeZone: 'America/Chicago', units: 'metric' }`.
  - `update() checks the catalog only when the model changes`: an unchanged model with `new FakeModelCatalog(new ModelUnavailableError('down'))` succeeds, and `callCount === 0`.
  - `update() rejects a model that is not installed`: `fieldErrors.modelName === SETTINGS_FIELD_ERRORS.modelNotInstalled`, and nothing is saved.
  - `update() reports an unreachable catalog when the model changes`: `fieldErrors.modelName === SETTINGS_FIELD_ERRORS.modelCatalogUnavailable`.
  - `update() collects every field error at once`: a bad zone plus `units: 'kelvin'` plus `modelName: ''` gives three keys in `fieldErrors`.
  - `update() rejects non-string values` (`units: ['metric']` gives `unitsInvalid`).
  - `update() ignores unknown keys`: a submission of `{ ...validFields, ...JSON.parse('{"layout":"x","__proto__":{"polluted":true}}') }` saves only the three fields, and `({} as Record<string, unknown>).polluted` stays `undefined`.
  - `supportedTimeZones() returns the zones sorted`

- [ ] **Step 3: Write the catalog adapter tests.**
  - The adapter GETs `${baseUrl}/api/tags` and returns `models[].name` (example body: `{"models":[{"name":"qwen3:4b-instruct"},{"name":"qwen3:8b"}]}`).
  - A fetch rejection becomes `ModelUnavailableError`, and so does a non-OK status.
  - A body without `models` becomes `ModelUnavailableError('Ollama returned an unexpected model list.')`.

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `cd server && npx jest src/core/settings src/core/testing src/adapters/persistence src/adapters/model/ollama-model-catalog`
Expected: FAIL, because the modules are missing.

- [ ] **Step 5: Implement everything listed above.**
  - Stored keys are the property names (`modelName`, `timeZone`, `units`).
  - `saveAll` upserts in a single transaction (`INSERT ... ON CONFLICT(key) DO UPDATE`).

- [ ] **Step 6: Run the tests and confirm they pass**, using the same command as Step 4. Expected: PASS.

- [ ] **Step 7: Checkpoint.** `cd server && npm test`: all green. The migrator tests and the integration test pick up migration 2 cleanly.

---

### Task 4: The orchestrator follows the settings (model per request, units in the prompt)

**Files:**
- Modify: `server/src/core/model/interfaces/model-request.interface.ts`: add `readonly modelName: string`.
- Modify: `server/src/adapters/model/ollama-model.adapter.ts` and its spec. Remove `modelName` from `OllamaModelAdapterOptions`; the body's `model` becomes `request.modelName`.
- Modify: `server/src/core/conversation/interfaces/conversation-orchestrator-dependencies.interface.ts`: add `readonly settings: HouseholdSettingsReader`.
- Modify: `server/src/core/conversation/conversation.orchestrator.ts` and its spec.
- Modify: `server/src/core/conversation/system-prompt.builder.ts` and its spec. Add `buildHouseholdPreferences(settings: HouseholdSettings): string`.
- Modify: `server/src/constants.ts`. Add `UNIT_DESCRIPTIONS: Readonly<Record<Units-literal, string>>`:
  - `imperial`: `'imperial (°F, miles, pounds, inches, cups)'`
  - `metric`: `'metric (°C, kilometres, kilograms, centimetres, millilitres)'`

  Keys are typed as `'imperial' | 'metric'`, because `constants.ts` can't import the type.
- Modify: `server/src/app.module.ts`:
  - Add providers: `SETTINGS_REPOSITORY` (SQLite), `MODEL_CATALOG` (`OllamaModelCatalogAdapter`), `SUPPORTED_TIME_ZONES` (`new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])`), and `SETTINGS` (`HouseholdSettingsService` with defaults `{ modelName: config.modelName, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, units: DEFAULT_UNITS }`).
  - Inject `SETTINGS` into the orchestrator.
- Modify: `server/src/main.ts`. Log the effective model (`app.get<HouseholdSettingsService>(SETTINGS).current().modelName`).
- Modify: `server/src/app.integration.spec.ts`. Override `MODEL_CATALOG` with `new FakeModelCatalog(['qwen3:4b-instruct', 'qwen3:8b'])`.
- Modify: `diagnostics/model-contract.diagnostic.js`.
  - Pass a fixed settings reader, `{ current: () => ({ modelName, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, units: 'imperial' }) }`.
  - Drop `modelName` from the adapter options.
  - `createSkillAdapters` changes in Task 5, so this file is touched again there.

**Interfaces:**
- Consumes: `HouseholdSettingsReader`, `HouseholdSettings`, `FixedSettingsReader` (Task 3).
- Produces:
  - `ModelRequest.modelName`.
  - `buildHouseholdPreferences(settings)`, which returns exactly:

    ```
    Household preferences:
    - Units: <UNIT_DESCRIPTIONS[units]>. Use these when the user doesn't name a unit.
    ```

  - Each turn, the first system message is `` `${systemPrompt}\n\n${buildHouseholdPreferences(snapshot)}` ``.

- [ ] **Step 1: Write the failing tests.**
  - **Orchestrator spec:**
    - `sends the settings' model name on every model call in the turn`: tools call plus finalize; every `receivedRequests[i].modelName === 'qwen3:8b'`.
    - `puts the units preference in the system message`: `receivedRequests[0].messages[0].content` ends with `buildHouseholdPreferences(settings)`.
    - `reads the settings once per turn`: a reader that counts `current()` calls sees exactly 1 across a 3-call turn.
    - `uses new settings on the next turn`: `FixedSettingsReader.replace(...)` between turns changes `modelName` on the second turn's requests.
  - **Prompt builder spec:** the exact metric and imperial strings.
  - **Adapter spec:** the body's `model` comes from `request.modelName`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd server && npx jest src/core/conversation src/adapters/model`
Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Update every `ModelRequest` construction.
  - In `app.module.ts`, the `MODEL` factory no longer passes `modelName`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd server && npx jest && npm run typecheck`
Expected: PASS, and the typecheck is clean.

- [ ] **Step 5: Checkpoint.** `cd server && npm test`: all green. Then `npm run build && node ../diagnostics/model-contract.diagnostic.js --help` prints the usage. A live diagnostic run is optional; it needs Ollama.

---

### Task 5: The clock skill

**Files:**
- Create: `skills/clock.md`
- Create: `server/src/adapters/skills/clock.adapter.ts` and its spec
- Create: `server/src/adapters/skills/errors/clock.error.ts`
- Create: `server/src/adapters/skills/interfaces/skill-adapter-dependencies.interface.ts`: `{ readonly clock: Clock; readonly settings: HouseholdSettingsReader }`
- Modify: `server/src/adapters/skills/skill-adapters.factory.ts`. The signature becomes `createSkillAdapters(dependencies: SkillAdapterDependencies): SkillAdapter[]`, returning `[new CalculatorAdapter(), new ClockAdapter(dependencies)]`.
- Modify: `server/src/app.module.ts`. `TOOL_REGISTRY` injects `CLOCK` and `SETTINGS`.
- Modify: `server/src/app.integration.spec.ts`
- Modify: `diagnostics/model-contract.diagnostic.js`. Pass `{ clock: { now: () => new Date() }, settings: <its fixed reader> }`. Add `"What's today's date?"` to `QUESTIONS`.

**Interfaces:**
- Produces: `ClockAdapter implements SkillAdapter`, with name `clock` and a single tool `current_date_time` that takes no arguments. It returns:

  ```ts
  { title: 'Clock', content: `${formatted} (${timeZone})`, requiresQuote: false }
  ```

  `formatted` comes from `new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' })`, with every ` ` replaced by a plain space.

`skills/clock.md` frontmatter:

```yaml
name: clock
description: Today's date, the day of the week, and the current time in the household's time zone.
kind: lookup
adapter: clock
tools:
  - name: current_date_time
    description: Get the current date and time in the household's time zone.
    parameters:
      type: object
      properties: {}
      additionalProperties: false
```

The body follows `calculator.md`'s sections:

- **When to use:** any question about today's date, the day of the week, or the current time.
- **How to answer:** always call `current_date_time`, never guess the date, report it as returned, and cite the clock source.

- [ ] **Step 1: Write the failing tests.**
  - **Adapter spec**, with a `FixedClock` at `2026-11-15T19:05:00.000Z`:
    - With `America/New_York`, `content === 'Sunday, November 15, 2026 at 2:05 PM (America/New_York)'`.
    - With `Asia/Tokyo`, `content === 'Monday, November 16, 2026 at 4:05 AM (Asia/Tokyo)'`.
    - An unknown tool name throws `ClockError`.
    - Each call reads the settings: after `FixedSettingsReader.replace` with a new zone, the next call uses that zone.
  - **Integration:** `answers a date question from the clock skill with a citation`, scripted as `toolCallResponse('current_date_time', {})`, then `textResponse('')`, then a cited answer on `src_1`. The reply's citations equal `[{ sourceId: 'src_1', title: 'Clock', skillName: 'clock' }]`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd server && npx jest src/adapters/skills src/app.integration`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the tests and confirm they pass**, using the same command as Step 2. Expected: PASS. `skill-directory.loader.spec.ts` must still pass with two skill documents in `skills/`. If it asserts a count, update it.

- [ ] **Step 5: Checkpoint.** `cd server && npm test`: all green.

---

### Task 6: The shared page frame, nav bar, and Manage hub

**Files:**
- Create: `server/public/curbie.css`: an exact copy of `docs/mockups/curbie.css`, with the `.neon-button` hover and focus selectors changed to `:hover:not(:disabled)` and `:focus-visible:not(:disabled)`, plus the `.neon-button:disabled { opacity: 0.5; cursor: not-allowed; }` rule from `public/chat.css`.
- Delete: `server/public/chat.css`
- Create: `server/views/layout.hbs`. It holds the doctype, the head (`<title>{{pageTitle}}</title>` and `/static/curbie.css`), and `<main class="chat">`. Inside the main: the `CURBIE` header, `{{> nav}}`, and `{{{body}}}`. A `{{#if scriptPath}}<script src="{{scriptPath}}"></script>{{/if}}` comes after the main.
- Create: `server/views/partials/nav.hbs`. It renders `<nav class="nav" aria-label="Main">` from `navigation`. Each link is `<a class="nav__link{{#if isActive}} nav__link--active{{/if}}" href="{{href}}"{{#if isActive}} aria-current="page"{{/if}}>{{label}}</a>`.
- Modify: `server/views/chat.hbs`. Body only. `data-conversation-id` moves onto `<ol class="chat__log" id="chat-log" ...>`.
- Modify: `server/public/chat.js`. Read the conversation ID from `log.dataset.conversationId`.
- Create: `server/views/manage.hbs`. It holds the `chat__window`, a `panel`, `<h2 class="panel__heading">MANAGE</h2>`, and a `tile-grid` with one tile linking to `/manage/settings`: title `SETTINGS`, count `⚙`, detail `Model, time zone, and units`.
- Modify: `server/src/adapters/web/app.configurator.ts`. Register `views/partials` with `hbs.registerPartials` (import `hbs`).
- Create: `server/src/adapters/web/navigation.builder.ts` and its spec
- Create: `server/src/adapters/web/types/page-name.type.ts`: `'chat' | 'manage'`
- Create: `server/src/adapters/web/interfaces/navigation-link.interface.ts`: `{ readonly label: string; readonly href: string; readonly isActive: boolean }`
- Modify: `server/src/constants.ts`. Add `NAVIGATION_PAGES = [{ page: 'chat', label: 'CHAT', href: '/' }, { page: 'manage', label: 'MANAGE', href: '/manage' }] as const`.
- Modify: `server/src/adapters/web/chat-page.controller.ts`. It returns `{ pageTitle: 'Curbie', navigation: buildNavigation('chat'), scriptPath: '/static/chat.js', conversationId }`.
- Create: `server/src/adapters/web/manage-page.controller.ts`. `GET /manage` renders `manage` with `{ pageTitle: 'Curbie · Manage', navigation: buildNavigation('manage') }`.
- Modify: `server/src/app.module.ts`. Register `ManagePageController`.
- Modify: `server/src/app.integration.spec.ts`

**Interfaces:**
- Produces: `buildNavigation(activePage: PageName): readonly NavigationLink[]`. The layout's locals contract is `{ pageTitle: string; navigation: readonly NavigationLink[]; scriptPath?: string }`.

- [ ] **Step 1: Write the failing tests.**
  - **Navigation spec:** `buildNavigation('manage')` equals `[{ label: 'CHAT', href: '/', isActive: false }, { label: 'MANAGE', href: '/manage', isActive: true }]`.
  - **Integration:**
    - `serves the chat page inside the shared frame`: the response contains `class="nav"`, `aria-current="page"` on CHAT, `data-conversation-id="conv_1"`, and `/static/curbie.css`.
    - `serves the Manage hub with a Settings tile`: `GET /manage` returns 200, contains `href="/manage/settings"`, and has `aria-current="page"` on MANAGE.
    - `serves the stylesheet`: `GET /static/curbie.css` returns 200.

  Update the existing chat-page test's expectation to match the new attribute location.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd server && npx jest src/adapters/web src/app.integration`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the tests and confirm they pass**, using the same command as Step 2. Expected: PASS.

- [ ] **Step 5: Checkpoint.** `cd server && npm test`: all green.

---

### Task 7: The Settings page

**Files:**
- Create: `server/views/settings.hbs`, matching `docs/mockups/settings.html` with one HOUSEHOLD group.
  - The whole body is a `<form method="post" action="/manage/settings">` that wraps the `chat__window` and the footer `form-actions` with `<button type="submit" class="neon-button">SAVE</button>`.
  - Inside the panel: a `◂ MANAGE` back link to `/manage`, then `<h2 class="panel__heading">HOUSEHOLD</h2>`, then three `form-row`s:
    - **Model:** `<select name="modelName" class="neon-input neon-input--short">`. Hint: `Changes apply to the next message.` When `isModelListUnavailable`, a second hint: `Couldn't reach Ollama, so only the current model is listed.`
    - **Home time zone:** `<select name="timeZone">`.
    - **Units:** radios `name="units"` with the values `imperial` and `metric`, labeled `Imperial (°F, mi)` and `Metric (°C, km)`.
  - Each field's error renders as `<span class="form-row__hint form-row__error">{{...}}</span>` under its field.
  - When `isSaved`, a `<p class="chat__status" role="status">Settings saved.</p>` appears in the footer.
- Modify: `server/public/curbie.css`. Add `.form-row__error { color: var(--neon-red); }`.
- Create: `server/src/adapters/web/settings-page-model.builder.ts` and its spec
- Create: `server/src/adapters/web/interfaces/settings-page-model.interface.ts`, `interfaces/select-option.interface.ts` (`{ value; label; isSelected }`), and `interfaces/settings-page-input.interface.ts`
- Create: `server/src/adapters/web/settings-page.controller.ts`
- Modify: `server/src/app.module.ts`. Register `SettingsPageController`.
- Modify: `server/src/app.integration.spec.ts`

**Interfaces:**
- Consumes: `HouseholdSettingsService` (`SETTINGS`), `ModelCatalogPort` (`MODEL_CATALOG`), `InvalidSettingsError.fieldErrors`, `buildNavigation` (Task 6), and the layout locals contract.
- Produces: `buildSettingsPageModel(input: SettingsPageInput): SettingsPageModel`.
  - The input is `{ settings: HouseholdSettings; installedModelNames: readonly string[] | null; timeZones: readonly string[]; fieldErrors: SettingsFieldErrors; isSaved: boolean }`.
  - The output is `{ pageTitle: 'Curbie · Settings'; navigation: buildNavigation('manage'); modelOptions; isModelListUnavailable; timeZoneOptions; unitOptions; fieldErrors; isSaved }`.
  - `modelOptions` is the installed names plus the current model if it's missing, de-duplicated and sorted, with the current one selected.
- Routes:
  - `GET /manage/settings` renders it. A catalog `ModelUnavailableError` gives `installedModelNames: null`. `isSaved` is `query.saved === '1'`.
  - `POST /manage/settings` calls `settings.update(body)`. On success it answers `303` with `Location: /manage/settings?saved=1`. On `InvalidSettingsError` it answers `400` with `response.status(400).render('settings', buildSettingsPageModel({ settings: settings.current(), ..., fieldErrors: error.fieldErrors, isSaved: false }))`. Any other error propagates.

- [ ] **Step 1: Write the failing builder tests.**
  - `lists installed models sorted with the current one selected`
  - `keeps the current model in the list when Ollama doesn't report it` (Review Focus 2)
  - `lists only the current model and flags the list as unavailable when installedModelNames is null` (Review Focus 1)
  - `selects the current time zone and units`
  - `passes field errors and the saved flag through`

- [ ] **Step 2: Write the failing integration tests.**
  - `GET /manage/settings shows the current settings`: the defaults are selected, and the response contains `qwen3:8b` from the fake catalog.
  - `GET /manage/settings still renders when Ollama is down`: the catalog is constructed with an error; expect 200 and `Couldn't reach Ollama`.
  - `POST saves and redirects, and the next chat turn uses the new model`:
    - `.type('form').send({ modelName: 'qwen3:8b', timeZone: 'America/Chicago', units: 'metric' })` returns 303 to `/manage/settings?saved=1`.
    - A following `GET /manage/settings?saved=1` contains `Settings saved.`.
    - Then a WebSocket chat turn's `model.receivedRequests[0].modelName === 'qwen3:8b'`, and its system message contains `metric (`.
  - `POST with an invalid time zone answers 400 with the field error and saves nothing`: the body contains `Choose a time zone from the list.` and does not contain the submitted value `Mars/Olympus`.
  - `POST from another origin is refused`: `.set('Origin', 'http://evil.example')` returns 403, and the settings are unchanged (Review Focus 4).
  - `POST with extra keys saves normally`: `{ modelName, timeZone, units, layout: 'chat', settings: 'x' }` returns 303. An invalid post with `layout: '../../package.json'` returns 400 and renders the settings page (Review Focus 5).

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd server && npx jest src/adapters/web src/app.integration`
Expected: FAIL.

- [ ] **Step 4: Implement.** Use `@Res()` on the POST handler only. The GET handler can use `@Render('settings')`.

- [ ] **Step 5: Run the tests and confirm they pass**, using the same command as Step 3. Expected: PASS.

- [ ] **Step 6: Checkpoint.** `cd server && npm test && npm run typecheck && npm run build`: all green and clean.

---

### Task 8: Docs and the live LAN check

**Files:**
- Modify: `docs/design.md`:
  - §5.3: HTTPS is deferred (decided 2026-11-15). Plain HTTP by IP; the secure-context features wait. Add the Host and Origin guard and its rules.
  - §4.17: the Phase 2 settings (model, time zone, units), their defaults, the stored-value check, and that the env var `CURBIE_MODEL` is now only the default.
  - §4.13: the clock skill.
  - §4.5: the model is switchable from Settings, limited to installed models.
  - §4.1.0: the nav shows built pages only (CHAT, MANAGE).
  - §8: remove the resolved questions.
- Modify: `docs/installation.md`:
  - The configuration table: `CURBIE_HTTP_HOST=0.0.0.0` for the LAN.
  - A new "Reaching Curbie from other devices" subsection:
    - Find the IP: System Settings → Wi-Fi → Details, or `ipconfig getifaddr en0`.
    - Reserve it in the router's DHCP settings.
    - Allow `node` when the macOS firewall asks.
    - Open `http://<ip>:3000` on the phone.
  - Note that `CURBIE_MODEL` is now the default, and the Settings page overrides it.
- Modify: the Phase 1 plan's phase map, row 2: TLS was decided as not now. Link this plan.
- Modify: `README.md` Status, `CLAUDE.md` Status and Layout (the `views/layout.hbs` and partials), and `docs/next-session.md` (rewrite). Append the Session 6 entry to `docs/dev-log.md`.

- [ ] **Step 1: Update the docs above.**

- [ ] **Step 2: Final verification.** `cd server && npm test && npm run typecheck && npm run build`: all green.

- [ ] **Step 3: Hand the owner the manual check** (no browser testing on our side):
  1. `scripts/ollama-service.sh start`, then `CURBIE_HTTP_HOST=0.0.0.0 CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`. The log prints a "On your home network" URL.
  2. On the Mac, open `http://127.0.0.1:3000`. The nav shows CHAT and MANAGE, and chat works as before.
  3. On the phone (same Wi-Fi), open the LAN URL. Chat works there too.
  4. MANAGE → SETTINGS. The model list shows the three installed models. Change units to metric and save; "Settings saved." appears.
  5. Ask "Convert 5 miles". It answers in km without being asked.
  6. Ask "What's today's date?". The answer is Sourced and cites Clock, in the chosen time zone.
  7. Switch the model to `qwen3:4b`, save, and ask "Hi". The first reply is slow while the model loads, which confirms the switch. Switch back.
  8. Run `scripts/ollama-service.sh stop`, then open Settings. The page loads with the "Couldn't reach Ollama" hint, and saving the time zone still works.
