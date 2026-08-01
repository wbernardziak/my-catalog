#!/usr/bin/env node
/**
 * Fails when a theme's ink is unreadable on a surface it can land on.
 *
 * The sibling of `check-color-literals.mjs`. That guard keeps components reading
 * token roles; this one keeps the roles themselves legible. Together they cover
 * the failure that shipped in the visual-identity work: every component was
 * correctly using `text-foreground` on `bg-card`, and the result was still
 * invisible, because Punchboard's card is chipboard tan while its `--foreground`
 * is the light ink meant for a press-black ground — 1.24:1.
 *
 * A theme has two surface families, and until Punchboard they were the same
 * lightness in every theme, so nothing caught the difference:
 *   - the ground (`--background`, `--surface-subtle`)
 *   - the card   (`--card`, `--popover`)
 *
 * The matrix below asserts every ink role against every surface it can appear on.
 * The card column is resolved through the `.bg-card` rule in `global.css` rather
 * than hardcoded here, so adding a role to that rule extends this check for free.
 *
 * Thresholds are WCAG 2.1 AA: 4.5:1 for body text, 3:1 for a non-text indicator
 * (the focus ring). Fill/ink pairs are checked as their own closed system, since
 * a filled button or a tinted badge carries its own background onto any surface.
 *
 * Deliberately NOT checked: `--border`. Hairlines are decorative here, sit well
 * under 3:1 by design in every theme, and asserting them would only teach people
 * to switch the guard off.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS_PATH = fileURLToPath(new URL("../src/styles/global.css", import.meta.url));

/** The theme blocks, by the selector that carries them. */
const THEMES = [
  { name: "Felt Table", selector: ":root" },
  { name: "Bright Shelf", selector: ".theme-shelf" },
  { name: "Punchboard", selector: ".theme-punchboard" },
];

/** The rule that re-points ink roles onto the card surface. */
const CARD_CONTEXT_SELECTOR = ".bg-card,\n.bg-popover";

/**
 * Surfaces an ink role can land on. `context` names the rule whose re-pointing
 * applies there; the ground has none, so roles resolve to their theme value.
 */
const SURFACES = [
  { name: "ground", background: "--background", contextual: false },
  { name: "subtle", background: "--surface-subtle", contextual: false },
  { name: "card", background: "--card", contextual: true },
];

/** Ink drawn directly on a surface. */
const INK_ROLES = [
  { role: "--foreground", min: 4.5, what: "body text" },
  { role: "--ink-muted", min: 4.5, what: "muted text" },
  { role: "--accent-ink", min: 4.5, what: "accent text and marks" },
  { role: "--danger-ink", min: 4.5, what: "bare destructive text" },
  { role: "--success-mark", min: 3.0, what: "played meeple" },
  { role: "--ring", min: 3.0, what: "focus ring" },
];

/**
 * Fill/ink pairs. These carry their own background, so they are checked against
 * each other rather than against a surface.
 */
const PAIRS = [
  ["--primary", "--primary-foreground"],
  ["--secondary", "--secondary-foreground"],
  ["--accent", "--accent-foreground"],
  ["--destructive", "--destructive-foreground"],
  ["--success", "--success-foreground"],
  ["--warning", "--warning-foreground"],
  ["--destructive-tint", "--destructive-ink"],
  ["--success-tint", "--success-ink"],
  ["--warning-tint", "--warning-ink"],
];

/** The body of the rule for `selector`, matched by brace depth. */
function blockFor(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return null;
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return null;
}

/** `--name: #rrggbb` declarations in a block. Aliases (`var(...)`) are skipped. */
function literalsIn(block) {
  const out = new Map();
  for (const [, name, value] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out.set(name, value);
  }
  return out;
}

/** `--name: var(--other)` declarations — the card rule's re-pointing map. */
function aliasesIn(block) {
  const out = new Map();
  for (const [, name, target] of block.matchAll(/(--[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)\s*;/g)) {
    out.set(name, target);
  }
  return out;
}

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const luminance = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

function contrast(aHex, bHex) {
  const a = luminance(toRgb(aHex));
  const b = luminance(toRgb(bHex));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const css = readFileSync(CSS_PATH, "utf8");

const cardBlock = blockFor(css, CARD_CONTEXT_SELECTOR);
if (!cardBlock) {
  console.error(`Could not find the card surface rule (\`${CARD_CONTEXT_SELECTOR}\`) in global.css.`);
  console.error("If it was renamed, update CARD_CONTEXT_SELECTOR — do not delete this check.");
  process.exit(1);
}
const cardContext = aliasesIn(cardBlock);

const failures = [];
let checks = 0;

for (const theme of THEMES) {
  const block = blockFor(css, theme.selector);
  if (!block) {
    failures.push(`${theme.name}: no \`${theme.selector}\` block found in global.css`);
    continue;
  }
  const token = literalsIn(block);

  /** Resolve a role on a surface, following the card rule where it applies. */
  const resolve = (role, contextual) => {
    const target = contextual && cardContext.has(role) ? cardContext.get(role) : role;
    return { name: target, value: token.get(target) };
  };

  for (const surface of SURFACES) {
    const bg = token.get(surface.background);
    if (!bg) {
      failures.push(`${theme.name}: missing ${surface.background}`);
      continue;
    }

    for (const { role, min, what } of INK_ROLES) {
      const { name, value } = resolve(role, surface.contextual);
      if (!value) {
        failures.push(`${theme.name}: missing ${name} (needed for ${role} on ${surface.name})`);
        continue;
      }
      checks++;
      const ratio = contrast(value, bg);
      if (ratio < min) {
        const via = name === role ? role : `${role} → ${name}`;
        failures.push(
          `${theme.name} · ${surface.name}: ${via} ${value} on ${surface.background} ${bg} ` +
            `= ${ratio.toFixed(2)}:1, needs ${min} (${what})`,
        );
      }
    }
  }

  for (const [fill, ink] of PAIRS) {
    const fillValue = token.get(fill);
    const inkValue = token.get(ink);
    if (!fillValue || !inkValue) {
      failures.push(`${theme.name}: missing ${!fillValue ? fill : ink}`);
      continue;
    }
    checks++;
    const ratio = contrast(inkValue, fillValue);
    if (ratio < 4.5) {
      failures.push(
        `${theme.name} · pair: ${ink} ${inkValue} on ${fill} ${fillValue} = ${ratio.toFixed(2)}:1, needs 4.5`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`Contrast check failed — ${failures.length} of ${checks} assertions:\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("\nFix the token value in src/styles/global.css. If an ink role is unreadable on a");
  console.error("surface it genuinely lands on, that surface needs its own variant of the role —");
  console.error("see the card context rule for the pattern.");
  process.exit(1);
}

console.log(`Contrast OK: ${checks} assertions across ${THEMES.length} themes.`);
