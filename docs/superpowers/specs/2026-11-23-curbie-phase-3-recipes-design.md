# Curbie Phase 3: Recipes — Design

Date: 2026-11-23. Status: draft for owner review. Covers the recipes half of Phase 3 (design §4.3.1a). Manuals and the device catalog (§4.3.1) are deferred to a later round.

## 1. Intent

The owner has a physical folder of family recipes, printed and handwritten, and wants to ask Curbie "What's the recipe for our Texas sheet cake?" from a phone in the kitchen and get the right recipe with the original card one tap away. Recipes are the primary use case for Phase 3, and getting them *right* matters more than breadth: a handwritten "1 tbsp" read as "1 tsp" is a silent, plausible error that ruins a dish.

## 2. Goals, non-goals, anti-goals

**Goals**
- Get phone photos of recipe cards into Curbie by dropping files on the `CURBIE_BRAIN` drive.
- Read them with Apple Vision OCR and turn them into a recipe written in a fixed Markdown shape: title, servings, ingredients, steps, notes, with optional sections ("Cake", "Frosting").
- Let the owner review each recipe against its photo, correct the Markdown, and approve it before Curbie answers from it.
- Answer recipe questions in chat with the reviewed recipe itself shown under the answer, and a link that opens the original card.
- Scale recipes ("double it", "for 6 servings") with deterministic arithmetic.
- Edit an approved recipe later; the correction is what gets indexed ("correct once, stays fixed").

**Non-goals (this round)**
- Manuals, PDFs, page citations, the device catalog (§4.3.1).
- A phone upload page, a scanner workflow, or watching the folder in the background.
- The Phase 4 notification system (Inbox page, alerts, unread count). A simple chat-page notice stands in for it.
- Unit conversion of recipes (imperial ↔ metric). Scaled quantities keep the card's own units.
- Exporting recipes as `.md` files. The owner wants it, later (§7).
- Two recipes on one card. The owner photographs each separately (crop), or discards and redoes it.
- Nutrition, tags, categories, meal planning.

**Anti-goals (failure even if it "works")**
- The model rewriting recipe text. No model output may become an ingredient, quantity, or step; the model only classifies OCR lines.
- The model retyping quantities that the owner then trusts. Recipe content shown in chat always comes from the reviewed recipe (§5.7).
- An unreviewed recipe answering questions.
- A photo silently skipped, or a recipe silently missing lines.
- The model doing scaling arithmetic.
- Curbie deleting the owner's photos.

## 3. Constraints (from the existing design and code)

- Ports and adapters; `server/src/core/` stays pure (architecture test). Policies in code, not prompts (§5).
- Only the OCR invoker may import `child_process`; fixed binary path, argument array, real path inside the data dir (§5.7, enforced by test).
- All file writes and moves go through a path guard that allows only the data dir and `skills/` (§5.7). No deletes of the owner's photos.
- Forward-only SQLite migrations in `constants.ts` `MIGRATIONS`; next is migration 3 (§6c).
- One generation at a time: any model call during ingestion goes through `GENERATION_QUEUE` (§4.8).
- `hbs` render locals are server-side values only (§5.7). This design keeps that rule unchanged (§5.5).
- Model output is rendered as text (`textContent`) (CLAUDE.md). Markdown is shown as plain text until Phase 9's sanitized rendering.
- No comments in code; one declaration per file with role suffixes; all constants in `constants.ts`; TDD.
- UI matches the Floaterball neon style and `docs/mockups/curbie.css` (§4.1.0). There is no recipes mockup; new pages reuse existing classes (`panel`, `form-group`, `form-row`, `neon-input`, `neon-button`, `tile`).
- The M1 has Swift 6.3 (`swiftc`) via Xcode.

## 4. Approaches considered

### 4.1 Structuring OCR text

| | Approach | Trade-off |
|---|---|---|
| A | The model writes the recipe from the OCR text | Best on messy handwriting, but it can silently "tidy" `1 tsp` into `1 tbsp` or add a missing ingredient; review would have to catch model errors as well as OCR errors |
| B | Deterministic rules only (quantity-led lines are ingredients, lines after "Directions" are steps, first line is title) | Predictable and model-free, but brittle on family cards with no headings or ingredients inside steps |
| **C (chosen)** | **The model labels numbered OCR lines (title / heading / ingredient / step / servings / other) and code assembles them into the Markdown draft** | Model judgment on layout without letting it change a character; unlabelled lines surface in review |

The owner chose **C** on 2026-11-23.

### 4.2 How a recipe is stored and edited

