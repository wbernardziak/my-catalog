// Test-only stub for the virtual `astro:env/server` module.
// Vitest aliases `astro:env/server` to this file (see vitest.config.ts) so tests
// resolve without Astro's Cloudflare-laden Vite pipeline. Values come from
// process.env; individual tests override per-case with `vi.mock("astro:env/server", …)`.
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;
