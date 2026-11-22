import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Rendering and entry code is excluded on purpose; see docs/coding-standards.md.
      exclude: ["src/**/*.test.ts", "src/main.ts"],
      reporter: ["text", "cobertura"],
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
  },
});