| | Approach | Trade-off |
|---|---|---|
| Structured rows | Ingredient and step tables; a multi-field review form | Scaling reads columns directly, but sections need more tables, and a failed save must re-render typed free text, which conflicts with the `hbs` rule |
| **Markdown in SQLite (chosen)** | **One Markdown text per recipe in a fixed shape; code parses it when needed** | Sections are free (`###`), one text box to edit, saving a draft can't fail so the `hbs` rule stands; parsing is cheap because recipes are tiny |
| Markdown files on the drive | `.md` per recipe | Editable anywhere, but edits outside Curbie skip review and leave search stale |

The owner proposed Markdown and chose **SQLite storage** on 2026-11-23; file export comes later.

## 5. The design

### 5.1 Getting photos in

- **Inbox folder:** `<data dir>/inbox/`. Created at startup if missing (the data dir itself is still verified by the `.curbie-data-dir` marker).
- **Accepted files:** `.heic`, `.heif`, `.jpg`, `.jpeg`, `.png` (case-insensitive). Anything else is reported as unsupported and left in place. Hidden files (`.DS_Store`, `._*`) are ignored silently.
- **Grouping by file name (owner's decision):**
  - `texas-sheet-cake.heic` is a one-photo recipe.
  - `texas-sheet-cake-1.heic`, `texas-sheet-cake-2.heic` are one recipe, pages in number order.
  - Only a trailing `-1` to `-9` counts as a page number (*builder's call*). `grandmas-cake-1950.heic` is a one-photo recipe named `grandmas-cake-1950`.
  - Inconsistent numbering (a `-2` with no `-1`, a duplicate number, a gap, or a name used both bare and numbered) leaves every file of that group in the inbox and reports the group name and the reason. Never guess.
  - The file name is only used for grouping. The title comes from the card.
- **When it runs:** once after the server is listening (not blocking startup), and when the owner presses **SCAN INBOX** on Manage › Recipes. Only one scan runs at a time; pressing the button during a scan reports that a scan is already running.
- **Duplicates:** each photo's SHA-256 is recorded. A photo whose hash matches an existing recipe photo is reported as a duplicate and left in the inbox.
- **After processing:** a group's photos move to `<data dir>/originals/recipes/<recipe id>/` as `page-1.<ext>`, `page-2.<ext>`, and a JPEG display copy is written beside each (`page-1.jpg`). The originals are never modified.
- **A group that fails** (OCR finds no usable text, the helper crashes, the model call fails) stays in the inbox and is reported with the reason. The next scan retries it.

### 5.2 OCR helper

- A Swift command-line program in `ocr/` (repo root), built with `swiftc` into a fixed path (builder's call on exact location, recorded in `installation.md` and a constant). A build script in `scripts/`.
- Input: one image path and one output directory for the display copy. Output on stdout: JSON with the recognized lines in reading order, each with its text and Vision's confidence (0–1), plus the display-copy path.
- Uses Vision's accurate recognition level with language correction on, `en-US`.
- Writes the JPEG display copy with ImageIO (Chrome can't show HEIC), so no second program is needed.
- Exits non-zero with a message on stderr for any failure.
- **Invoker** (`adapters/ocr/`): the only `child_process` importer. `execFile` with the fixed binary path and an argument array, a timeout, real paths checked to be inside the data dir before the call. Its output is validated (shape, types) and parsed into core types; anything else is a loud error.
- **Low confidence:** lines below a threshold constant (starting value 0.5, tuned on real cards) are flagged. Flags are per line (Vision reports confidence per recognized line, not per word).

### 5.3 The recipe Markdown shape

A strict subset of Markdown, parsed by a pure parser in `core/` (not a general CommonMark library). Example:

```
# Texas Sheet Cake
Serves: 24

## Ingredients
### Cake
- 2 cups flour
- 1/2 cup butter
### Frosting
- 1/2 cup butter
- 1 T cocoa

## Steps
### Cake
1. Heat oven to 350.
### Frosting
1. Melt butter with cocoa.

## Notes
Grandma used Crisco.
```

- `# Title`: required, exactly one, first.
- `Serves: N` (or a range, `Serves: 6-8`): optional, directly after the title.
- `## Ingredients`: required, at least one `- ` item. Optional `### Section` headings group items; a block either uses sections throughout or not at all.
- `## Steps`: required, at least one numbered item (`1.`; the numbers written are ignored, order is the order of lines). Optional `###` sections as above. A plain line under a step joins that step (*builder's call*).
- `## Notes`: optional free text.
- `## Unsorted`: appears only in drafts (§5.4). Approval is refused while it exists.
- Any other `##` heading, or a line that fits nowhere, is a **problem**: shown on the review page with its line number, and it blocks approval.
- **Ingredient lines** are parsed by code into `{ quantity, unit, item }` when the recipe is scaled, indexed, or validated:
  - Quantities: integers, decimals, `1/2`, `1 1/2`, unicode fractions (`½ ¼ ¾ ⅓ ⅔ ⅛`), ranges (`2-3`, kept as a range), and none ("salt to taste").
  - Units: a fixed table of aliases in `constants.ts` (`c`, `cup`, `cups`, `T`, `Tbsp`, `tbsp`, `t`, `tsp`, `oz`, `lb`, `pkg`, `can`, `stick`, `qt`, `pt`, `ml`, `g`, …). **Capital `T` is tablespoon and lowercase `t` is teaspoon**, as on family cards.
  - A line with no readable quantity is a valid ingredient that scaling leaves unchanged. It is a warning on review ("line 9 has no quantity"), not a problem.

### 5.4 Structuring a draft (approach C)

1. All pages' OCR lines are concatenated in page order and numbered `1..n`.
2. **Line labelling (model):** through `GENERATION_QUEUE`, using the current model from settings, with a JSON schema response format. The prompt shows the numbered lines as untrusted data (§5.6 of design.md) and asks only for `{ "title": [...], "servings": n | null, "headings": [...], "ingredients": [...], "steps": [...] }` as line numbers. Lines not listed are "other".
3. **Harness checks on the labelling (code):** every number must be in `1..n`; no line in two lists; at least one ingredient and one step; otherwise one re-prompt with the reason, then fall back to an all-"other" draft. A model failure (Ollama down) fails the group loudly and leaves it in the inbox.
4. **Assembly (code, `core/`):** the OCR lines' text is copied, never altered, into the §5.3 shape:
   - Title lines joined into `# `. The servings line's number into `Serves:`, and the original servings line also stays under `## Unsorted` so the owner confirms the number ("Makes 2 dozen" becomes `Serves: 2`) before approving.
   - A heading line becomes `### ` inside whichever block (Ingredients or Steps) its following lines belong to.
   - Ingredient lines become `- ` items; step lines become numbered items, adjacent step lines merged per the builder's rule.
   - Every "other" line goes under `## Unsorted`, so nothing read is hidden and the owner must place or delete each one before approving (*builder's call*). The all-"other" fallback is a draft that is entirely `## Unsorted`.
5. The recipe also keeps the OCR record: every line's text, page, and confidence. It is never edited.

### 5.5 Review and Manage › Recipes

- **Manage hub:** a RECIPES tile with the count of approved recipes and a `▲ N need review` flag (mockup `manage.html` already shows this tile).
- **Manage › Recipes** (`/manage/recipes`): SCAN INBOX button, the last scan's problems, a **Needs review** list, and the approved recipes list (title, search box). Approved recipes with an unapproved edit are marked.
- **Review / edit page** (`/manage/recipes/<id>`), three parts:
  - The page photos (display copies, tap to open full size).
  - A read-only **OCR panel**: the numbered OCR lines as read, low-confidence lines marked `▲`. The marks live only here.
  - One **text box** holding the recipe's draft Markdown, with the problems and warnings from the stored draft listed above it.
- **Draft and approved copies (*builder's call*):** a recipe holds an approved Markdown (what chat uses, empty until first approval) and a draft Markdown (what the text box edits). Editing never changes what chat sees until approval.
  - **SAVE** always succeeds: it stores the text box as the draft, then redirects back to the page, which renders the stored draft and its problems. Typed text never round-trips from the request into a template, so the `hbs` rule stays exactly as written.
  - **APPROVE** saves the draft first, then approves only if the draft has no problems: copies it to the approved Markdown, rebuilds the search index entry, and stamps the approval time. Otherwise it redirects back with the problems shown.
  - **DISCARD** on a never-approved recipe removes the recipe and moves its photos to `<data dir>/discarded/<recipe id>/`. Nothing is deleted from disk.
  - On an approved recipe, **DISCARD EDIT** resets the draft to the approved copy, and **DELETE RECIPE** removes it entirely with the same photo move.
- **Low-confidence marks clear on approve** (*builder's call*): approving means the owner checked it against the photo. Chat and the read-only view never show marks.
- **The edited Markdown is the recipe** (*builder's call*): chat, scaling, and search all use the approved Markdown. The OCR record is shown only in review.
- Every POST goes through the Origin guard. Problems are fixed strings plus line numbers computed by the server.

### 5.6 Storage (migration 3)

In `curbie.db` (design §6b). Table shapes are the builder's call; the data that must be held:

- **Recipe:** id, title (from the approved Markdown, else the draft, for lists), approved Markdown (nullable), draft Markdown, status (`needs_review` | `approved`), the OCR record (lines with page and confidence), created / updated / approved timestamps.
- **Recipe page:** recipe id, page number, original file path, display file path, SHA-256.
- **Search index:** an FTS5 table over title, ingredient items, steps, and notes, parsed from the **approved Markdown only**, rebuilt for that recipe on approve and removed on delete.
- **Scan report:** the outcome of the most recent scan (counts and per-file problems) so the chat notice can be rebuilt on any page load.

No ingredient or step tables: the Markdown is the source, parsed on demand. All file paths stored are relative to the data dir.

### 5.7 Chat

**The notice.** After a scan, the chat page shows one notice line above the conversation, e.g. `▲ 4 new recipes ready to review · 1 scan problem → MANAGE › RECIPES`. Built server-side from stored counts (recipes needing review + last scan's problems) when the chat page renders, so it appears whether or not a tab was open during the scan. Gone when nothing is waiting. Not a chat message; Phase 4's Inbox replaces it.

**The `recipes` skill.** `skills/recipes.md`, `kind: lookup`, adapter `recipes`. Tools:

- `search_recipes(query)`: FTS5 over approved recipes; returns up to a constant number of matches (id, title, a short ingredient preview). Zero matches is a normal result, so the model says it doesn't know.
- `get_recipe(recipe_id)`: the approved Markdown.
- `scale_recipe(recipe_id, factor | servings)`: code multiplies every parsed quantity (ranges scale both ends; unparsed ingredients are left unchanged and marked) and returns the scaled recipe as Markdown in the same shape. `servings` requires the recipe to have servings, else a tool error the model reports. Quantities are formatted as kitchen fractions (`1 1/2`, not `1.5`) from a fixed table, rounding to the nearest ⅛ for volume units.

**The recipe card (owner's decision).** When an answer cites a `get_recipe` or `scale_recipe` result, the harness attaches that result's Markdown (built by code from the reviewed recipe, never by the model) to the reply as a recipe card. `chat.js` shows it under the model's answer in a monospace block via `textContent`, labelled with the title and, if scaled, the factor ("Texas Sheet Cake · doubled"), plus the link to the card photos. The skill document tells the model to answer briefly and let the card carry the recipe. Phase 9's Markdown rendering will format the card without changing where its content comes from.

**Citations** link to the recipe's read-only view (`/recipes/<id>`): the card photos and the approved Markdown as text. `Citation` gains an optional server-built link, rendered as an anchor by `chat.js` with `textContent` for the label.

### 5.8 Errors and degraded behaviour

- OCR helper missing at startup: the server still starts; scans report "OCR helper not built" (with the build command) and leave files in place; the Health dashboard later surfaces it.
- Ollama down during a scan: affected groups fail loudly and stay in the inbox.
- Data dir unwritable: existing behaviour (fail loudly).

## 6. Left to the builder

Exact table and column names; the OCR binary location and build script details; the line-labelling prompt wording; how adjacent OCR lines merge into one step; the unit alias table's full contents; FTS5 tokenizer choice; page layout details within the existing CSS; search result limit and preview length; the confidence threshold's starting value (tune on real cards); the exact wording of problems and warnings; how the recipe card is carried on the reply message (a new field next to citations).

## 7. Decisions

**The owner's (2026-11-23)**
- Approach C for structuring.
- Recipes have optional sections, in both ingredients and steps.
- Recipes are stored as Markdown, in SQLite. Exporting as `.md` files comes later.
- Chat shows the recipe from the reviewed copy, never the model's retyping.

**Calls made in this design, for the owner to check**
- Only a trailing `-1` to `-9` counts as a page number.
- Two recipes on one card is out of scope.
- Low-confidence marks live in the OCR panel and stop mattering once approved; chat never shows them.
- The edited Markdown is the recipe; the OCR record is review-only.
- Unlabelled lines land in `## Unsorted`, which blocks approval until sorted.
- A recipe keeps separate draft and approved copies, so editing an approved recipe doesn't change chat until re-approved.
- SAVE always succeeds and APPROVE refuses with problems; neither re-renders request data, so the `hbs` rule is unchanged.
- A plain line under a numbered step joins that step.
