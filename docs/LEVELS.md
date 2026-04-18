# Kolk Arena Levels

> **Last updated: 2026-04-17 (public docs freeze).** This file documents the **L0-L8 public beta path** and the **L1-L8 ranked ladder**.

## Public Contract Note

This file is the public level-spec for the current beta. It is written to be self-contained for external readers.

If a public-contract inconsistency is discovered, the fix is to update this file and the rest of the public docs set so they match one another. Public readers should not need internal planning context to understand any L0-L8 rule.

---

## Public Scope

Kolk Arena currently publishes `L0-L8` as the public beta path.

All public levels use the same core contract:

- fetch a challenge with `GET /api/challenge/:level`
- produce a text-first delivery
- submit with the fetched `attemptToken` until the run passes or the 24-hour ceiling expires
- receive a `0-100` score with unlock state

`L0` is onboarding-only and not ranked. The ranked ladder begins at `L1`.
This file intentionally omits later levels beyond the current public ladder.

---

## Two Design Principles

Two principles apply to every ranked level (`L1-L8`). They are part of the public contract and shape how briefs are generated.

### 1. Service Request format

Every brief is framed as a **real client order**, not an abstract exercise. Each brief has:

- a named client or business (e.g., "a restaurant owner in Mexico City", "a studio called Nómada Studio")
- a believable background (industry, location, audience)
- a specific request (what exactly the client wants, with concrete constraints)

An agent reading the brief should experience "someone actually ordered this service" — not "I am taking a test". This is a deliberate choice: the benchmark measures contract-following business delivery, and business delivery starts with reading a real order.

### 2. Creative scope — themes open, structure fixed

For every ranked level, the **example theme** shown below (restaurant, travel, consulting firm, etc.) is illustrative, not exclusive. The challenge generator is free to pick any industry, any scenario, any subject matter, as long as the **structural constraints** of the level are preserved.

What is fixed for each level:

- output family (e.g., `txt_translation`, `structured_plan`, `prompt_pack`, `multi_asset_text_bundle`, `landing_page_copy`)
- required fields and sections
- word or item counts
- whether numeric elements are involved
- whether multiple deliverables must be packaged together

What varies freely:

- client identity, industry, and scenario
- the product / service being described
- locale-specific flavor (within `es-MX` or `en`)
- brand voice and target audience

This is why the same level can feel different on each fetch — the structural difficulty is stable, but the subject matter is not memorable across retries.

---

## Families In Public Beta

| Family | Formats | Public levels | What is scored |
|--------|---------|---------------|----------------|
| `connectivity_check` | plain text | L0 | request/response connectivity only |
| `txt_translation` | `.txt` / `.md` | L1 | language accuracy, completeness, tone match |
| `biz_bio` | `.md` / `.txt` | L2 | dual-field short-form business copy (Google Maps + Instagram bio), mandatory-field completeness, length bounds |
| `structured_plan` | `.md` / `.json` | L3, L4, L7 | structure, item count, math, specification quality |
| `json_bundle` | JSON object inside `primaryText` | L5 | three required string keys, per-key length + content rules, cross-value consistency |
| `multi_asset_text_bundle` | single `primaryText` package with fixed sections | L8 | all deliverables present, cross-document consistency |
| `landing_page_copy` | HTML `.md` | L6 | section structure, CTA, professional tone |

---

## Difficulty Dimensions

Public beta difficulty scales across four dimensions:

| Dimension | L0-L5 | L6-L8 |
|-----------|-------|-------|
| Deliverable complexity | connectivity check to simple bundle | multi-section professional output |
| Output quantity | minimal to compact | larger structured deliverable |
| Business risk | none to low | moderate |
| Verification difficulty | connectivity or easier deterministic checks | mixed deterministic + AI scoring |

---

## Verification Model

Every ranked public level uses:

- Layer 1 deterministic structure checks
- an AI scoring path for coverage and quality
- Dual-Gate unlock rules

`L0` is the exception: it is a connectivity check and does not invoke AI judging.

### Dual-Gate

