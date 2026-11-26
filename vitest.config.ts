import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/{golden,security,unit,property,api}/**/*.test.ts"],
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      reporter: ["text-summary", "lcov"],
      // Floor, not a target: measured 26 Nov 2026. Raise only after new meaningful tests.
      thresholds: { lines: 85, statements: 85, functions: 90, branches: 78 },
    },
  },
});
