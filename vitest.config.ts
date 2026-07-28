import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node",
    // Every timing test runs on a fake clock (A03 SS1). Real timers here
    // would make the suite flaky in exactly the components that inject one.
    fakeTimers: { toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] },
  },
});
