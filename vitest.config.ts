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
    /**
     * **Six rows do whole-tree work and vitest's default is 5000ms** (F262).
     *
     * The comment above is about flakiness and this class walked past it,
     * because the clock these rows race is not one anybody injected. Each
     * parses or shells over all of `src/` — the module graph, the commitment
     * scan, the anchor sweep, the catalogue parser — and each is **1.5 to 2
     * seconds in isolation and past 5 under a full parallel run**. Measured:
     * MA4 at 1539ms alone and 5033–7345ms in the suite; T6.5/T6.6 at 1723ms
     * alone and 5114–5489ms in the suite.
     *
     * **Three consecutive runs gave three different failing sets** — five rows,
     * then three, then two — and every one passed on its own. A changed set is
     * the signature of contention; an identical one would have been evidence.
     *
     * **Why a ceiling rather than six `{ timeout: … }` arguments**: the rule is
     * *a row that reads the whole tree needs room*, and a per-row list stops
     * seeing the seventh. The number is the asymmetry, not the odds — a green
     * run costs nothing extra, and a gate whose verdict is a function of
     * machine load costs a session diagnosing a code change that never
     * happened. It did: three red runs against a sweep that moved zero frames.
     *
     * **A hang still fails, six seconds later.** What this removes is a default
     * nobody chose deciding whether `make all` means anything.
     */
    testTimeout: 30_000,
  },
});
