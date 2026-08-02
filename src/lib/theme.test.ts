import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, rootClass, safeNext, themeFromCookie, THEMES } from "./theme";

/**
 * Guardrails for the two decisions that are cheap to get wrong and expensive to
 * notice: which themes co-apply `dark` (a light theme carrying it renders
 * light-on-light), and what the unauthenticated theme endpoint accepts as a
 * redirect target.
 */

describe("rootClass", () => {
  it("co-applies dark for dark-ground themes", () => {
    expect(rootClass("felt")).toBe("theme-felt dark");
    expect(rootClass("punchboard")).toBe("theme-punchboard dark");
  });

  it("never applies dark to the light theme", () => {
    expect(rootClass("shelf")).toBe("theme-shelf");
    expect(rootClass("shelf")).not.toContain("dark");
  });

  it("emits a theme class for every declared theme", () => {
    for (const theme of THEMES) {
      expect(rootClass(theme)).toContain(`theme-${theme}`);
    }
  });
});

describe("isTheme", () => {
  it("accepts the declared themes", () => {
    expect(isTheme("felt")).toBe(true);
    expect(isTheme("shelf")).toBe(true);
    expect(isTheme("punchboard")).toBe(true);
  });

  it("rejects unknown, empty, and non-string values", () => {
    expect(isTheme("cosmic")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(42)).toBe(false);
    expect(isTheme({ theme: "felt" })).toBe(false);
  });
});

describe("themeFromCookie", () => {
  it("returns the cookie value when it names a theme", () => {
    expect(themeFromCookie("shelf")).toBe("shelf");
  });

  it("falls back to the default when absent or corrupted", () => {
    expect(themeFromCookie(undefined)).toBe(DEFAULT_THEME);
    expect(themeFromCookie("")).toBe(DEFAULT_THEME);
    expect(themeFromCookie("not-a-theme")).toBe(DEFAULT_THEME);
  });
});

describe("safeNext", () => {
  it("keeps a same-origin absolute path, query string included", () => {
    expect(safeNext("/catalog")).toBe("/catalog");
    expect(safeNext("/catalog?genre=Strategy&players=2")).toBe("/catalog?genre=Strategy&players=2");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("//evil.com/catalog")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com/catalog")).toBe("/");
  });

  it("rejects backslash-escaped and relative paths", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("catalog")).toBe("/");
    expect(safeNext("../admin")).toBe("/");
  });

  it("rejects non-string input and honours a custom fallback", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(7)).toBe("/");
    expect(safeNext("//evil.com", "/catalog")).toBe("/catalog");
  });
});
