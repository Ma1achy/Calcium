// The spinner catalogue's ASCII rung, mutated — the alphabet, the cadence and
// the reservation.
//
// **The defect this covers was green under a row named for the rule it broke.**
// `T2.73` was titled *the ASCII pair keeps the shape of motion* — R-MOT-010's
// own words — and asserted two literals it wrote itself against no registry,
// while nineteen of twenty-seven sets fell to three shared alphabets. And a
// second rule was green on the collapse: `R-MOT-011`, *sets that reuse a frame
// alphabet reuse its interval*, holds perfectly over three consistent families.
//
// So the mutations are the three ways it can come back: the alphabet collapsed
// again, the cadence broken while the characters stay right, and a tool taking
// a frame from the family reserved to the agent.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/spinners.test.ts test/golden/design-surfaces.test.ts";
const G = "src/presentation/blocks/glyphs.ts";

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
    file: G,
    from: '    ascii: Object.freeze(["_", "-", "^", "-"]),',
    to: '    ascii: Object.freeze(["_", "-", "^", "~"]),',
    why: "one character of one set's ASCII rung; a run where this survives is not comparing the catalogue against the registry at all",
  },
  mutations: [
    {
      // **The defect, put back**, on the set that showed it most plainly: a
      // vertical bounce falling to a grow ramp. Four of the old five characters
      // and the right length for nothing — T2.163 is what reads the registry.
      name: "`bounce` falls to the pulse ramp again",
      file: G,
      from: '    ascii: Object.freeze(["_", "-", "^", "-"]),',
      to: '    ascii: Object.freeze([".", "o", "O", "@", "*"]),',
      expect: "T2.163",
    },
    {
      // **The cadence alone.** Every character is the registry's and in the
      // registry's order — the fit is simply dropped, so the rung is four
      // frames where the set is ten and the ASCII spinner runs two and a half
      // times faster. T2.163 catches it on the array; T2.73 is the row that
      // says *why it matters*, and this mutation is what distinguishes them.
      name: "`braille`'s rung is the bare pattern, unfitted — right glyphs, wrong cycle",
      file: G,
      from: '    ascii: Object.freeze(["|", "|", "|", "/", "/", "-", "-", "-", "\\\\", "\\\\"]),',
      to: '    ascii: Object.freeze(["|", "/", "-", "\\\\"]),',
      expect: "T2.73",
    },
    {
      // **The catalogue's membership.** A set dropped from the tree while the
      // registry still registers it — the direction a subset check over the
      // tree's own keys cannot see, and the one the six unregistered sets sat
      // in for as long as they existed.
      name: "a registered set is not built — `arc` leaves the catalogue",
      file: G,
      from: "  arc: Object.freeze({",
      to: "  arcGone: Object.freeze({",
      expect: "T2.163",
    },
    {
      // `binary4`'s ASCII rung back to the decimal digits: a sixteen-state
      // counter that cannot count to sixteen. The registry answers that range
      // in `hex`'s record, and this is the row that holds the tree to it.
      name: "`binary4` counts in ten digits again",
      file: G,
      // **Two lines, because one matches twice**: `hex` carries the same
      // sixteen digits, and an anchor taking the first would measure a site
      // nobody chose (F1113). The interval above it is what makes it `binary4`'s.
      from: '    intervalMs: 120,\n    ascii: Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]),',
      to: '    intervalMs: 120,\n    ascii: Object.freeze(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]),',
      expect: "T2.163",
    },
    {
      // A tool taking a bloom. `noise` is a dissolve and nothing to do with the
      // agent; one frame borrowed is the whole of R-MOT-008, and the fixture
      // says so itself — *a bloom set on a TOOL is a defect a grep finds*.
      name: "a tool blooms — `noise` takes a frame from the agent's family",
      file: G,
      from: '  noise: Object.freeze({\n    frames: Object.freeze(["▓", "▒", "░"]),',
      to: '  noise: Object.freeze({\n    frames: Object.freeze(["▓", "▒", "✦"]),',
      expect: "T2.164",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