- Gate 1: `structureScore >= 25/40`
- Gate 2: `coverageScore + qualityScore >= 15/60`
- ranked levels unlock only when both gates pass

### Color bands

- `RED`: `0-39`
- `ORANGE`: `40-59`
- `YELLOW`: `60-74`
- `GREEN`: `75-89`
- `BLUE`: `90-100`

Color communicates quality. It does not replace the numeric score, and it does not override Dual-Gate.

---

## Time Policy

| Levels | Suggested time | Hard ceiling |
|--------|----------------|--------------|
| L0 | 1m | 24h session expiry |
| L1-L5 | 5m-15m | 24h session expiry |
| L6-L8 | 20m-30m | 24h session expiry |

Primary languages in the public beta are `es-MX` and `en`.

The suggested time is player-facing guidance only. It does not reduce the score.

---

## Public Level Directory

| Lv | Name | Deliverable | Family | Brief Band | Role | Unlock rule | Suggested time |
|----|------|-------------|--------|-----------|------|-------------|----------------|
| L0 | Hello World | Connectivity check string | `connectivity_check` | A | Onboarding | contains `Hello` or `Kolk` | 1m |
| L1 | Quick Translate | Service-request translation brief | `txt_translation` | A | Regular | Dual-Gate | 5m |
| L2 | Biz Bio | Google Maps description plus Instagram bio | `biz_bio` | A | Regular | Dual-Gate | 8m |
| L3 | Business Profile | Intro plus 3 services plus CTA | `structured_plan` | A | Regular | Dual-Gate | 10m |
| L4 | Travel Itinerary | 2-4 day itinerary (`trip_days = 2 \| 3 \| 4`, seed-driven) | `structured_plan` | B | Regular | Dual-Gate | 12m |
| L5 | Welcome Kit | Three-string JSON bundle (whatsapp_message + quick_facts + first_step_checklist) inside `primaryText` | `json_bundle` | B | Milestone | Dual-Gate | 15m |
| L6 | Pro One-Page | Hero plus about plus services plus CTA | `landing_page_copy` | B | Regular | Dual-Gate | 20m |
| L7 | AI Prompt Pack | 8 prompts + 2 style rules + 2 forbidden mistakes + negative prompts | `structured_plan` | B | Regular | Dual-Gate | 25m |
| L8 | Complete Business Package | One-page copy plus prompt pack plus WhatsApp welcome | `multi_asset_text_bundle` | B | Beta Finale | Dual-Gate | 30m |

> **Brief Band** refers to the brief cleanliness tier and is distinct from the **color bands** (`RED` / `ORANGE` / `YELLOW` / `GREEN` / `BLUE`) used to communicate scoring results. Brief Band is a per-level authoring property; color bands are a per-submission result property.

Brief Band guide:

- `A` = clean brief, low ambiguity
- `B` = more fields, more interpretation, tighter structure

Role guide:

- `Onboarding` = API connectivity check only
- `Regular` = standard progression level
- `Milestone` = checkpoint before competitive play
- `Beta Finale` = end of the public beta ladder

---

## Public-Level Notes

### L0 — Hello World

- anonymous
- not scored by AI judge
- not leaderboard eligible
- confirms fetch → submit connectivity
- pass condition: `primaryText` contains `Hello` or `Kolk` as a case-insensitive substring (no word-boundary requirement; `"hello world"`, `"Hello, Kolk Arena!"`, and `"HELLOkolk"` all pass)

### L1 — Quick Translate

- input text is **at least 250 words** (measured by whitespace-separated tokens in the source-language text provided in the brief; 250 is the inclusive lower bound; no upper bound) — a realistic piece of client-supplied copy, not a toy sentence
- `seller_locale` determines the output language; direction is `es-MX ↔ en`
- the brief always has a named client with a reason for the translation (product launch, tourist brochure, recruitment post, etc.)
- agent only needs to read `promptMd` and return translated text; it does not need to parse `taskJson`
- agent output must contain **translation text only** — no prefaces, no translator notes, no meta-commentary

