// A03 SP1 — a citation's owner is decided by the arrow, not by position. Mutated.
//
// **The subject is a parser whose defect was a false pass eight times out of
// eight.** `GROUP` took every paren group that did not *open* with `→` and read
// every `I\d+` inside it as local, so a mixed group's cross-reference resolved
// against the citing spec. It was silent wherever the citing spec happened to
// declare the same number — which was all eight — and it refused a correct
// citation the first time one did not.
//
// **So every mutation here has to be checked in both directions.** A row that
// only catches the dangling case leaves the false pass exactly where it was, and
// the false pass is the half that shipped.
// **Every `expect` here names a TEST, not a message fragment, and SP3 is why.**
// The first draft matched on the fabricated id the fixtures use — in a file SP3
// resolves invariant references in — so the rule under repair reported this run's
// own configuration as a dangling citation. Correct, and the remedy is to assert
// on the row that must fail rather than on the words it fails with, which is the
// stronger assertion anyway: a message can be reworded and a row cannot.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/enforce-commitments.test.ts";
const SRC = "tools/enforce/commitments.mjs";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = await runPass({
  read,
  write,
  run,
  control: {
    file: SRC,
    // The message a fabricated dangling local citation asserts on. Changing the
    // verb makes a row that reads the message fail, which is what says this run
    // can see a kill at all.
    from: "`commitment ${String(c.n)} cites ${ref}, which ${id} does not ` +",
    to: "`commitment ${String(c.n)} names ${ref}, which ${id} does not ` +",
    why: "the local-dangling row asserts on `cites`, so a run where renaming the verb survives cannot see a kill",
  },
  mutations: [
    {
      // **The state that shipped.** A group opening with the arrow is skipped by
      // the harvester; one holding it in the middle is not.
      name: "GROUP skips only groups that OPEN with an arrow — the shipped regex",
      file: SRC,
      from: "const GROUP = /\\(([^()]*)\\)/g;",
      to: "const GROUP = /\\((?!→)([^()]*)\\)/g;",
      expect: "an arrow in the MIDDLE of a group",
    },
    {
      // **The false pass on its own.** The arrow is seen and the token is still
      // filed as local, so a foreign id resolves against the citing spec — which
      // is silent whenever the numbers collide.
      name: "an arrow sets no spec, so every token is local",
      file: SRC,
      from: "      if (t[1] !== undefined) { spec = t[1]; if (!arrows.has(spec)) arrows.set(spec, false); continue; }",
      to: "      if (t[1] !== undefined) { continue; }",
      expect: "the FALSE PASS",
    },
    {
      // A second spec in one group stops re-targeting, so `(→ C09 I5, C10 I31)`
      // asks C09 for C10's invariant. **Reports a real token against the wrong
      // document**, which is the defect wearing its most plausible face.
      name: "a bare spec after the arrow does not re-target",
      file: SRC,
      from: "      if (t[2] !== undefined) { if (spec !== null) { spec = t[2]; if (!arrows.has(spec)) arrows.set(spec, false); } continue; }",
      to: "      if (t[2] !== undefined) { continue; }",
      expect: "re-targets what follows it",
    },
    {
      // The over-reach in the other direction: a bare spec re-targets before any
      // arrow, so `(C09 I1)` stops being local. **The stated blind spot's row is
      // what catches this**, which is why the blind spot is a test rather than a
      // sentence.
      name: "a bare spec re-targets even before an arrow",
      file: SRC,
      from: "      if (t[2] !== undefined) { if (spec !== null) { spec = t[2]; if (!arrows.has(spec)) arrows.set(spec, false); } continue; }",
      to: "      if (t[2] !== undefined) { spec = t[2]; if (!arrows.has(spec)) arrows.set(spec, false); continue; }",
      expect: "the stated blind spot",
    },
    {
      // **The repair's own regression.** Dropping the section-only entry turns
      // `(→ A02 §1)` into *cites nothing* — eight commitments across C01 and C05.
      name: "an arrow naming only a section contributes no citation",
      file: SRC,
      from: "      if (!attached) cross.push({ spec: named, target: null });",
      to: "      void attached; void named;",
      expect: "still a citation",
    },
    {
      // The cross arm reading a token off the start of a longer target, which is
      // how `(→ C04 I67, I68)` dropped I68. With one token per entry the old
      // form silently matches everything, so the mutation is the *guard* going.
      name: "the cross arm resolves a null target as an invariant",
      file: SRC,
      from: "        if (ref.target !== null && !invariants(target).has(ref.target)) {",
      to: "        if (!invariants(target).has(ref.target)) {",
      expect: "the real corpus is clean",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
