#!/usr/bin/env node
/**
 * Fails when a colour is named directly anywhere in `src/`.
 *
 * The theme layer only works if components read token roles instead of naming
 * colours. Without this ratchet the next feature re-adds `bg-purple-600`, and a
 * theme quietly breaks on a screen nobody re-checked.
 *
 * Three families are scanned, because the app has historically injected colour
 * in all three ways:
 *   1. Tailwind colour utilities  — `bg-purple-600`, `text-white/70`
 *   2. Raw colour literals        — `#1d3b32`, `rgba(...)`, `oklch(...)`
 *   3. Colour props in inline CSS — `style="color: …"`, `<style>` blocks
 *
 * Exempt: the token definitions themselves, and the brand mark, which keeps
 * fixed colours across themes by design. Palette families are read from
 * Tailwind's theme.css at runtime so an upgrade cannot silently open a hole.
 * The v4 roots inset-shadow, text-shadow, drop-shadow, inset-ring and mask
 * gradients are matched through their inner prefixes; self-tests pin that.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = "src";
const EXTENSIONS = [".astro", ".tsx", ".ts", ".jsx", ".js", ".css"];

function rootFromArgs() {
  const [argument] = process.argv.slice(2);
  if (!argument) return DEFAULT_ROOT;
  if (!argument.startsWith("--root=") || !isAbsolute(argument.slice("--root=".length))) {
    console.error("Usage: node scripts/check-color-literals.mjs [--root=<absolute dir>]");
    process.exit(1);
  }
  return argument.slice("--root=".length);
}

const ROOT = rootFromArgs();
const overriddenRoot = ROOT !== DEFAULT_ROOT;
if (overriddenRoot) console.log(`Scanned root: ${ROOT}`);

const EXEMPT = new Set(["src/styles/global.css", "src/components/BrandMark.astro"]);

const require = createRequire(import.meta.url);

function paletteFromTailwind() {
  let themePath;
  try {
    themePath = require.resolve("tailwindcss/theme.css");
    const theme = readFileSync(themePath, "utf8");
    const families = new Set([...theme.matchAll(/--color-([a-z-]+)-\d{2,3}\s*:/g)].map((match) => match[1]));
    if (/--color-white\s*:/.test(theme)) families.add("white");
    if (/--color-black\s*:/.test(theme)) families.add("black");
    if (families.size < 10) throw new Error(`found only ${families.size} colour families`);
    return [...families].join("|");
  } catch (error) {
    console.error(
      `Could not load Tailwind colour families from ${themePath ?? "tailwindcss/theme.css"}: ${error.message}`,
    );
    process.exit(1);
  }
}

const PALETTE = paletteFromTailwind();

const PREFIX =
  "bg|text|border|border-[trblxy]|border-s|border-e|border-bs|border-be|from|via|to|ring|ring-offset|placeholder|divide|outline|fill|stroke|shadow|accent|caret|decoration";

const RULES = [
  {
    name: "tailwind-colour-utility",
    // Optional variant prefixes (hover:, focus:, md:, placeholder:, …) then utility-palette-shade.
    re: new RegExp(`\\b(?:[a-z-]+:)*(?:${PREFIX})-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`, "g"),
  },
  {
    name: "raw-colour-literal",
    re: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\s*\(/g,
  },
  {
    name: "inline-style-colour",
    re: /\b(?:color|background|background-color|border-color|fill|stroke|box-shadow|outline-color)\s*:/g,
  },
];

const srcPath = join(ROOT, SRC);
if (!existsSync(srcPath)) {
  console.error(`No src/ under ${ROOT}. Check the --root argument.`);
  process.exit(1);
}

const files = readdirSync(srcPath, { recursive: true, encoding: "utf8" })
  .map((entry) => `${SRC}/${entry.split("\\").join("/")}`)
  .filter((file) => EXTENSIONS.some((ext) => file.endsWith(ext)))
  .filter((file) => !EXEMPT.has(file));

const hits = [];

if (files.length === 0) {
  console.error(`No source files matched under ${ROOT}; refusing an empty colour scan.`);
  process.exit(1);
}

for (const file of files) {
  const source = readFileSync(join(ROOT, file), "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(line)) !== null) {
        hits.push({ file, line: index + 1, rule: rule.name, text: match[0] });
      }
    }
  });
}

if (hits.length > 0) {
  console.error(`Colour literals found (${hits.length}). Use a token role from src/styles/global.css instead.\n`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.text}  [${hit.rule}]`);
  }
  console.error("\nIf a role is genuinely missing, add it to EVERY theme block rather than naming a colour here.");
  process.exit(1);
}

console.log(`No colour literals in ${files.length} files.`);