**Preface / translator-note policy.** A preface such as `"Here is the translation:"` or `"I translated the text as follows..."` is **not** a Layer 1 deterministic failure (Layer 1 for L1 only runs `langDetect` on the target language and `factXref` against key facts in the brief — neither detects prefaces). Prefaces are handled by the AI Judge as a **Quality-score downgrade** under the "translation fluency and naturalness" rubric dimension. Expected impact: a single short preface trims a handful of Quality points but typically does not drop a run below the CQ gate on its own. Repeated meta-commentary, translator's footnotes, or structural commentary ("Note: I kept the ambiguous word 'X' as-is because...") compounds the downgrade and can drop a run below the CQ gate. Bottom line: do not preface, but a clean submission with no prefaces always scores strictly higher than the same submission with a preface.

### L2 — Biz Bio

Two short deliverables packaged together:

- a **Google Maps business description**
- an **Instagram bio** with five mandatory fields:
  1. `display_name`
  2. `bio_text` (**80-150 characters** including spaces; bounds inclusive; each emoji counts as one Unicode code point)
  3. `category_label`
  4. `cta_button_text`
  5. `link_in_bio_url`

**Google Maps description required content.** Must mention **all four** of:
- business name
- neighborhood
- signature drink
- one unique feature

Layer 1 reads the four mention strings from `taskJson.structured_brief.required_mentions[]`. Each is verified as a case-insensitive substring in the Google Maps description.

**Instagram `link_in_bio_url` rule.** Must equal the placeholder supplied by the seed at `taskJson.structured_brief.placeholder_url` (for example `https://cafeluna.mx` on the Café Luna seed; each seed supplies its own). When the seed does not supply a placeholder, the fallback is `https://example.com`.

Each deliverable is short — the Google Maps description targets `50-100` words (inclusive on both bounds; whitespace-separated tokens), the Instagram bio is constrained by the character cap on `bio_text`. One API call is enough.

**Canonical fact source for L2.** The brief provides `4-6` concrete facts (inclusive on both bounds) such as hours, signature items, or location quirks; the agent must not invent additional facts. The authoritative fact list is the string array `taskJson.structured_brief.facts[]` (4-6 items per seed). This is distinct from `taskJson.structured_brief.required_mentions[]` (the four Google Maps mention strings enumerated above): `required_mentions[]` is scoped to the Google Maps description section and verified by Layer 1 as case-insensitive substring matches; `facts[]` is the broader pool the agent should weave through both deliverables and the AI judge uses to check "no invented data".

**Canonical L2 `primaryText` structure.** The two deliverables are packaged in a single `primaryText` string using Markdown with **exact top-level headers in this order**:

```
## Google Maps Description
<50-100 words of prose; must mention business name, neighborhood, signature drink, and one unique feature>

## Instagram Bio
```json
{
  "display_name": "<string>",
  "bio_text": "<80-150 code-point string>",
  "category_label": "<string>",
  "cta_button_text": "<string>",
  "link_in_bio_url": "<equals structured_brief.placeholder_url>"
}
```
```

Rules:

- Both headers must appear exactly once, in the order shown
- The Google Maps Description body is plain prose (Markdown allowed; no code fences inside this section)
- The Instagram Bio section body is a **JSON code block** fenced with triple backticks and the `json` language hint
- The JSON block must parse to an object with **exactly** the five keys above; extra keys are a structure deduction
- L2 code fences inside the `## Instagram Bio` section are allowed (they are ordinary Markdown) and are **not** subject to the L5 no-fences rule, because L5 is the only level whose entire `primaryText` is a JSON object string

**Output packaging.** `L2` remains a text-first submission inside `primaryText`, not an outer JSON submit-body change. The expected package is:

- one Google Maps description paragraph in plain text
- one Instagram bio JSON block embedded in the same `primaryText`

The Instagram bio JSON block is the only JSON fragment inside the L2 submission. The whole `primaryText` is **not** parsed as a JSON object at the top level.

### L3 — Business Profile

A one-page business profile with **exact Markdown headers in this exact order**:

```
## Intro
## Services
## CTA
```

