# Board-game visual identity with theme selection — Plan Brief

> Full plan: `context/changes/visual-identity-themes/plan.md`
> Roadmap slice: `context/foundation/roadmap.md` § S-07

## What and why

MyCatalog still wears the 10x Astro Starter's identity — a deep-space gradient, purple-on-blue headings, a star field, and a favicon that was never ours. This change replaces it with a board-game identity shipped as three selectable themes: **Felt Table** (default), **Bright Shelf**, and **Punchboard**, with the choice persisted per member.

## Starting point

Seven pages, all grounded in `bg-cosmic`. **233 colour literals across 21 files** — but only ~15 distinct semantic roles, because the same handful of classes repeat (`text-white` ×36, `border-white/10` ×22, `text-purple-300` ×18). The shadcn token block in `global.css` is a complete theming layer that is entirely grayscale and unused. There is no shared header: `Topbar.astro` is imported only by the landing page, while catalog, play, stats, and dashboard each hand-roll their own. No test references a class name.

## Desired end state

A member opens the app to Felt Table, switches theme from a control in the shared header, and the choice survives reload, navigation, and sign-out — with the right theme present in the server's first response, so nothing ever flashes. No file in `src/` names a colour; CI fails if one is re-added.

## Key decisions made

| Decision           | Choice                                               | Why (1 sentence)                                                                                          | Source  |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| Themes and default | Three themes, Felt Table default                     | Agreed from the identity pitch; Felt is closest to the current dark UI so it carries the smallest diff    | Roadmap |
| Theme mechanism    | Theme class on `<html>` + co-applied `.dark`         | The dark variant is already class-based, so shadcn's `dark:` variants keep working untouched              | Plan    |
| Persistence        | Cookie read in middleware                            | No migration, correct on first paint, and works signed-out                                                | Plan    |
| Switcher placement | Extract a shared `AppHeader` first, mount it there   | There is no shared chrome today; extracting it fixes four divergent headers and gives the switcher a home | Plan    |
| Token vocabulary   | Extend the existing shadcn token set                 | Reuses the block already in `global.css` and keeps `button.tsx` and future shadcn components working      | Plan    |
| Phasing            | Define Felt **and** Shelf together, before switching | Forces the vocabulary to survive a light theme while it is still cheap to change                          | Plan    |
| Badge system       | In scope, final phase                                | A recoloured card is still a generic card; shape is what makes it read board-game                         | Plan    |
| Drift prevention   | Colour-literal CI guard + manual pass                | Without a ratchet the next feature re-adds `bg-purple-600` and theme three quietly breaks                 | Plan    |
| Landing page       | Rewrite as a real landing page                       | The first screen currently advertises someone else's product                                              | Plan    |

## Scope

**In scope:** shared `AppHeader` extraction; landing-page rewrite; starter asset removal; token layer extension; conversion of all 233 literals; three theme blocks; SVG mark + favicon; cookie persistence and `POST /api/theme`; switcher UI; colour-literal guard in CI; shape-based badge system (pips, duration, played meeples).

**Out of scope:** Playwright / visual-regression tests; per-member DB persistence (no migration, no RLS); any product behaviour change; PRD amendment; bulk migration to shadcn components; user-authored themes.

## Architecture / approach

Middleware resolves the theme from a cookie into `context.locals.theme` on every request. `Layout.astro` stamps `rootClass(theme)` on `<html>` — the theme class, plus `dark` for the two dark grounds. All components read tokens only; `global.css` holds one block per theme. The switcher is a JS-free form posting to `/api/theme`, which validates with zod, sets the cookie, and PRGs back to a same-origin path — the same pattern as the existing `played` / `loan` / `preference` toggles.

## Phases at a glance

| Phase                                 | What it delivers                                                       | Key risk                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Shared chrome + starter removal    | `AppHeader` on all seven pages, rewritten landing, starter assets gone | Header extraction changes five pages at once with no colour change to hide behind |
| 2. Tokens + Felt & Shelf + conversion | Token vocabulary, two themes, all 233 sites converted, mark, CI guard  | The vocabulary failing to express a light theme — the one expensive mistake       |
| 3. Persistence + switcher             | Cookie, middleware wiring, `/api/theme`, switcher in the header        | Theme/`dark` class getting out of sync; open redirect on an unauthenticated route |
| 4. Punchboard + badges                | Third theme, pips/duration/meeples across catalog, play, and stats     | Punchboard's radius and shadow overrides missed by individual components          |

**Prerequisites:** none — S-01…S-06 are all done and archived; no external access or secrets needed.
**Estimated effort:** ~4 sessions, one per phase; phase 2 is the largest by a wide margin.

## Open risks and assumptions

- Phase 2 is a 21-file sweep with no automated visual coverage — the manual pass is the only thing standing between it and a regression.
- The token roles are inferred from current usage; a component may turn out to need a role nobody anticipated, which means adding it to all three theme blocks rather than special-casing.
- Punchboard's condensed display face falls back to a system stack; if it looks weak, self-hosting a webfont is a follow-up, not part of this change.
- The theme cookie deliberately survives sign-out, so a shared device keeps the last member's theme.

## Success criteria (summary)

- A member can switch between three board-game themes from any page, and the choice sticks across reloads, navigation, and sessions.
- No page ever renders in the wrong theme, even briefly, on any route including signed-out ones.
- `npm run lint:colors` passes, and re-adding a colour literal fails CI.
