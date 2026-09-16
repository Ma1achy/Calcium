// C14 I30 — `visible()` returns the same frozen range until the viewport
// moves, and every movement drops it at the clamp. Mutated (T6.26, F1198).
//
// **The frame is the same under every mutation but one** — a range recomputed
// is the range memoised — so T1.23 reads identity across two calls and the
// memo's counters. The one the frame can see is the invalidation moved off
// `#setTop`: a content change then serves the range from before it.
//
// **The control never stores the memo.** Every call recomputes, the second
// call is a fresh object, and T1.23's identity assertion fails.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/viewport.test.ts";
const VP = "src/viewport/viewport/viewport.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: VP,
    from: "    this.#visibleMemo = range;\n    return range;",
    to: "    return range;",
    why: "the memo is never stored: every call recomputes and the second call is a fresh object",
  },
  mutations: [
    {
      // **Off the clamp and into the scroll methods**: a content change reaches
      // `#setTop` through `#afterContent`, never through a scroll method, so
      // the range served after an append is the one before it.
      name: "SCROLL-ONLY: the memo is dropped in scrollBy and scrollToBottom, not in #setTop",
      file: VP,
      from: "    this.#visibleMemo = null;\n  }\n\n  #captureAnchor",
      to: "  }\n\n  #captureAnchor",
      also: [
        {
          file: VP,
          from: "    const before = this.#topRow;\n    this.#setTop(this.#topRow + rows);",
          to: "    const before = this.#topRow;\n    this.#setTop(this.#topRow + rows);\n    this.#visibleMemo = null;",
        },
        {
          file: VP,
          from: "    this.#setTop(this.#maxTop());\n    this.#followTail = true;\n    this.#anchor = null;",
          to: "    this.#setTop(this.#maxTop());\n    this.#visibleMemo = null;\n    this.#followTail = true;\n    this.#anchor = null;",
        },
      ],
      expect: "T1.23",
    },
    {
      // **Dropped only when the row changed**: a content change that leaves
      // the top row in place serves stale rows. Following the tail, an append
      // moves the row, so this arm is reached by the resize step — a shorter
      // region at the same top row.
      name: "ON-CHANGE-ONLY: the memo is dropped only when the clamp moved the row",
      file: VP,
      from: "    this.#topRow = Math.min(Math.max(0, row), this.#maxTop());",
      to: "    const was = this.#topRow;\n    this.#topRow = Math.min(Math.max(0, row), this.#maxTop());\n    if (this.#topRow !== was) this.#visibleMemo = null;",
      also: [
        {
          file: VP,
          from: "    this.#visibleMemo = null;\n  }\n\n  #captureAnchor",
          to: "  }\n\n  #captureAnchor",
        },
      ],
      expect: "T1.23",
    },
    {
      // **The counters swapped**: hits counted as misses. The rate row reads
      // the wrong half and the deck would say the memo never hits.
      name: "COUNTERS-SWAPPED: a hit increments misses",
      file: VP,
      from: "      this.#visibleHits += 1;\n      return this.#visibleMemo;",
      to: "      this.#visibleMisses += 1;\n      return this.#visibleMemo;",
      expect: "T1.23",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