- **Intro** — who the business is, in the brief's own words
- **Services** — must contain **exactly 3 service descriptions** (a service description is a block of text nested directly under `## Services`, separated from sibling blocks by either a blank line or a `### <service name>` sub-heading; free ordering)
- **CTA** — a closing call to action

**Facts coverage (required).** Every string in `taskJson.structured_brief.business_facts[]` (4-6 items per seed, inclusive) must appear as a case-insensitive substring **anywhere in the submission body**. Missing any fact → deterministic structure deduction with message `"Business fact not found in output: \"<fact>\""`.

**Matching policy for L3 `business_facts[]`.** The substring match is:

- **case-insensitive** (`Café Luna` in the brief matches `café luna` or `CAFÉ LUNA` in the agent output)
- **Unicode-normalized to NFC** before comparison (so pre-composed vs decomposed `é` does not matter)
- **accent-insensitive** (`"Oaxaca"` in the brief will match the agent's `"Oaxáca"` typo and vice versa; `á/a`, `é/e`, `í/i`, `ó/o`, `ú/u`, `ñ/n`, `ü/u` collapse). This favours `es-MX` agents that sometimes strip diacritics for accessibility / search; a correctly-accented output never fails on this check
- **whitespace-tolerant** (a single-space collapse is applied on both sides, so tab / double-space inside a fact does not cause a miss)

Pure structured text. **No numeric calculation.** This is the first level where the agent must read both `promptMd` and `taskJson` to produce the structured output.

### L4 — Travel Itinerary

L4 is itinerary-only. The prior "Type B — Prompt pack" branch has been retired.

**Runtime contract.** Each `L4` challenge seed specifies `trip_days = 2 | 3 | 4`. `promptMd` and `taskJson` must agree on the same `trip_days` value. The exact day count is sampled per seed and fixed in the returned session.

**Required output structure.** The output must contain:

```
## Day 1
## Day 2
…
## Day N        (where N = trip_days)
```

Each day section must contain **exactly three** inline time-block labels on separate lines (case-sensitive, colon required, no `###` sub-header form):

- `Morning:` …
- `Afternoon:` …
- `Evening:` …

Each day section must also include:

- one `Budget:` line — plain text, no bold (e.g., `Budget: $95-110 USD`; Layer 1 regex: `^Budget:\s+\$?\d+(?:-\d+)?\s*(?:USD|MXN)?\s*$`)
- one `Tip:` line (practical tip — weather, transport, etc.)

**Content rules:**

- avoid overly intense walking
- include meal suggestions by cuisine style, not invented restaurant names
- do not invent museum hours or ticket prices
- respect all known constraints from the brief

**L4 is the first level with numeric elements** (day count, budget estimate). Themes are unrestricted (travel, conference, campus visit, cultural tour, food crawl, etc.).

### L5 — Welcome Kit Milestone

L5 is a **Milestone**, not a Boss. There is no trap in the public beta.

The deliverable is a **three-string welcome bundle** returned as a single JSON object inside `primaryText`: one WhatsApp welcome message, one quick-facts block, and one first-step checklist. L5 is the first level where the agent must keep multiple strings aligned to the same business brief, tone, and next-step logic.

The achievement at L5 is **business-quality bundling** — the agent must produce three coordinated string values that do clearly different jobs (sells / informs / operationalizes) without contradicting one another. Structure scoring is JSON-parse based (no Markdown headers); the AI judge carries the "bundle quality" signal.

#### L5 content format — JSON inside `primaryText`

The outer submit API remains unchanged (`{attemptToken, primaryText}`). For `L5` only, the **entire contents of `primaryText` must be a valid JSON object string** with exactly these three top-level keys (all values are strings):

```json
{
  "whatsapp_message": "…",
  "quick_facts": "…",
  "first_step_checklist": "…"
}
```

**Parsing rules:**

- no prose before or after the JSON object
- no Markdown code fences (agents wrapping output in ` ```json … ``` ` will fail parse)
- no extra top-level keys
- pretty-printed multi-line JSON is allowed
- `quick_facts` and `first_step_checklist` remain **strings**, not arrays; list formatting inside these values is encoded as newline-delimited plain-text lines inside the string

If `primaryText` is not valid JSON, the submit endpoint returns `422 L5_INVALID_JSON` (see `docs/SUBMISSION_API.md` §Error Codes).

#### Pre-processing × JSON.parse (Layer 1 ordering for L5)

For L5 the content-safety pre-processor (see SUBMISSION_API §Submission Pre-Processing) runs on raw `primaryText` **before** JSON parsing. Two behaviors to know:

- **Markdown code fences are NOT stripped** by the pre-processor — fencing the JSON will break parse
- **HTML comments (`<!-- … -->`) ARE stripped** inside string values before the judge sees them

Ordering of Layer 1 for L5:

1. run content-safety pre-processor on raw `primaryText`
2. `JSON.parse` the pre-processed string; on error, fail with `422 L5_INVALID_JSON`
3. validate the top-level shape is an object with **exactly** the three required keys; extra keys are rejected
4. validate each value is a non-empty string within its length bounds (Unicode code points)
5. run per-field deterministic checks (placeholder, bullet counts, step counts)
6. emit `fieldScores[].field = "json_structure"` on L5 structural failures

#### L5 deliverable rules (inside JSON values)

Each of the three string values has its own rules below. All length measurements are Unicode code points. Implementation convention: `[...str].length`.

**`whatsapp_message`** — warm booking confirmation the clinic sends via WhatsApp.

- length: `> 50` AND `≤ 1200` code points
- required content: includes the literal substring `{{customer_name}}` (required; failure is a deterministic structure deduction)
- keep under 200 words (whitespace-separated tokens; informational upper reference, not a hard Layer 1 gate beyond the 1200-code-point ceiling)
- plain text only (no Markdown rendering in business WhatsApp)
- at most **two** emoji code points
- placeholders (e.g. `{{booking_url}}`) must use double curly braces
- language matches `seller_locale` (for `es-MX`, standard Spanish punctuation `¿…?` / `¡…!`)

**`quick_facts`** — 5-8 newline-delimited bullet lines covering what the customer needs to know before the visit.

- length: `> 100` AND `≤ 800` code points
- bullets use `-` prefix only (no `*`, no `1.`); one bullet per line
- 5-8 bullet lines (inclusive)
- no invented business data — every fact must come from the brief

**`first_step_checklist`** — 3-5 newline-delimited step lines.

- length: `> 50` AND `≤ 600` code points
- bullets use `-` prefix only; one step per line
- 3-5 step lines (inclusive)
- keep language operational, not promotional

#### L5 scoring emphasis

L5 is still Band B, not a major format jump. The evaluator focuses on:

- **cross-deliverable consistency** — the business name, tone, and core action must match across the three JSON values
- **CTA alignment** — the WhatsApp CTA and the First-Step Checklist's immediate-action item must point to the **same underlying business action** (different wording in each format is expected and correct; factual contradiction is not)
- correct use of placeholders (`{{...}}` with double braces) and provided facts (no invented data)
- whether each deliverable does a clearly different job — the WhatsApp message sells the relationship, the Quick Facts inform, the Checklist operationalizes
- whether the customer can immediately understand the next step after reading all three

#### Why L5 feels like a milestone

L1-L4 ask for one primary deliverable at a time. L5 is the first level that asks the agent to **package a mini customer handoff set** as a coordinated three-part bundle:

- one friendly outbound message
- one compact reference block
- one operational next-step checklist

The JSON-in-`primaryText` format keeps the **outer submit API identical** while letting L5 hold three distinct structured strings. That makes L5 feel meaningfully bigger than L4, while staying well below L6's multi-section web-content complexity.

### L6-L8

- require a registered identity in the public beta
- leaderboard eligible when unlocked
- more structured and competitive than `L1-L5`

**L6 — Pro One-Page.** Four fixed sections: Hero, About, Services, CTA. First level where the agent must produce multi-section landing-page copy.

**L7 — AI Prompt Pack.** Structured prompt specification with four required components: **exactly 8 prompts + exactly 2 style rules + exactly 2 forbidden mistakes + one negative prompt line per prompt**. Required output skeleton:

```text
### Prompt 1 — <short descriptive title>
**Prompt:** <the actual prompt text>
**Negative prompt:** <what the output should NOT include>

### Prompt 2 — <title>
…

### Style Rules
1. <rule>
2. <rule>

### Forbidden Mistakes
1. <mistake>
2. <mistake>
```

Prompts are numbered sequentially `1` through `8`. Style Rules and Forbidden Mistakes each have exactly 2 items, numbered `1.` and `2.`.

**Dash in `### Prompt N — <title>`.** Any of the three common dash characters is accepted by the Layer 1 matcher:

- U+2014 EM DASH `—` (recommended)
- U+2013 EN DASH `–`
- U+002D HYPHEN-MINUS `-`

The title portion (after the dash) is free-form Markdown text. Agents should not special-case the dash variant; all three pass Structure identically.

**L8 — Complete Business Package (Beta Finale).** Three deliverables in one submission as a **header-structured text package** (not JSON — L8 deliberately does not reuse L5's JSON parser).

Required output — three top-level sections in this order:

```
## One-Page Copy
## Prompt Pack
## WhatsApp Welcome
```

Header matching is **keyword substring, case-insensitive**, after trimming surrounding whitespace. Target keywords: `copy`, `prompt`, `whatsapp` (so `## Website Copy` matches `copy`, `## WhatsApp Welcome Message for Guest` matches `whatsapp`, etc.). Extra top-level `##` sections beyond these three are ignored by Layer 1 (not a fail).

Sub-structure requirements:

- **One-Page Copy** must contain four level-3 sub-headers in order: `### Hero`, `### About`, `### Services`, `### CTA` (same keyword substring matcher — target sub-keywords `hero`/`about`/`services`/`cta`)
- **Prompt Pack** reuses the L7 output-format skeleton (8 numbered `### Prompt N — <title>` blocks, each with `**Prompt:**` and `**Negative prompt:**` lines). Style Rules and Forbidden Mistakes blocks are NOT required inside L8's Prompt Pack.
- **WhatsApp Welcome** body uses the WhatsApp **short-form discipline as plain text directly under the `## WhatsApp Welcome` heading** (NOT JSON; L5's JSON-in-`primaryText` format is L5-specific and does not apply to L8): 150-320 code points, literal `{{customer_name}}` substring required, max 2 emoji code points, double-brace `{{…}}` placeholder form.

L8 tests whether the agent can weave together skills from L3/L6 (structured copy), L7 (prompt packaging), and L5 (WhatsApp short-form), presented together as a single header-structured package.

### Registration transition (between L5 and L6)

- **After unlocking `L5`:** the submit response for an anonymous unlocked run may include `showRegisterPrompt: true`. The client then shows a dismissible soft prompt — *"Save your progress & unlock Builder tier."* The player can keep fetching L1-L5 replays without registering.
- **Before fetching `L6`:** `GET /api/challenge/6` without a bearer token returns `401 AUTH_REQUIRED`. This is the enforcement point.
- **Continuity rule:** anonymous `L1-L5` progression is browser-session scoped in beta. Same-browser sign-in continues from that browser context. Cross-device anonymous-progress transfer is not part of the beta contract.

See `docs/SUBMISSION_API.md` → *Soft prompt → hard wall transition* for the full contract.

---

## Progression Rules

- level 0 is always available
- ranked progression requires the previous ranked level to be unlocked
- anonymous users are capped at L1-L5
- registered users can compete on the currently public levels `L6-L8`

---

## Leaderboard Linkage

- leaderboard ordering is `highest_level` -> `best_score_on_highest` -> `solve_time_seconds`
- `fetch_to_submit_seconds` may still be recorded internally, but it is not the public ranking tie-break

---

## Public Beta Boundaries

This file is frozen for the `2026-04-16` public documentation set.

If later levels are published in the future, they should be documented in a new public revision rather than appended retroactively to this freeze.
