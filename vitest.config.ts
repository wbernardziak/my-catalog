import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Plain Vitest config (not astro/config's getViteConfig): the Astro Cloudflare
// adapter's Vite plugin rejects a Vitest config at startup. We instead resolve
// the two things tests need directly — the `@/*` path alias and the virtual
// `astro:env/server` module (aliased to a test stub reading process.env).
//
// Two projects, because they answer different questions at different costs:
//   `unit` — hermetic, no network, no Docker. The edit-loop default (`npm test`).
//   `db`   — drives a real local Supabase stack (`npm run test:db`). The only
//            place in this repo where a claim about RLS or row visibility is
//            legitimate; see src/test/db/README.md.
// `extends: true` is load-bearing: without it the projects do not inherit the
// `resolve.alias` block below and every `@/…` import fails to resolve.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          exclude: [...configDefaults.exclude, "src/test/db/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["src/test/db/**/*.test.ts"],
          // A cold GoTrue plus two bcrypt-backed sign-ups in beforeAll runs well
          // past Vitest's 10s default on a freshly started stack.
          hookTimeout: 30_000,
          testTimeout: 20_000,
          // A real stack is slower than the unit suite and the members are
          // created per file; keep files serial so runs stay legible.
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: {
    alias: {
      "astro:env/server": fileURLToPath(new URL("./src/test/astro-env-server.stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
