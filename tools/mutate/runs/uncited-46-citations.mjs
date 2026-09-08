// The eleven citation-only rows from the forty-six, mutated.
//
// **`uncited-46.mjs`'s header states the population this one actually tests.**
// That file says *a citation whose row does not fail here was a citation and not
// a coverage claim* — and then covers sixteen subjects across the twenty test
// files it runs, none of which is one of the eleven rows that gained only a
// citation. The claim was right and the corpus did not have it: a run file's
// declared subject growing past what it exercises is F930's shape in a harness
// rather than in a rule, which is why this is a second file and not a footnote.
//
// The seven test files below are exactly the ones those rows live in, and none
// of them is in the other run's command — which is the mechanical reason the
// gap was invisible rather than merely unnoticed.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/edge/lifecycle.test.ts test/unit/completion.test.ts " +
  "test/edge/transport.test.ts test/contract/blocks.test.ts " +
  "test/contract/text-width.test.ts test/contract/theme.test.ts " +
  "test/integration/viewport.test.ts";

const LIFECYCLE = "src/terminal/lifecycle.ts";
const FIND = "src/data/manifest/find.ts";
const SUBPROCESS = "src/data/transport/subprocess.ts";
const TEXT = "src/presentation/text.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";
const TOKENS_DARK = "src/presentation/theme/tokens-dark.ts";
const VIEWPORT = "src/viewport/viewport/viewport.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: LIFECYCLE,
    from: "    for (const cb of resumeSubscribers) cb();",
    to: "",
    why: "SIGCONT stops reporting through onResume, which T3.13 counts directly",
  },
  mutations: [
    {
      // C01 I15 — the half the row's title claims and the one a negative
      // assertion is easiest to write vacuously: C01 states a fact and L4
      // decides what it means, so a flag here is two owners for one truth.
      name: "the lifecycle carries a contamination flag of its own",
      file: LIFECYCLE,
      from: "    onResume: (cb) => subscribe(resumeSubscribers, cb),",
      to: "    contaminated: false,\n    onResume: (cb) => subscribe(resumeSubscribers, cb),",
      expect: "T3.13",
    },
    {
      // C01 I16 — handling without re-raising makes Ctrl-Z appear to do
      // nothing; keeping the handler makes the re-raise reach this handler
      // again rather than the default disposition.
      name: "SIGTSTP re-raises without removing its handler",
      file: LIFECYCLE,
      from:
        '    process.removeListener("SIGTSTP", onTstp);\n' +
        '    process.kill(process.pid, "SIGTSTP");',
      to: '    process.kill(process.pid, "SIGTSTP");',
      expect: "T3.12",
    },
    {
      // C05 I14, through the completion half. The same mutation `uncited-46`
      // aims at T1.15: this asks whether the *second* citation, added to a row
      // about candidates, is a coverage claim or a name.
      name: "a hidden tool is offered (the completion half)",
      file: FIND,
      from: "  return Object.freeze(m.tools.filter((t) => t.hidden !== true));",
      to: "  return Object.freeze(m.tools);",
      expect: "T4.2",
    },
    {
      // C06 I21 — the weaker reading the invariant names in its own text: a
      // timer armed with 0 and cleared later, which kills every live view.
      name: "timeoutMs 0 arms a timer that fires immediately",
      file: SUBPROCESS,
      from: "  const timer = inv.timeoutMs > 0 ? clock.schedule(",
      to: "  const timer = inv.timeoutMs >= 0 ? clock.schedule(",
      expect: "T3.8",
    },
    {
      // C06 I22 — the one bug a pass-through `cd` is guaranteed to produce.
      name: "cwd is captured at construction",
      file: SUBPROCESS,
      from:
        "  const spawnOptions = (): SpawnOptions => ({\n" +
        "    cwd: opts.cwd ?? ((): string => process.cwd()),",
      to:
        "  const capturedCwd = (opts.cwd ?? ((): string => process.cwd()))();\n" +
        "  const spawnOptions = (): SpawnOptions => ({\n" +
        "    cwd: (): string => capturedCwd,",
      expect: "T3.22",
    },
    {
      // C09 I15 — the corpus half. T2.17 asserts SS37 is clean over
      // `src/presentation`, so what it owes is a reading of the tree rather
      // than of a dead regex: a colour written anywhere in scope must fire.
      name: "a colour prop appears in src/presentation",
      file: TEXT,
      from: "  if (ascii) return text.length; // cells-ok — proven equal to the walk above",
      to:
        "  if (ascii) return text.length; // cells-ok — proven equal to the walk above\n" +
        '  const color = "#ffffff";\n' +
        "  void color;",
      expect: "T2.17",
    },
    {
      // C09 I16 — a silent disagreement here breaks I1 for every kind at
      // once, which is why the invariant says *asserted, never assumed*.
      name: "every cluster is one cell wide",
      file: TEXT,
      from: "    total += clusterCells(segment, ambiguous);",
      to: "    total += 1;",
      expect: "T2.16",
    },
    {
      // C10 I19 — validating against a surface no text meets rejects themes
      // for a failure that cannot be seen. The exclusion is the invariant.
      name: "contrast is validated against bgDeep as well",
      file: CONTRAST,
      from: '    ["bgElev", tokens.surfaces.bgElev],\n  ];',
      to: '    ["bgElev", tokens.surfaces.bgElev],\n    ["bgDeep", tokens.surfaces.bgDeep],\n  ];',
      expect: "T2.4",
    },
    {
      // C10 I20 — the whole of *recomputed rather than recorded*. A row
      // reading A01 A.1's figures cannot see a shipped token move, and the
      // recorded ratio would still be the one the catalogue holds.
      name: "a shipped surface moves under its own catalogue",
      file: TOKENS_DARK,
      from: '    bg: "#1a1a1a",',
      to: '    bg: "#8a8a8a",',
      expect: "T2.4",
    },
    {
      // C14 I15 — dropping the cache on every change is what makes the
      // Fenwick tree pointless, and an append is the change that must
      // invalidate nothing already measured.
      name: "an append drops the whole cache",
      file: VIEWPORT,
      from: '      case "append":\n        this.#sync();',
      to: '      case "append":\n        this.#cache.clear();\n        this.#sync();',
      expect: "T4.3",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
