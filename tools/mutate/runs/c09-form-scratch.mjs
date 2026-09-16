// C09 I76 — the window seam takes the caller's scratch, and the form is held
// in it. Mutated (T6.122, F1191).
//
// **No frame moves under any mutation here.** A form resolved again is the
// same form; a plan rebuilt is the same plan. What T2.145 reads is the
// definition's own call counts and the identity of the block the seam hands
// `window`, which is the whole of what I76 buys.
//
// **The control is the form never held.** The second call resolves the block
// again and T2.145's "measured no further time" reads one more.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/blocks.test.ts test/unit/block-cap.test.ts";
const REG = "src/presentation/blocks/registry.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
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
    file: REG,
    from: "    scratch?.set(resolved.block, formKey(width), form);",
    to: "    void form;",
    why: "the form is never held: the second windowSequence resolves the block again and T2.145 counts one more whole-block measure",
  },
  mutations: [
    {
      // **The width dropped from the key.** A call at another width is served
      // the first width's form — the wrong cap window at the new width.
      name: "KEY-WITHOUT-WIDTH: one form per block whatever the width",
      file: REG,
      from: "const formKey = (width: number): string => `form\\u0000${String(width)}`;",
      to: 'const formKey = (_width: number): string => "form";',
      expect: "T2.145",
    },
    {
      // **A stripped copy handed to `window` each call**, which is the tree
      // before I76: a kind holding its plan by the block never finds it.
      name: "BARE-IS-A-COPY: the seam hands window a fresh copy stripped of capped",
      file: REG,
      from: "      const source = form === null ? block : form.bare;",
      to: "      const source = form === null ? block : stripCapped(form.block);",
      expect: "T2.145",
    },
    {
      // **The scratch kept past the call.** A later call with none reads the
      // last caller's store — the registry holding a reference I76 says it
      // does not; T2.145's scratch-less arm finds fewer measures than it owes.
      // **Both halves**: the reset in `finally` and the assignment at the
      // call's start each clear it alone, so removing one is a no-op — the
      // first run's survivor (F1191), the shape F1189 recorded.
      name: "STICKY-SCRATCH: the call's scratch outlives the call",
      file: REG,
      from: "      this.#memo = null;\n      this.#scratch = undefined;",
      to: "      this.#memo = null;",
      also: [
        {
          file: REG,
          from: "    this.#scratch = scratch;\n    this.#memo = memo ?? new Map();",
          to: "    if (scratch !== undefined) this.#scratch = scratch;\n    this.#memo = memo ?? new Map();",
        },
      ],
      expect: "T2.145",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
