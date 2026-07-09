import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Plain Vitest config (not astro/config's getViteConfig): the Astro Cloudflare
// adapter's Vite plugin rejects a Vitest config at startup. We instead resolve
// the two things tests need directly — the `@/*` path alias and the virtual
// `astro:env/server` module (aliased to a test stub reading process.env).
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "astro:env/server": fileURLToPath(new URL("./src/test/astro-env-server.stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
