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

export const THEME_COOKIE = "mycatalog-theme";

export const DEFAULT_THEME: Theme = "felt";

/** Narrows an unknown cookie value. Anything unrecognised falls back to the default. */
export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The theme for a request: the cookie value when valid, the default otherwise. */
export function themeFromCookie(value: string | undefined): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * Constrains the post-switch redirect to this origin.
 *
 * `/api/theme` is deliberately unauthenticated so signed-out visitors can switch,
 * which makes an unchecked `next` an open redirect. Only a single leading slash
 * is accepted: `//evil.com` is protocol-relative and `https://evil.com` is
 * absolute, so both are rejected in favour of the fallback.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}
