import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX as "preserve" for Next; tests compile it here.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": new URL(".", import.meta.url).pathname },
  },
  test: {
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.tsx"],
    environment: "node",
  },
});
