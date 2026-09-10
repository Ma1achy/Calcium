import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Relative to `--dir`, which is what scopes each script to its tier
    // (`--dir test/golden`, `--dir test/e2e`). Anchoring these at `test/`
    // instead makes every `--dir` invocation match nothing.
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // **`out/` is the repository's scratch directory and the suite was reading
    // it** (F1064). It is not in `.gitignore`, vitest 4's default exclude is only
    // `node_modules` and `.git`, and every `npm run` script scopes itself with
    // `--dir` — so the four gates were never affected and every *targeted* run
    // was. That is the whole blast radius, and it is the runs lanes actually make.
    //
    // Measured at HEAD with no worktree present: **19 loose test files in `out/`,
    // 2 of them failing and 1 row red**, so a bare `vitest run` was red on files
    // nobody was asserting anything with. With a verification worktree present it
    // is **384 more**, a second copy of the whole tree.
    //
    // **Both directions are the defect and the passing one is worse.** A stale
    // copy that fails sends a reader diagnosing a defect the tree does not have —
    // it did, twice in one session, once to a lane and once here. A stale copy
    // that passes is counted as coverage for rows that no longer exist.
    //
    // The pattern is anchored at any depth rather than at the root, so it holds
    // under every `--dir` base. Checked before widening: no directory named `out`
    // under `test/` or `src/`, and `examples/docker/out` holds no test file.
    //
    // **The limit, stated because an unrecorded one reads as strength**: an
    // explicit `--dir out` still collects, because the pattern is matched
    // against paths relative to that base and there is no `out/` inside `out/`.
    // That is the deliberate case — someone pointing the runner at the scratch
    // directory — and the accidental one is what this closes. Measured after:
    // a bare run collects **384 files, 360 of them under `test/` and 0 under
    // `out/`**.
    //
    // **These are line comments and not a doc block on purpose** — the glob
    // itself contains the sequence that closes one, so the first draft of this
    // comment terminated inside the pattern it was describing and the config
    // failed to parse.
    exclude: [...configDefaults.exclude, "**/out/**"],
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
