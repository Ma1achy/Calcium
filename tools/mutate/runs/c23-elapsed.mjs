// C23 I52 — the elapsed counter, its guard, its gate and its target.
//
// **Four rules, and each one is here because the walk found it rather than
// because the code has four branches.** §8a-bis's trace produced B3 and B7, its
// table produced the `renderLoading` row, and F234 produced the guard's real
// argument — which is hygiene and not throughput, so a mutation that only made
// it *slower* would be caught by nothing and is not one of these.
//
// **The visibility gate is the one to watch.** Removing it leaves every row in
// the contract file green except the one written for it: the counter still
// advances, the figure is still right, and the only difference is that a box
// nobody is looking at writes a whole frame a second instead of nothing. That is
// invisible to any assertion about what the box says.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const REFRESH = "src/shell/refresh.ts";
const EXEC = "src/shell/execution.ts";

const FILES = "test/contract/refresh.test.ts test/unit/execution.test.ts test/contract/builders.test.ts";

// **Atomic, through the shared pair** (F237). The restore is a whole-file write
// and a `SIGKILL` mid-write leaves a prefix — measured at five source files
// truncated, one of them 1297 lines against 2218, when stale runs sitting
// mid-pass were killed. Write-to-temp then `rename` leaves either file, never
// half of one. 91 of the 92 runs still roll their own pair; that sweep is its
// own commit.
const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
    });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: REFRESH,
    from: "const ELAPSED_TICK_MS = 1000;",
    to: "const ELAPSED_TICK_MS = 1_000_000;",
    why: "the sweep never wakes inside a row's horizon, so every counter row goes at once",
  },
  mutations: [
    {
      // **The guard removed, and `rev` is what sees it.** The figure is
      // identical either way — this writes the same string three times a second
      // instead of once — so nothing about what the box *says* can fail.
      name: "the counter writes whether or not the figure moved",
      file: REFRESH,
      from: "  return elapsed(ms) !== elapsed((shown as Status).elapsedMs ?? 0);",
      to: "  return true;",
      expect: "T3.57",
    },
    {
      // The guard reading the clock rather than the figure, which is the
      // plausible version of the same defect: it looks like a comparison and it
      // is true on every tick below one second.
      name: "the guard compares the clock instead of the rendered figure",
      file: REFRESH,
      from: "  return elapsed(ms) !== elapsed((shown as Status).elapsedMs ?? 0);",
      to: "  return ms !== ((shown as Status).elapsedMs ?? 0);",
      expect: "T3.57",
    },
    {
      // **§8a-bis B7.** Off screen the spinner has already stopped, so each of
      // these writes is a whole frame rather than the 0.4 that made the counter
      // free — and the box still says the right thing the entire time.
      name: "the counter writes into a box nobody is looking at",
      file: REFRESH,
      from: "        if (!deps.visible(part.host)) continue;\n        // **The block currently in place, never one remembered at declaration**",
      to: "        // **The block currently in place, never one remembered at declaration**",
      expect: "T3.59",
    },
    {
      // C24 §5. *Behaviour is fixed, rendering is overridable*, and the block is
      // the consumer's — so the framework's timer writing a field into it is the
      // guarantee reaching past its own boundary.
      name: "a declarer's own loading block is written into",
      file: REFRESH,
      from: "        if (part.spec.renderLoading !== null) continue;",
      to: "",
      expect: "T3.58",
    },
    {
      // **The arming half, and it fails in the other direction from the guard.**
      // The sweep's own loop skips a source that is `inFlight` — which is
      // exactly what a loading box is — so without this nothing ever wakes to
      // tick, and a part with a slow first fetch and no siblings sits with no
      // figure for the whole wait.
      name: "a part waiting on its first fetch does not wake the sweep",
      file: REFRESH,
      from: "    if (waiting) soonest = Math.min(soonest, now + ELAPSED_TICK_MS);",
      to: "",
      expect: "T3.56",
    },
    {
      // C23 I51, and the classification table's C1. `retryIn` is `null` for
      // every one-shot, and a `retrying` box with no countdown draws no activity
      // line at all — a blank row where the spinner goes.
      name: "a failure with no retry coming is still drawn as `retrying`",
      file: EXEC,
      from: "          retryInMs === null",
      to: "          false",
      expect: "T1.40b",
    },
    {
      // The attempt count, which had no writer anywhere in `src/` before this.
      name: "the attempt count never reaches the box",
      file: REFRESH,
      from: "            if (put(part.host, part, part.spec.renderError(shown, retryIn, src.failures))) any = true;",
      to: "            if (put(part.host, part, part.spec.renderError(shown, retryIn, 0))) any = true;",
      expect: "T1.40",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
