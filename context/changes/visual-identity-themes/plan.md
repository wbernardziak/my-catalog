# Board-game visual identity with theme selection — Implementation Plan

## Overview

Replace the starter's space theme with a board-game visual identity, shipped as three selectable themes — **Felt Table** (default), **Bright Shelf**, and **Punchboard** — chosen by the household member and persisted across visits. The colour work is only affordable because it is preceded by a token extraction: today 233 colour literals are hardcoded across 21 files, but they collapse into roughly 15 semantic roles.

Roadmap slice: **S-07** in `context/foundation/roadmap.md` (palettes, default theme, and scope are fixed there).

## Current State Analysis

The app wears the 10x Astro Starter identity end to end, and the theming layer it shipped with has never been used.

- **`bg-cosmic`** (`src/styles/global.css:113-115`) — a `#0a0e1a → #0f1529` space gradient — is the ground on all seven pages.
- **233 colour literals across 21 files.** Heaviest: `GameCard.tsx` (49), `RecommendationFlow.tsx` (32), `Welcome.astro` (28), `catalog.astro` (20), `GameForm.tsx` (18), `dashboard.astro` (17), `Topbar.astro` (15).
- **The vocabulary is small and repetitive**, which is what makes three themes viable: `text-white` (36), `border-white/10` (22), `text-purple-300` (18), `bg-white/10` (16), `text-blue-100/70` (12), `from-blue-200 → to-purple-200` (8), `bg-purple-600` (7), plus red / emerald / amber used semantically for error, liked, and warning states.
- **The shadcn token block (`global.css:6-111`) is entirely grayscale.** `--primary`, `--accent`, `--card`, `--chart-1…5` are all `oklch(… 0 0)` — a full theming layer, unused.
- **`button.tsx` is the only token-aware component** (`bg-destructive`, `bg-accent`, `dark:` variants). Because the tokens are colourless it renders grey, which is precisely why every screen hand-rolls `bg-purple-600` instead of using it.
- **`@custom-variant dark (&:is(.dark *))`** (`global.css:4`) is class-based, and nothing sets `.dark` on `<html>` today. The server can therefore select a theme by stamping a class on the root element — correct on first paint, no client JS.
- **There is no shared chrome.** `Topbar.astro` is imported only by `Welcome.astro:28`. `catalog.astro:49`, `play.astro:13`, and `stats.astro:37` each hand-roll a `<header>` with the same gradient `<h1>`; `dashboard.astro:10` has a bare `<h1>`. There is nowhere to put a switcher.
- **No test constrains any of this.** The nine vitest files cover services and API routes; none references a class name. The refactor cannot break the suite, and the suite cannot catch a visual regression.

## Desired End State

A household member opens MyCatalog and sees a board-game identity — Felt Table by default — with a switcher in the shared header offering all three themes. The choice survives reload, navigation, and sign-out, and the correct theme is present in the server's first response, so no screen ever flashes the wrong colours. No `src/` file names a colour directly; CI fails if one is re-added.

### Key discoveries:

- The dark variant is class-based (`global.css:4`), so theme selection is a server-side root-element class — no client hydration needed for first paint.
- `context.cookies` is already threaded into every route through `createClient` (`src/lib/supabase.ts:5`), so cookie persistence needs no new plumbing.
- The PRG form pattern is established: `src/pages/api/games/[id]/played.ts:36-50` reads `formData`, validates with a zod enum, and returns `context.redirect(...)`. The theme endpoint follows it exactly.
- `src/pages/api/*` is deliberately outside `PROTECTED_ROUTES` (`src/middleware.ts:4`) and each route does its own auth check. The theme endpoint needs no auth — signed-out visitors must be able to switch too.
- Semantic colours (red / emerald / amber for error, liked, loaned) are a separate axis from the accent and must stay legible in all three themes.

## What we are NOT doing

- **No Playwright or visual-regression tests.** That drags an entire E2E foundation into a theming change; it belongs to `/10x-test-plan`.
- **No per-member theme persistence in the database.** No migration, no RLS, no `supabase db push` in this change.
- **No new product features.** Nothing about catalog, recommendation, or stats behaviour changes.
- **No PRD amendment.** S-07 ships ahead of PRD v1 by explicit agreement; see the roadmap's Open Roadmap Questions.
- **No shadcn component library expansion.** Hand-rolled controls are converted in place, literal → token. No control adopts `button.tsx` during this change, whether or not it happens to match a variant — that is a separate decision, deliberately kept out of a 233-site sweep.
- **No user-authored themes or a colour picker.** Three fixed themes.

## Implementation Approach

Five phases, ordered so the single expensive mistake — a token vocabulary that cannot express a light theme — is discovered while it is still cheap. Phase 1 is structural only (no colour), which keeps the largest diff reviewable. Phase 2 builds the token layer with Felt Table **and** Bright Shelf defined together and proves both by stamping the theme class statically, so the vocabulary is stress-tested across a dark and a light ground before any call site is converted. Phase 3 performs the conversion sweep in four directory-sized chunks, each independently verifiable, and closes with the colour-literal guard. Phase 4 adds persistence and the switcher on top of a token layer that is already proven. Phase 5 adds the third theme — which by then is a data change — plus the badge system that carries the identity beyond colour.

The colour-literal guard lands at the **end of phase 3**, not at the end of the plan: it protects the conversion during phases 4 and 5, when new UI is being written.

## Critical Implementation Details

**The existing `.dark` block must go before any theme co-applies `dark`.** `global.css:41-73` currently redefines every shadcn token to grayscale. Because `.dark` beats `:root` on specificity, stamping `<html class="theme-felt dark">` while that block still exists would wipe the Felt palette out entirely. Phase 2 therefore deletes the `.dark` token block and moves its role into the theme blocks; `.dark` survives only as the trigger for the `dark:` variant in `button.tsx` — verified to be its only consumer — and carries no token values of its own.

**Sequencing of the root-element class.** The theme class and `.dark` are two separate concerns on `<html>`: Felt Table and Punchboard are dark grounds and must co-apply `dark` so `button.tsx`'s `dark:` variants resolve correctly; Bright Shelf must _not_. A single helper must own this mapping — if the two are set independently anywhere, a light theme with a stale `dark` class renders unreadable text on light surfaces. Phase 2 introduces that mapping as a static value in `Layout.astro`; phase 4 replaces the static value with the cookie-resolved one and changes nothing else about it, so what phase 2 verified is what ships.

**Open-redirect surface.** The theme endpoint takes a `next` path so the switch returns to the page the member was on. It must accept only same-origin absolute paths (leading `/`, no `//` or scheme), or it becomes an open redirect on a route that is intentionally unauthenticated.

---

## Phase 1: Shared chrome and starter removal

### Overview

Create the shared header the app has never had, and delete the starter's identity. No colour decisions in this phase — every class stays as-is so the diff is purely structural.

### Changes Required:

#### 1. Shared application header

**File**: `src/components/AppHeader.astro` (new), replacing `src/components/Topbar.astro`

