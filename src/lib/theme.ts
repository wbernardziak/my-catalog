/**
 * Theme identity and the root-element class mapping.
 *
 * Phase 4 extends this module with cookie parsing and redirect validation; the
 * mapping below is deliberately settled first, because `Layout.astro` stamps it
 * on `<html>` from phase 2 onward and the rendering every later phase verifies
 * depends on it.
 */

export const THEMES = ["felt", "shelf", "punchboard"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * Themes whose ground is dark. These co-apply `dark` so the `dark:` variants in
 * `ui/button.tsx` resolve; light themes must never carry it, or shadcn controls
 * render light-on-light. This list is the single owner of that decision.
 */
const DARK_GROUNDS: readonly Theme[] = ["felt", "punchboard"];

/** The `class` attribute for `<html>`: the theme class, plus `dark` when the ground is dark. */
export function rootClass(theme: Theme): string {
  return DARK_GROUNDS.includes(theme) ? `theme-${theme} dark` : `theme-${theme}`;
}
