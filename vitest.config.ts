import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Relative to `--dir`, which is what scopes each script to its tier
    // (`--dir test/golden`, `--dir test/e2e`). Anchoring these at `test/`
    // instead makes every `--dir` invocation match nothing.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    environment: "node",
    // Every timing test runs on a fake clock (A03 SS1). Real timers here
    // would make the suite flaky in exactly the components that inject one.
    fakeTimers: { toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] },
  },
});