**Purpose**: Give all seven pages one header, so the theme switcher in phase 3 has a home and the four divergent page headers stop drifting.

**Contract**: Props `{ title?: string }`. Renders the brand/wordmark, primary nav (Catalog, Play, Stats), and the session area currently in `Topbar.astro` (member email + sign-out form, or sign-in/sign-up links). Reads `Astro.locals.user` itself rather than taking it as a prop, matching how `Topbar.astro:2` does it today. When `title` is given it renders as the page `<h1>`, absorbing the per-page heading.

#### 2. Page header replacement

**File**: `src/pages/catalog.astro`, `src/pages/play.astro`, `src/pages/stats.astro`, `src/pages/dashboard.astro`, `src/components/Welcome.astro`

**Purpose**: Adopt the shared header and delete four near-identical hand-rolled `<header>` blocks.

**Contract**: Each page's `<header>` (`catalog.astro:49-57`, `play.astro:13-18`, `stats.astro:37-42`) and `dashboard.astro:10`'s bare `<h1>` are replaced by `<AppHeader title="…" />`. Any per-page action that lived in the header (e.g. the catalog's right-hand controls) stays on the page, below the header. `Welcome.astro:28` swaps `Topbar` for `AppHeader`.

#### 3. Starter asset removal

**File**: `src/layouts/Layout.astro`, `src/components/ui/LibBadge.astro`, `public/template.png`

**Purpose**: Remove the remaining starter fingerprints.

**Contract**: `Layout.astro:10`'s default title becomes `"MyCatalog"`. `LibBadge.astro` (verified unused — no importers) and `public/template.png` are deleted. `public/favicon.png` stays until phase 2 replaces it with the real mark. The starter hero copy in `Welcome.astro` is left alone: phase 2 rewrites that file once, in tokens.

### Success Criteria:

#### Automated verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Tests pass: `npm test`
- Default title no longer names the starter: `grep -n "10x Astro Starter" src/layouts/Layout.astro` returns nothing
- `LibBadge` and `template.png` are gone with no dangling references: `grep -rn "LibBadge\|template.png" src/ public/` returns nothing

#### Manual verification:

- All seven pages render the same header, with working Catalog / Play / Stats navigation
- Signed-out pages (landing, signin, signup, confirm-email) show sign-in/sign-up rather than member nav
- Header layout holds at mobile width without wrapping into the page content

**Implementation note**: Stop here for human confirmation that the manual checks passed before starting phase 2.

---

## Phase 2: Token layer, Felt Table + Bright Shelf, mark, and landing

### Overview

Build the vocabulary and prove it against both a dark and a light ground before a single call site is converted. Nothing in `src/` changes colour yet except the landing page, which is written straight into tokens.

### Changes Required:

#### 1. Token vocabulary and theme blocks

**File**: `src/styles/global.css`

**Purpose**: Turn the unused grayscale token block into the app's actual palette, expressed once per theme.

**Contract**: The existing shadcn roles (`--background`, `--foreground`, `--card`, `--primary`, `--accent`, `--border`, `--input`, `--ring`, `--destructive`) are filled with real values, extended with the roles the inventory exposed that shadcn lacks: a raised surface (today `bg-white/10`), a hairline (`border-white/10`), a muted ink (`text-blue-100/70`), and three semantic state roles for liked / disliked / loaned (today emerald / red / amber). `:root` holds Felt Table; `.theme-shelf` redefines every role for Bright Shelf. Every role defined in `:root` must be redefined in each theme block — a missing role silently inherits the previous theme's colour. `@theme inline` (`global.css:75-111`) gains the new roles so they are reachable as utilities. The `bg-cosmic` utility is renamed to the theme's ground and reduced to a token reference.

**The existing `.dark` block (`global.css:41-73`) is deleted in this step.** It redefines every shadcn token to grayscale and would beat `:root` on specificity the moment a dark theme co-applies `dark`, wiping the palette out. After deletion, `.dark` carries no token values and exists only as the trigger for `button.tsx`'s `dark:` variants — verified to be its only consumer in `src/`.

Palettes are fixed in the roadmap slice: Felt `#1d3b32` / `#f2e9d8` / `#c8a24a` / `#6b4a2f` / `#8c3b32`; Shelf `#f6f4ef` / `#17181c` / `#c0442a` / `#204b45` / `#e8b23c`.

#### 2. Static root-class stamp

**File**: `src/layouts/Layout.astro`, `src/lib/theme.ts` (new)

**Purpose**: Make phase 2's verification show the same rendering that ships, rather than a transient state without `.dark`.

**Contract**: `src/lib/theme.ts` gains the theme id union and `rootClass(theme)`, which returns the `<html>` class string — the theme class, plus `dark` for the dark grounds (Felt, later Punchboard), never for Shelf. `Layout.astro` calls it with a hardcoded `"felt"`. Phase 4 replaces that hardcoded argument with the cookie-resolved value and changes nothing else, so the mapping verified here is the mapping that ships.

#### 3. Brand mark

**File**: `src/components/BrandMark.astro` (new), `public/favicon.svg`, `src/layouts/Layout.astro`

**Purpose**: A mark that reads board-game at 32px and replaces the starter favicon.

**Contract**: A brass meeple on a felt tile as inline SVG, exported once as a component (used by `AppHeader`) and once as `public/favicon.svg`. `Layout.astro:18` points at the SVG, keeping the PNG as fallback. The mark uses its own fixed colours rather than tokens — it is a logo, not themed chrome.

#### 4. Landing page rewrite

**File**: `src/components/Welcome.astro`

**Purpose**: The first screen currently advertises someone else's product ("10x Astro Starter — A production-ready starter with authentication, modern tooling, and a cosmic developer experience"). Rewritten here rather than in phase 1 so it is written once, directly in tokens.

**Contract**: Hero copy describes MyCatalog — a shared household board-game catalog with AI play suggestions — with sign-in / sign-up as the primary actions. The star field and orb decorations (`Welcome.astro:6-25`) are removed. Written in token classes only, so this file is already done when the phase 3 sweep reaches it and drops off the conversion list.

### Success Criteria:

#### Automated verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Tests pass: `npm test`
- No starter strings remain anywhere: `grep -rn "10x Astro Starter" src/ public/` returns nothing
- The `.dark` token block is gone: `grep -n "^\.dark" src/styles/global.css` returns nothing

#### Manual verification:

- Landing page renders in Felt Table and describes MyCatalog, with no starter copy
- Switching `Layout.astro`'s hardcoded theme to `"shelf"` by hand renders the landing and header correctly in Bright Shelf — no invisible text, nothing inheriting Felt's colours
- `button.tsx`-derived controls look correct under Felt (with `dark`) and under Shelf (without it)
- Every token role defined in `:root` has a counterpart in `.theme-shelf` (read the two blocks side by side)

**Implementation note**: Stop here for human confirmation. This is the phase to stop at if the vocabulary feels wrong — it is the last moment before 233 conversions depend on it.

---

## Phase 3: Conversion sweep and the colour-literal guard

### Overview

Convert all remaining call sites to the proven vocabulary, in four directory-sized chunks so each is independently verifiable, then lock the result behind a CI guard.

### Changes Required:

#### 1. Call-site conversion

**File**: 20 files in four chunks, converted and verified one chunk at a time (`Welcome.astro` is already done in phase 2):

- **Chunk A — `auth/` (23 literals)**: `auth/FormField.tsx` (10), `pages/auth/signup.astro` (7), `pages/auth/signin.astro` (7), `pages/auth/confirm-email.astro` (7), `auth/SubmitButton.tsx` (4), `auth/ServerError.tsx` (3), `auth/PasswordToggle.tsx` (2), `auth/SignUpForm.tsx` (1)
- **Chunk B — `catalog/` (89 literals)**: `catalog/GameCard.tsx` (49), `catalog/GameForm.tsx` (18), `catalog/CatalogFilters.astro` (13), `catalog/PreferenceStatsTable.astro` (9)
- **Chunk C — `play/` (32 literals)**: `play/RecommendationFlow.tsx` (32)
- **Chunk D — pages and chrome (48 literals)**: `pages/catalog.astro` (20), `pages/dashboard.astro` (17), `AppHeader.astro` (15, from `Topbar.astro`), `pages/stats.astro` (13), `pages/play.astro` (3), `ui/button.tsx` (1)

**Purpose**: Remove every colour literal from `src/` so a theme change is a CSS change.

**Contract**: Each literal maps to the token role it was standing in for — surface, raised surface, hairline, ink, muted ink, accent, on-accent, or one of the semantic state roles. Existing `cn()` usage (`GameCard.tsx:3`) is preserved; class strings are not concatenated manually, per the repo convention. Conversion is mechanical: no control adopts `button.tsx`, no markup is restructured, no component is split. If a call site needs a role that does not exist, the role is added to **all** theme blocks rather than special-cased at the call site.

Chunks are ordered smallest-first so the mapping is exercised on `auth/` (simple forms) before `catalog/` (the 89-literal bulk). Each chunk is verified against both themes before the next begins.

> **Amendment (2026-08-01, after implementation — see commit `20f9a6d`).** Two files outside the inventory were also converted, both surfaced by the guard rather than by the original count: `src/components/Banner.astro` carried six hex values in a `<style>` block (so the config banner ignored the theme entirely — the utility-only inventory never saw it), and `eslint.config.js` gained a `scripts/**/*.mjs` block granting node globals so the guard script itself lints clean. Neither extends product scope. Recorded here because F4 of the implementation review flagged the file list as incomplete.

#### 2. Colour-literal guard

**File**: `scripts/check-color-literals.mjs` (new), `package.json`, `.github/workflows/ci.yml`

**Purpose**: Make the token layer stick. Without it, the next feature re-adds `bg-purple-600` and the third theme quietly breaks.

**Contract**: A node script scanning `src/**/*.{astro,tsx,ts}` for three families of colour literal, exiting non-zero with `file:line` for each hit:

1. Tailwind colour utilities — `bg-|text-|border-|from-|via-|to-|ring-|placeholder-|divide-|outline-` followed by a Tailwind palette name or `white`/`black`
2. Raw hex literals (`#rgb`, `#rrggbb`, `#rrggbbaa`) and `rgb()` / `rgba()` / `hsl()` / `oklch()` function calls
3. Colour-bearing CSS properties inside `style=` attributes and inline `<style>` blocks (`color`, `background`, `background-color`, `border-color`, `fill`, `stroke`, `box-shadow`)

Family 2 and 3 exist because the app already injects colour outside Tailwind — `Welcome.astro:22` carries `rgba(...)` in a `style` attribute today, and a utility-only scanner would let the next one through while the end state promises no `src/` file names a colour.

`src/styles/global.css` and `src/components/BrandMark.astro` are exempt — they are where colour is allowed to exist. Exposed as `npm run lint:colors` and added as a CI step. An ESLint rule was considered and rejected: class strings appear inside `.astro` attributes, JSX, and `cn()` calls, which makes an AST rule brittle across all three.

### Success Criteria:

#### Automated verification:

- Guard passes: `npm run lint:colors` reports zero literals
- Guard fires on a Tailwind literal: re-adding `bg-purple-600` makes it exit non-zero (deliberate-break check, then revert)
- Guard fires on a non-Tailwind literal: re-adding `style="color:#fff"` makes it exit non-zero (deliberate-break check, then revert)
- Guard runs in CI: `.github/workflows/ci.yml` includes the step
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Tests pass: `npm test`

#### Manual verification:

- Chunk A (`auth/`) verified under both themes before chunk B begins
- Chunk B (`catalog/`) verified under both themes before chunk C begins
- Chunk C (`play/`) verified under both themes before chunk D begins
- Chunk D (pages and chrome) verified under both themes
- Felt Table renders correctly across all seven pages
- Bright Shelf renders correctly across all seven pages via the hardcoded theme in `Layout.astro`
- Body text and muted text legible, focus rings visible, semantic states (error, liked, loaned) distinguishable — in both themes
- Layout unchanged from phase 1 at desktop and mobile widths — this phase changes colour only

**Implementation note**: Stop here for human confirmation before starting phase 4. Each chunk is committable on its own; the guard only goes green once chunk D lands.

---

## Phase 4: Cookie persistence and the theme switcher

### Overview

Make the theme a member choice: read on the server, applied to the root element, changed through a PRG form.

### Changes Required:

#### 1. Theme module extension

**File**: `src/lib/theme.ts` (created in phase 2), `src/lib/theme.test.ts` (new)

**Purpose**: Extend the module that already owns the theme list and root-class mapping with cookie parsing and redirect validation.

**Contract**: Already present from phase 2: the theme id union (`felt` | `shelf` | `punchboard`) and `rootClass(theme)`. Added here: the cookie name, the default (`felt`), a type guard for unknown cookie values, and a `safeNext(path)` returning a same-origin path or the fallback — rejecting anything not starting with a single `/`. `rootClass` is not modified; phase 2 already proved its mapping.

#### 2. Middleware wiring

**File**: `src/middleware.ts`, `src/env.d.ts`

**Purpose**: Resolve the theme once per request, next to the session.

**Contract**: `context.locals.theme` is set from the cookie via the type guard, falling back to the default when absent or invalid. `App.Locals` gains the `theme` field. This runs for every route, including unauthenticated ones — the theme is not gated on a session.

#### 3. Root element

**File**: `src/layouts/Layout.astro`

**Purpose**: Apply the member's theme in the first byte of HTML so nothing flashes.

**Contract**: The hardcoded `rootClass("felt")` from phase 2 becomes `rootClass(Astro.locals.theme)`. That single argument is the only edit — the mapping itself is untouched. No inline script and no client-side theme application.

#### 4. Theme endpoint

**File**: `src/pages/api/theme.ts` (new), `src/pages/api/theme.test.ts` (new)

**Purpose**: Persist the choice.

**Contract**: `POST` with `prerender = false`, following `played.ts`: reads `formData`, validates the theme with a zod enum, sets the cookie (`path: "/"`, `sameSite: "lax"`, one-year `maxAge`, `httpOnly` — only the server reads it), and redirects to `safeNext(next)`. An invalid theme redirects back without setting the cookie. No auth check — switching must work signed-out.

#### 5. Switcher UI

**File**: `src/components/ThemeSwitcher.astro` (new), `src/components/AppHeader.astro`

**Purpose**: The user-facing control.

**Contract**: A plain form posting to `/api/theme` with the target theme and the current path as `next`, mounted in `AppHeader` so it is present on all seven pages.

> **Amendment (2026-08-01, after implementation — see commit `4802b28`).** The original contract specified "one submit button per theme, no JavaScript, matching the JS-free PRG toggles in `GameCard`", with the active theme marked by `aria-current`. Shipped instead: a `"Theme:"` label and a `<select>`, which leaves room for the full theme names and takes far less header width — the bar already carries four nav links, an email, and sign-out. The select submits on change via a small inline script, with a `<noscript>` Apply button so the control still works without JavaScript. The endpoint, cookie, and `safeNext` validation are unchanged. Recorded here because the plan is the record: F1 of the implementation review flagged that the code no longer matched this paragraph.

### Success Criteria:

#### Automated verification:

- Theme module unit tests pass (type guard rejects unknown values, `rootClass` co-applies `dark` for felt and punchboard but not shelf, `safeNext` rejects `//evil.com`, `https://evil.com`, and protocol-relative paths): `npm test`
- Endpoint tests pass (valid theme sets the cookie and redirects; invalid theme redirects without setting it): `npm test`
- Guard still passes: `npm run lint:colors`
- Lint, build, tests pass: `npm run lint && npm run build && npm test`

#### Manual verification:

- Switching theme changes the app immediately and returns to the same page
- The choice survives a reload, navigation between pages, and sign-out → sign-in
- No flash of the wrong theme on any page, including a hard refresh with a cold cache
- Switching works while signed out (landing and auth pages)
- Manually corrupting the cookie value falls back to Felt Table rather than erroring
- Switcher is reachable and usable at mobile width

**Implementation note**: Stop here for human confirmation before starting phase 5.

---

## Phase 5: Punchboard and the badge system

### Overview

Add the third theme — now a data change — and the shape-based badge system that makes the app read board-game beyond colour.

### Changes Required:

#### 1. Punchboard theme

**File**: `src/styles/global.css`

**Purpose**: The third theme.

**Contract**: A `.theme-punchboard` block redefining every role: press black `#17171a`, chipboard `#ded0b4`, token orange `#d98324`, rust `#b04a2a`, board teal `#2e6e6b`. It also overrides `--radius` to near-zero for the punched-token look, and the shadow treatment becomes a hard offset rather than a soft blur. If a role turns out to need a per-theme radius or shadow token, it is added to all three blocks — not special-cased in a component.

#### 2. Badge and metadata components

**File**: `src/components/ui/GameMeta.tsx` (new), consumed by `src/components/catalog/GameCard.tsx`, `src/components/play/RecommendationFlow.tsx`, `src/components/catalog/PreferenceStatsTable.astro`

**Purpose**: Encode game state in shape as well as colour, so the catalog scans like a game shelf.

**Contract**: **One implementation, in `.tsx`.** Two of the three consumers (`GameCard.tsx`, `RecommendationFlow.tsx`) are React islands, where an `.astro` component cannot be used; a React component works in all three, rendering statically inside `PreferenceStatsTable.astro` with no client directive and importing directly into both islands. An `.astro` version is explicitly not written — two parallel implementations of the same pips and dice is the failure mode being avoided.

Exports: player count as pips (filled to the supported range), duration as a die glyph with the minute count, played state as per-member meeples, loan state as a distinct badge. All colours come from tokens.

#### 3. Pip/duration helpers

**File**: `src/lib/services/gameMeta.ts` (new), `src/lib/services/gameMeta.test.ts` (new)

**Purpose**: Keep the display logic testable and out of the components.

**Contract**: Pure functions mapping a player-count range to a pip array and a play time to a duration bucket, with defined behaviour for missing, zero, and out-of-range values.

### Success Criteria:

#### Automated verification:

- `gameMeta` unit tests pass, including missing/zero/out-of-range player count and play time: `npm test`
- Guard passes: `npm run lint:colors`
- Lint, build, tests pass: `npm run lint && npm run build && npm test`

#### Manual verification:

- All three themes render correctly across all seven pages (21 combinations) at desktop and mobile widths
- Punchboard's square corners and offset shadows are consistent — no component keeps a rounded, soft-shadowed look
- Pips, duration, and played meeples are legible in all three themes, including for a game with missing player count or play time
- Genre, played, and loan state are distinguishable without relying on colour alone
- The AI recommendation flow and stats page carry the same badge language as the catalog

**Implementation note**: Stop here for human confirmation. This is the last phase; after sign-off the change is ready for `/10x-impl-review`.

**Annex 2026-08-02 — closing 5.8 needed code, not just a browser pass.** Driving the last
manual row exposed that "the same badge language as the catalog" was only two-thirds true:
`RecommendationFlow.tsx` shared `PlayerCount` and `PlayTime` with `GameCard.tsx` but rendered
neither `LoanBadge` nor `PlayedMeeple`, and `RecommendationViewItem` carried no field for
either. Since the route feeds the ranker every live game (no loan/played filter), a loaned or
already-played game could be recommended with nothing on the card saying so.

Files changed beyond this phase's list, all inside the badge system it owns:

- `src/lib/services/recommendationView.ts` — new `RecommendationDisplayGame` (`CandidateGame &
  { loanStatus }`), two new fields on `RecommendationViewItem`, join carries them through.
- `src/pages/api/recommendations.ts` — builds the one list both callers read.
- `src/components/play/RecommendationFlow.tsx` — renders the two missing badges in the
  catalog's order.
- `src/lib/services/recommendationView.test.ts` — two added cases (state carried through;
  absent `played` reads as not played).

`CandidateGame` was deliberately left alone: it is the ranker contract, loan state is not a
ranking input, and `recommend()` picks its prompt fields explicitly — so the model's input is
byte-identical to before and ranking behaviour is unchanged.

---

## Testing Strategy

### Unit tests:

- Theme module: unknown cookie value falls back to default; `rootClass` co-applies `dark` for felt and punchboard, never for shelf; `safeNext` rejects `//evil.com`, `https://evil.com`, and non-slash-prefixed input
- Theme endpoint: valid theme sets the cookie and redirects to the validated next path; invalid theme redirects without setting it
- `gameMeta`: pip array for typical ranges plus missing, zero, and out-of-range player counts; duration bucketing at boundaries

### Integration tests:

None beyond the existing suite. This change adds no data flow and no service integration; the meaningful verification is visual and is handled manually.

### Manual testing steps:

1. Load each of the seven pages under Felt Table; confirm the header, mark, and colours
2. Switch to Bright Shelf; repeat, watching specifically for text that inherited a dark-theme colour
3. Switch to Punchboard; repeat, watching for components that kept rounded corners or soft shadows
4. Reload and navigate between pages; confirm the theme holds and nothing flashes
5. Sign out, confirm the theme still holds, switch while signed out, sign back in
6. Corrupt the theme cookie in devtools; confirm fallback to Felt Table
7. Repeat step 1–3 at 375px width
8. ~~Add a game with no play time and no player count; confirm the badges degrade rather than break~~ — **NOT APPLICABLE**, see Open items §8: the schema forbids the state, so this is unreachable through the UI, the API, or SQL. The degradation it was reaching for is covered by the `gameMeta` unit tests instead

## Performance Considerations

Three theme blocks add roughly 60 custom-property declarations to a stylesheet that already ships them; the cost is negligible and the file is served once. Theme resolution is a cookie read in middleware — no database round trip, no additional latency on any route. The switch is a form POST plus redirect, matching the existing toggles.

## Migration Notes

No data migration. Existing sessions have no theme cookie and therefore get Felt Table, which is the intended default. The cookie is additive and independent of the Supabase auth cookies, so sign-out does not clear it — deliberate, so the theme survives re-authentication.

## References

- Roadmap slice: `context/foundation/roadmap.md` § S-07 (palettes, default, scope)
- PRG endpoint pattern: `src/pages/api/games/[id]/played.ts:36-50`
- Cookie plumbing: `src/lib/supabase.ts:5-24`
- Class-based dark variant: `src/styles/global.css:4`
- Unused token block: `src/styles/global.css:6-111`
- Only shared-chrome consumer today: `src/components/Welcome.astro:28`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

> **Third pass, 2026-08-02.** Manual testing steps 1–7 were re-driven end to end against a
> freshly restarted dev server and logged step by step; step 8 is now Not Applicable (Open
> items §8) and the recommendation flow was skipped by request. No row changed state: every
> `- [x]` Manual row below still holds, and 5.8 is still the only one open. Evidence from
> that pass: 181 text nodes measured for contrast under Bright Shelf with 0 AA failures,
> 0 elements with a radius >= 6px under Punchboard, 21 theme × page combinations at 375px
> with no horizontal overflow, and a clean browser console across every catalog load.

### Phase 1: Shared chrome and starter removal

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 8176fdc
- [x] 1.2 Build passes: `npm run build` — 8176fdc
- [x] 1.3 Tests pass: `npm test` — 8176fdc
- [x] 1.4 Default title no longer names the starter in `Layout.astro` — 8176fdc
- [x] 1.5 `LibBadge` and `template.png` removed with no dangling references — 8176fdc

#### Manual

- [x] 1.6 All seven pages render the shared header with working navigation — manual check 2026-08-01 (click-through re-verified after `AppHeader` moved into `Layout.astro`)
- [x] 1.7 Signed-out pages show sign-in/sign-up rather than member nav — manual check 2026-08-01 (exercised via the signed-out auth pages and sign-out → sign-in)
- [x] 1.8 Header holds at mobile width — manual check 2026-08-01 (375px: header stacks to mark / nav / theme / account rows, nothing clipped or overflowing)

### Phase 2: Token layer, Felt Table + Bright Shelf, mark, and landing

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 64f0e6d
- [x] 2.2 Build passes: `npm run build` — 64f0e6d
- [x] 2.3 Tests pass: `npm test` — 64f0e6d
- [x] 2.4 No starter strings remain in `src/` or `public/` — 64f0e6d
- [x] 2.5 The `.dark` token block is gone from `global.css` — 64f0e6d

#### Manual

- [x] 2.6 Landing page renders in Felt Table and describes MyCatalog — manual check 2026-08-01
- [x] 2.7 Hardcoding the theme to `"shelf"` renders landing and header correctly in Bright Shelf — OBSOLETE 2026-08-01, not performed: a phase-2 scaffold step from before the switcher existed, superseded by the real switcher verified in 4.5 and 4.8
- [x] 2.8 `button.tsx`-derived controls correct under Felt (with `dark`) and Shelf (without) — manual check 2026-08-01 (no light-on-light under Shelf; primary/secondary/destructive and the card toggles all resolve)
- [x] 2.9 Every `:root` token role has a counterpart in `.theme-shelf` — 1b3980b, now statically enforced by `lint:contrast`, which fails on a theme block missing a role (deliberate-break check)

### Phase 3: Conversion sweep and the colour-literal guard

#### Automated

- [x] 3.1 Guard passes: `npm run lint:colors` reports zero literals — 20f9a6d
- [x] 3.2 Guard fires on a Tailwind literal (deliberate-break check) — 20f9a6d
- [x] 3.3 Guard fires on a non-Tailwind literal (deliberate-break check) — 20f9a6d
- [x] 3.4 Guard step present in `.github/workflows/ci.yml` — 20f9a6d
- [x] 3.5 Lint passes: `npm run lint` — 20f9a6d
- [x] 3.6 Build passes: `npm run build` — 20f9a6d
- [x] 3.7 Tests pass: `npm test` — 20f9a6d

#### Manual

- [x] 3.8 Chunk A (`auth/`) verified under both themes — manual check 2026-08-01
- [x] 3.9 Chunk B (`catalog/`) verified under both themes — manual check 2026-08-01 (all seven fixture cards, including the long title and the 1-player / 4–12+ / 10 min / 240 min edge cases)
- [x] 3.10 Chunk C (`play/`) verified under both themes — manual check 2026-08-01 (criteria form and the empty/error result panels; see 5.8 for the results list)
- [x] 3.11 Chunk D (pages and chrome) verified under both themes — manual check 2026-08-01
- [x] 3.12 Felt Table renders correctly across all seven pages — manual check 2026-08-01
- [x] 3.13 Bright Shelf renders correctly across all seven pages — manual check 2026-08-01 (no text found carrying a dark-theme colour)
- [x] 3.14 Text legible, focus rings visible, semantic states distinguishable in both themes — 1b3980b, measured against WCAG AA rather than eyeballed, and now held by `lint:contrast` (81 assertions of every ink role against every surface it can land on)
- [x] 3.15 Layout unchanged from phase 1 at desktop and mobile widths — manual check 2026-08-01 (all 21 theme × page combinations measured at 375px: `documentElement.scrollWidth <= innerWidth` everywhere, so no horizontal overflow)

### Phase 4: Cookie persistence and the theme switcher

#### Automated

- [x] 4.1 Theme module unit tests pass, including `safeNext` rejection cases — 19b5be4
- [x] 4.2 Theme endpoint tests pass (valid sets cookie and redirects; invalid does not set) — 19b5be4
- [x] 4.3 Guard still passes: `npm run lint:colors` — 19b5be4
- [x] 4.4 Lint, build, tests pass — 19b5be4

#### Manual

- [x] 4.5 Switching changes the theme and returns to the same page — manual check 2026-08-01
- [x] 4.6 Choice survives reload, navigation, and sign-out → sign-in — manual check 2026-08-01
- [x] 4.7 No flash of the wrong theme on hard refresh — manual check 2026-08-01, and structural rather than lucky: `Layout.astro:16` stamps `rootClass()` on `<html>` server-side and nothing on the client ever touches `documentElement` or a `theme-*` class (grep over `src/`), so the first painted frame already carries the theme
- [x] 4.8 Switching works while signed out — manual check 2026-08-01 (switched from a signed-out auth page)
- [x] 4.9 Corrupted cookie falls back to Felt Table — manual check 2026-08-01; the cookie is `httpOnly`, so this was driven server-side against the real middleware. `GARBAGE-not-a-theme`, `../../etc/passwd`, empty, and `PUNCHBOARD` (wrong case) all render `class="theme-felt dark"`, same as no cookie at all — no error, no blank page
- [x] 4.10 Switcher usable at mobile width — manual check 2026-08-01 (375px: full-width labelled `<select>` on its own header row)

### Phase 5: Punchboard and the badge system

#### Automated

- [x] 5.1 `gameMeta` unit tests pass, including missing/zero/out-of-range values — b84234d
- [x] 5.2 Guard passes: `npm run lint:colors` — b84234d
- [x] 5.3 Lint, build, tests pass — b84234d

#### Manual

- [x] 5.4 All three themes render correctly across all seven pages at desktop and mobile widths — manual check 2026-08-01 (21 combinations at 1920px and again at 375px)
- [x] 5.5 Punchboard corners and shadows consistent across every component — manual check 2026-08-01 (cards, inputs, selects, buttons, and badges are all square with the hard offset shadow; the only rounded thing left is the mark tile, which is the brand asset and is deliberately identical in all three themes)
- [x] 5.6 Pips, duration, and played meeples legible in all three themes — 1b3980b; the played meeple was a live AA failure at 2.46:1 on a Felt Table card, fixed by splitting `--success-mark` out of `--success` and now guard-enforced
- [x] 5.7 Genre, played, and loan state distinguishable without colour alone — manual check 2026-08-01; every state carries a text label plus a distinct glyph, so none of them rests on hue: genre is a word, played is "Played"/"Not played yet" with a filled vs outline meeple, loan is "On the shelf"/"Loaned" with a shelf vs outbound-arrow icon, player count is a pip row, and the duration glyph changes with the bucket
- [x] 5.8 Recommendation flow and stats page carry the same badge language as the catalog — 2026-08-02, and it took code to make true (see the phase-5 annex). Stats was already the same played meeple in the same role. The recommendation card was missing `LoanBadge` and `PlayedMeeple` entirely; both now render, in the catalog's order. Driven live against the real provider once the quota reset (§1): 4 players, no time or genre. Rank 1 `QA Party Marathon` shows **Loaned** + filled **Played** meeple, rank 2 `Catan` shows **On the shelf** + **Played**, rank 3 `QA Long Title…` shows **Loaned** + **Not played yet** — so both states of both badges were seen, not inferred. Verified in all three themes (Bright Shelf, Felt Table, Punchboard; Punchboard squares the loan pill with every other corner). Narrow-width check was a 343px card simulation rather than a 375px viewport — the window manager refused the resize — with the long fixture title injected: title wraps to four lines, the loan badge stays pinned and unsquashed (`shrink-0`), the meta row wraps to two, `scrollWidth === clientWidth` on every card

## Open items

> Updated 2026-08-01 after a **second, full manual pass** that drove the 17 rows the first
> pass had left untouched. 25 of 26 Manual rows are now signed off. The single row still
> open (5.8) is blocked on an external quota, not on anything in this change. Nothing in
> the second pass failed: no theme regression, no layout break, no contrast surprise.
>
> Updated again 2026-08-02 after a **third pass**, run against a freshly restarted dev
> server and logged step by step to an external run log. Seven of the eight manual testing
> steps ran end to end; the recommendation flow was skipped by request (still the §1 quota)
> and step 8 turned out to be unreachable by design (§8). Nothing failed. Two new entries
> come out of it: §8 (step 8 asks for a state the schema forbids) and §9 (a thin AA margin
> the static guard structurally cannot see). §6's fetch error did **not** reproduce.

### 1. Recommendation latency — CLOSED 2026-08-02, quota reset and flow driven

**2026-08-02.** The daily free-tier allowance reset as predicted. `GET /api/v1/key` reports
`usage_daily: 0`, and the flow was driven end to end through the app three times (one per
theme), each returning ranked results well inside the cap. 5.8 is signed off; nothing about
this item blocks anything now. The history below stays for the latency reasoning.

**2026-08-01 update.** The latency fix holds. Measured through the app's own endpoint,
three consecutive calls returned in **367ms, 444ms, 713ms** — no timeouts, comfortably
inside `TIMEOUT_MS = 8000` and under the 5s NFR target. That part of §1 is settled.

What blocks 5.8 now is different and external: the OpenRouter account is **out of free-tier
requests for the day**. The provider returns

```
HTTP 429  Rate limit exceeded: free-models-per-day   (X-RateLimit-Limit: 50, Remaining: 0)
```

which the service correctly maps to `provider_error`, and the UI correctly renders as
"The recommendation service is unavailable right now. Please try again shortly." The
degradation path is therefore _verified_; only the success path is not.

The quota resets at **02:00 CEST on 2026-08-02** (`X-RateLimit-Reset: 1785628800000`). The
benchmarking runs recorded below are what consumed the 50. To close 5.8, re-run the flow
after the reset — or add credits, which raises the free-model allowance to 1000/day.

The original investigation follows, unchanged.

### 1a. Recommendation latency — RESOLVED 2026-08-01, stays free

The flapping between `timeout` and `invalid_response` was never about _which_ model. The
configured `nvidia/nemotron-3-super-120b-a12b:free` was spending seconds and hundreds of tokens
reasoning before answering, leaving ~1.7s of headroom against `TIMEOUT_MS = 8000`.

Querying OpenRouter live: of 337 models, 14 are free, and only **5 free models support the
`response_format: json_object` the service requires** — all 5 reasoning-capable. So switching to
a "fast free instruct model" was not actually an available option; the pool does not contain one.

Reasoning-_capable_ is not reasoning-_by-default_, though, and it can be turned off. Measured
over unique payloads per run (identical payloads get cached — the first benchmark pass returned
implausible 0.3s times from a 120b model and had to be redone):

| model                             | reasoning | result                                 |
| --------------------------------- | --------- | -------------------------------------- |
| `nemotron-3-super-120b-a12b:free` | on        | 5 timeouts in 8, 1688 reasoning tokens |
| `nemotron-3-super-120b-a12b:free` | **off**   | **12/12 clean, 0.3–0.5s** ✅           |
| `gemma-4-26b-a4b-it:free`         | off       | 3 timeouts in 8 — still flappy         |
| `gpt-oss-20b:free`                | off       | HTTP 400, rejects the flag             |
| `gemma-4-31b-it:free`             | either    | HTTP 429, rate-limited                 |

Fix: `reasoning: { enabled: false }` on the request body. Same free model, no cost, and 0.3–0.5s
comfortably beats the 5s NFR target rather than merely missing the 8s cap. Covered by a
regression test that fails if the flag is removed, since it is load-bearing rather than an
optimisation.

5.8 is no longer blocked on a decision — it just needs driving against a real response.

### 2. Aesthetic sign-off needed — review page added 2026-08-01, decision still open

Open `context/changes/visual-identity-themes/contrast-review.html` in a browser. It shows all
four changes old-vs-new on the real surface each one lands on, with the ratios recomputed from
`global.css` at review time. Self-contained, not wired into the app, never shipped — `src/` is
the only thing the build and the colour guard look at.

Contrast was fixed against measured WCAG AA targets, not by eye. All pass, but these visibly
depart from the original palette intent and are judgement calls:

| What                          | Was                                   | Now                                        | Why                                  |
| ----------------------------- | ------------------------------------- | ------------------------------------------ | ------------------------------------ |
| Punchboard stats "You" column | `--primary` `#d98324` (bright orange) | `--card-accent-ink` `#7c4b15` (dark brown) | Orange on chipboard was 1.91:1       |
| Bright Shelf nav links        | `#c0442a`                             | `--accent-ink` `#b44027`                   | Was 4.34:1 as text on the header bar |
| Bright Shelf muted ink        | `#6f7178`                             | `#65676d`                                  | Was 4.13:1 on `--surface-subtle`     |
| Played meeple                 | `--success` `#4a8a63`                 | `--success-mark` `#96bba5`                 | Was **2.46:1** on a Felt Table card  |

The meeple is the biggest shift — noticeably lighter and sager — and was a genuine live AA
failure the first browser audit missed.

### 3. Create and edit flows — CLOSED 2026-08-01

Both driven end to end in the second pass. Created `QA Create Check` (Strategy, 2–5 players,
75 min) from the catalog form: the card appeared at the top of the list with the right pips,
duration glyph, and "On the shelf" badge, and the form reset. Opened Edit on it: the inline
form pre-populated from the row, and saving a changed title and play time (75 → 120) updated
both the card and its duration glyph. Deleted it again through delete-confirm.

The fixture set is back to its original contents (the test row is soft-deleted via
`deleted_at`, which is the app's normal delete, so it is out of every live view).

### 4. The contrast guard is static only

`scripts/check-contrast.mjs` reads token values out of `global.css` and asserts every ink role
against every surface it can land on — 81 assertions, no browser, no new dependency, proven to
fire against three deliberate breaks (regressing the original bug, deleting the `.bg-card`
context rule, and a theme block missing a role).

It validates the **palette**; it cannot catch a component using the wrong role in the wrong
place. Only a browser validates the markup — note the static check found the 2.46:1 meeple
precisely because the browser audit measured text nodes and the meeple is an SVG. Different
blind spots. If Playwright arrives for the `/10x-e2e` phases, porting the ad-hoc runtime audit
(24 theme × page combinations) into a spec would subsume 3.8–3.11 permanently.

**A third blind spot found 2026-08-02, shared by both checks:** neither sees a
`bg-clip-text` gradient. The static guard cannot, because a gradient is not an
ink-role-on-surface pair; the runtime audit cannot, because such an element's computed
`color` is `transparent` and measuring it yields a meaningless ratio. See §9 — a real
heading in this change sits 0.03 above its AA threshold and both checks report it clean.

### 5. QA fixtures still in local Supabase

Local only, never left the machine. Auth user `qa-themes@example.com`
(`c17b808f-95ea-47fc-9809-68af58f984d6`), four games titled `QA %` covering 1-player, 4–12+
players, 10 min, 240 min, loaned/available, played/unplayed and a deliberately long title, plus
three `game_played` rows. Keep them while eyeballing the themes — the badge edge cases are why
they exist. To remove:

```sql
delete from public.games where title like 'QA %';
-- then the auth user c17b808f-95ea-47fc-9809-68af58f984d6
```

### 6. Operational note — Vite cache corruption

Editing `package.json` mid-build can leave two copies of React in the SSR graph
(`Invalid hook call`, `Cannot read properties of null (reading 'useState')`). **The tell is a
truncated page**: the HTML stream aborts at the first React island, so header and static markup
render and the page simply stops — it looks exactly like a data or auth bug. Cure:
`rm -rf node_modules/.vite` and restart. One cold-start occurrence right after restart is normal.

**Confirmed again 2026-08-01.** A long-running dev server had drifted into this state and
`/catalog` rendered "Could not load the catalog. Please try again." with a
`Failed to fetch dynamically imported module` in the browser console — i.e. it presented as a
_data_ failure, not a build one, exactly as warned above. `rm -rf node_modules/.vite` plus a
restart cleared it, and the documented one-off cold-start occurrence appeared immediately after
the dep re-optimization and then never again.

**Mitigated 2026-08-01.** `catalog.astro` and `stats.astro` caught their data-fetch throw with a
bare `} catch {` and reported only "Could not load the catalog." Both now `console.error` the
cause first, so the dev-server log names it — verified with a deliberate break, which produced
`[catalog] failed to load games or genres Error: ... at src/pages/catalog.astro:33` plus a full
stack. This matters in production too: on Workers those throws previously left no trace at all.
`npm run dev:clean` was added as the one-command cure.

**The two failure modes are distinguishable — and an earlier draft of this note conflated them.**
Established by experiment (a deliberate throw inside `GameCard`, reverted):

| What you see                                                                | What it means                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page truncates after the filters, **no error panel**, no "Add a game" aside | A React island threw during SSR. The HTML stream aborts at the first island; `catalog.astro`'s try/catch does **not** wrap the island renders, so no panel is produced. This is the React-copy/module-graph failure. |
| "Could not load the catalog" **panel**, rest of the page intact             | `listCatalogGames` / `listGenres` threw — a real query failure, or a service module that failed to resolve. Now logged with its cause.                                                                               |

So the error panel is _not_ the tell for a corrupted SSR graph; a truncated page is. That
distinction is what the first ten minutes of the 2026-08-01 debugging session cost, and it is
why the log line was added.

**Investigation of the intermittent panel, 2026-08-01.** Two hypotheses were tested, to find
where a fix would belong.

_Auth / refresh-token rotation — DISCONFIRMED._ `supabase/config.toml` has
`enable_refresh_token_rotation = true` with `refresh_token_reuse_interval = 10`, and
`createClient` has a read/write asymmetry that looked dangerous: `getAll()` reads the frozen
`Cookie` request header while `setAll()` writes to `Astro.cookies` (the response). Two clients
are built per protected page — one in `middleware.ts`, one in the page — so a token refreshed by
the middleware is invisible to the page's client. `auth.refresh_tokens` also showed two
divergent lineages and a rotation 94s before the observed failure, which fit the story.

It does not hold. Driven end to end: a real session was minted for the QA user via the admin
magiclink endpoint, its refresh token rotated, the session marked expired in the cookie, and
`/catalog` requested with it. **The page rendered correctly** — GoTrue keeps the rotated token
usable, so the "Invalid Refresh Token: Already Used" path is not reachable in this
configuration. The asymmetry in `createClient` is real but benign here; do not "fix" it on the
strength of this bug.

_Dev-server module resolution — remains the only explanation that fits._ The production build
served `/catalog` 12/12 clean under the same session. And the decisive clue is co-occurrence:
the original failure showed the panel **and** a client-side
`Failed to fetch dynamically imported module` for `GameForm` in the same request. No Supabase or
auth fault can produce that second symptom; a dev server that cannot serve modules produces
both at once — the client fetch fails, and the page's server-side import of
`@/lib/services/games` throws inside the try.

**Conclusion: there is nothing to fix in application code.** This is a dev-pipeline failure with
no production analogue — Workers serves a bundle, with no on-demand module resolution. The two
mitigations are the ones already landed: `npm run dev:clean`, and the log line, which will name
the failing module exactly the next time it happens. This was not reproduced on demand, so it is
inference from elimination plus co-occurrence, not proof.

**Did not reproduce 2026-08-02.** The third pass was set up specifically to catch it: the dev
server was restarted but `node_modules/.vite` was deliberately left intact, since clearing it
would have removed the only thing that can trigger the failure. Console capture was armed and
`/catalog` loaded fresh. Six messages, all benign (`[vite] connecting/connected` ×2, the React
DevTools notice ×2) — no `Failed to fetch dynamically imported module`, no `Invalid hook call`,
no truncated page, across every catalog load in the run. Consistent with the conclusion above
(a cache that has not yet drifted), and it does not weaken it; it just means the intermittent
window was not open. The tells to look for remain the two rows of the table above.

### 7. Landing page ignores auth state — FIXED 2026-08-01

`/` used to render the "Sign in" / "Create an account" hero even for a signed-in member, while
the header above it correctly showed member nav and the account email. `Welcome.astro` now reads
`Astro.locals.user` and swaps the CTA pair for a single "Go to your catalog" when a session is
present; the descriptive copy is unchanged, because it describes the product rather than the
funnel.

Chosen over redirecting `/` to `/dashboard` in middleware, which would have been two lines but
would make the landing page unreachable for anyone signed in — including for judging the themes,
which is what put this on the list. Verified both ways: signed in renders only the catalog CTA,
signed out still renders both `/auth/signin` and `/auth/signup`.

### 8. Manual testing step 8 asks for a state the schema forbids — NOT APPLICABLE 2026-08-02

Step 8 reads "Add a game with no play time and no player count; confirm the badges degrade
rather than break". Driven through the real "Add a game" panel with those three fields left
empty, the form refuses the submission and renders inline validation:

```
Min players       -> "Minimum players must be a whole number of at least 1"
Max players       -> "Maximum players must be a whole number of at least 1"
Average play time -> "Average play time must be greater than 0"
```

The database refuses it underneath, which is what makes this structural rather than a form
quirk — `supabase/migrations/20260710120000_create_games.sql:18-20`:

```sql
min_players      int not null check (min_players >= 1),
max_players      int not null check (max_players >= min_players),
avg_play_minutes int not null check (avg_play_minutes > 0),
```

All three are `not null` with CHECK constraints, so the state is unreachable through the UI,
the API, or direct SQL. Nothing to verify in a browser and nothing to fix.

The degradation the step was reaching for is real, though — `gameMeta` is defensive about
inputs it can never receive from this table today, which is correct for a function that may
later be fed an import or a nullable column. That is verified at the only level where the
inputs can occur, and it passes:

```
$ npx vitest run src/lib/services/gameMeta.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)

  playerPips "falls back to unknown for missing values"
  playerPips "treats zero and negative counts as unusable"
  playerPips "infers the missing end of a half-filled range"
  playerPips "degrades a reversed range instead of drawing an empty row"
  playerPips "ignores non-numeric input"
  duration   "returns the unknown state for missing, zero, and invalid play time"
```

Step 8 in "Manual testing steps" is struck through accordingly. If nullable player counts or
play time ever arrive (a BGG import is the obvious route), this becomes reachable and the step
should come back.

### 9. Punchboard heading gradient clears AA by 0.03 — no defect, thin margin

Found by the runtime contrast audit in the third pass, as a false positive worth chasing. The
page headings use a `bg-clip-text` gradient, so their computed `color` is `transparent`:

```
h1 class = "from-primary to-secondary mb-8 bg-gradient-to-r bg-clip-text text-3xl
            font-bold text-transparent"
background-image = linear-gradient(to right in oklab,
                     rgb(217, 131, 36) 0%, rgb(46, 110, 107) 100%)
```

Measuring the stops instead of the transparent `color`, against the Punchboard surface
`rgb(23, 23, 26)`, at 30px/700 (so the 3:1 large-text threshold applies):

| stop                        | ratio     | needs | result |
| --------------------------- | --------- | ----- | ------ |
| `rgb(217,131,36)` (primary) | 6.15:1    | 3:1   | pass   |
| `rgb(46,110,107)` (secondary) | **3.03:1** | 3:1   | pass, by 0.03 |

Both ends pass, so **nothing is broken and no row is affected**. Recording it because the
margin is thin enough that any future darkening of `--secondary`, or lightening of the
Punchboard surface, silently pushes a heading under AA — and per §4 neither the static guard
nor the runtime audit would report it. If the palette moves again, re-measure this pair by
hand, or teach `check-contrast.mjs` about the gradient-heading pairing specifically.

### 10. `invalid_response` used to leave no trace — logging added 2026-08-02

The first live call after the quota reset failed with "We couldn't read the recommendation
response." and wrote **nothing** to the dev-server log, so there was no way to tell which of
three different provider faults had fired. Reproducing the same request outside the app with
an equivalent payload returned a clean, schema-valid response in 2737ms, and the next in-app
attempt succeeded — so the failure was a one-off model flake, not a defect in this change.

The silence was the real problem, and it is the same class as §6: `recommendations.ts` now
`console.error`s at each of the three `invalid_response` branches (non-string content,
unparseable JSON, schema mismatch), naming the branch and including the first 500 characters
of what came back. Same `eslint-disable-next-line no-console` convention as
`catalog.astro`/`stats.astro`. On Workers these failures previously left no trace in
production either.

Not turned into a retry: one flake in four live calls does not justify spending a second
request per failure against a 50/day quota, and the degradation path is already correct.
If the flake rate turns out to be higher in real use, the log now says what to fix.
