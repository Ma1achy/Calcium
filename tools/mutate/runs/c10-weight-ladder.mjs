// §074's ladder, mutated — and the class that was off it.
//
// **A table nothing compared to anything.** `classes` has existed since C10 I15
// and the only check refuses a *missing* table, which a wrong one satisfies
// exactly: three source files declared ten entries each by hand and `classesOf`
// lent them to all ten themes, so one wrong entry was wrong ten times and green
// everywhere. `identifier` read `normal` from the day the tone landed.
//
// **Since C10 I62 the table is one record**, `terminalPalettes.classes`,
// generated as `TONE_CLASSES` and `SYNTAX_CLASSES` into `tokens.generated.ts`,
// so that is where the rungs are mutated. The mutation that moved `identifier`
// in `tokens-light.ts` alone is retired with the file: its argument — three
// lent tables, and a row asserting one theme would pass a defect in another —
// has no subject once every theme names the same record, which T2.66 asserts.
//
// **The frame is what found it and this is what keeps it found.** §079's table
// drawn at one bit is nothing but the weight column, and five tones were bold
// where §074 names six. So the mutations here are the ladder's own rungs —
// a tone moved between classes, in each direction — plus the syntax table,
// which §074 keeps separate in the same breath.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme.test.ts test/unit/theme.test.ts";
const CLASSES = "src/presentation/theme/tokens.generated.ts";

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
    file: CLASSES,
    from: '  "muted": "deemphasised",',
    to: '  "muted": "normal",',
    why: "T1.3 and T2.50 both partition the tones; a run where moving one off its class survives is not executing either",
  },
  mutations: [
    {
      // **The defect, put back.** `identifier` in `normal` is what shipped,
      // and it is indistinguishable from `default`, `info` and `meta` at
      // exactly the rung §074 is written about.
      name: "identifier is normal again",
      file: CLASSES,
      from: '  "identifier": "emphasised",',
      to: '  "identifier": "normal",',
      expect: "T2.50",
    },
    {
      // The other direction: a tone promoted onto the emphasised rung the
      // design does not put it on. A row listing only what must be bold
      // passes this; an equality does not.
      name: "meta is promoted to emphasised",
      file: CLASSES,
      from: '  "accent": "emphasised",\n  "meta": "normal",',
      to: '  "accent": "emphasised",\n  "meta": "emphasised",',
      expect: "T2.50",
    },
    {
      // §074 keeps the syntax palette off this ladder in the same breath —
      // *syntax roles resolve first*. A second slot given `keyword`'s weight
      // is the merge that sentence forbids.
      name: "a second syntax slot takes keyword's weight",
      file: CLASSES,
      from: '  "keyword": "emphasised",\n  "string": "normal",',
      to: '  "keyword": "emphasised",\n  "string": "emphasised",',
      expect: "T2.50",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
