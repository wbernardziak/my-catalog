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

**Contract**: A plain form posting to `/api/theme` with the target theme and the current path as `next` — one submit button per theme, no JavaScript, matching the JS-free PRG toggles in `GameCard`. The active theme is marked with `aria-current`. Mounted in `AppHeader` so it is present on all seven pages.

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
8. Add a game with no play time and no player count; confirm the badges degrade rather than break

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

### Phase 1: Shared chrome and starter removal

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Build passes: `npm run build`
- [x] 1.3 Tests pass: `npm test`
- [x] 1.4 Default title no longer names the starter in `Layout.astro`
- [x] 1.5 `LibBadge` and `template.png` removed with no dangling references

#### Manual

- [ ] 1.6 All seven pages render the shared header with working navigation
- [ ] 1.7 Signed-out pages show sign-in/sign-up rather than member nav
- [ ] 1.8 Header holds at mobile width

### Phase 2: Token layer, Felt Table + Bright Shelf, mark, and landing

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`
- [ ] 2.3 Tests pass: `npm test`
- [ ] 2.4 No starter strings remain in `src/` or `public/`
- [ ] 2.5 The `.dark` token block is gone from `global.css`

#### Manual

- [ ] 2.6 Landing page renders in Felt Table and describes MyCatalog
- [ ] 2.7 Hardcoding the theme to `"shelf"` renders landing and header correctly in Bright Shelf
- [ ] 2.8 `button.tsx`-derived controls correct under Felt (with `dark`) and Shelf (without)
- [ ] 2.9 Every `:root` token role has a counterpart in `.theme-shelf`

### Phase 3: Conversion sweep and the colour-literal guard

#### Automated

- [ ] 3.1 Guard passes: `npm run lint:colors` reports zero literals
- [ ] 3.2 Guard fires on a Tailwind literal (deliberate-break check)
- [ ] 3.3 Guard fires on a non-Tailwind literal (deliberate-break check)
- [ ] 3.4 Guard step present in `.github/workflows/ci.yml`
- [ ] 3.5 Lint passes: `npm run lint`
- [ ] 3.6 Build passes: `npm run build`
- [ ] 3.7 Tests pass: `npm test`

#### Manual

- [ ] 3.8 Chunk A (`auth/`) verified under both themes
- [ ] 3.9 Chunk B (`catalog/`) verified under both themes
- [ ] 3.10 Chunk C (`play/`) verified under both themes
- [ ] 3.11 Chunk D (pages and chrome) verified under both themes
- [ ] 3.12 Felt Table renders correctly across all seven pages
- [ ] 3.13 Bright Shelf renders correctly across all seven pages
- [ ] 3.14 Text legible, focus rings visible, semantic states distinguishable in both themes
- [ ] 3.15 Layout unchanged from phase 1 at desktop and mobile widths

### Phase 4: Cookie persistence and the theme switcher

#### Automated

- [ ] 4.1 Theme module unit tests pass, including `safeNext` rejection cases
- [ ] 4.2 Theme endpoint tests pass (valid sets cookie and redirects; invalid does not set)
- [ ] 4.3 Guard still passes: `npm run lint:colors`
- [ ] 4.4 Lint, build, tests pass

#### Manual

- [ ] 4.5 Switching changes the theme and returns to the same page
- [ ] 4.6 Choice survives reload, navigation, and sign-out → sign-in
- [ ] 4.7 No flash of the wrong theme on hard refresh
- [ ] 4.8 Switching works while signed out
- [ ] 4.9 Corrupted cookie falls back to Felt Table
- [ ] 4.10 Switcher usable at mobile width

### Phase 5: Punchboard and the badge system

#### Automated

- [ ] 5.1 `gameMeta` unit tests pass, including missing/zero/out-of-range values
- [ ] 5.2 Guard passes: `npm run lint:colors`
- [ ] 5.3 Lint, build, tests pass

#### Manual

- [ ] 5.4 All three themes render correctly across all seven pages at desktop and mobile widths
- [ ] 5.5 Punchboard corners and shadows consistent across every component
- [ ] 5.6 Pips, duration, and played meeples legible in all three themes
- [ ] 5.7 Genre, played, and loan state distinguishable without colour alone
- [ ] 5.8 Recommendation flow and stats page carry the same badge language as the catalog
