// Motion as the third axis, mutated — the preference, its two resolvers, and
// the membership `reduced` partitions.
//
// **What makes this worth a run rather than three assertions.** I99's claim is
// an *independence*: motion and colour depth are two axes, and `R-BLK-702`
// states it as two concrete corners — *a 1-bit display may animate and a 24-bit
// display may be still*. An independence is a property of the grid, so every
// mutation below is a way of collapsing the grid back onto one axis while each
// individual answer stays plausible. A tree where `glyphTick` ignores the
// preference still animates, still stops below 8-bit, and still reads as
// correct at every point a reader checks one statement at a time.
//
// The fifth is the other kind: not a collapse but a **drift**, a fourth member
// arriving in the tree's ambient table with the registry never consulted, which
// is exactly what a subset check would have let through and what I94 and I98
// are compared by equality to stop.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/spinners.test.ts";
const R = "src/presentation/blocks/ramp.ts";

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
    file: R,
    from: '  if (motion === "off") return "none";\n  if (motion === "reduced"',
    to: '  if (motion === "off") return "none";\n  if (motion === "full" || motion === "reduced"',
    why: "stops the ambient ramps under `full` as well as `reduced` — the crudest possible break of the preference, and a run where it survives is not exercising `effectiveAnimation` at all",
  },
  mutations: [
    {
      // **The depth rung deleted.** `R-MOT-012`'s *below 8-bit motion stops*
      // is the half I99 leaves untouched, and a row claiming two independent
      // axes is worth nothing if the other one has quietly stopped working.
      name: "the colour tick ignores depth, so a 1-bit ramp interpolates",
      file: R,
      from: "  return caps.colourDepth >= 8 ? (tick ?? 0) : 0;",
      to: "  return tick ?? 0;",
      expect: "T2.166",
    },
    {
      // **The preference ignored on the glyph channel.** The corner
      // `R-BLK-702` names second — *a 24-bit display may be still* — becomes
      // unreachable, and nothing else changes: the spinner still runs, the
      // depth gate still holds, and `reduced` still stops the ambient ramps.
      name: "glyph motion ignores the preference, so `off` never stops a spinner",
      file: R,
      from: '  return motion === "off" ? 0 : (tick ?? 0);',
      to: "  return tick ?? 0;",
      expect: "T2.167",
    },
    {
      // **The preference ignored on the colour channel**, which is the twin of
      // the first mutation and the one that caught both a dead branch and a
      // blind row. Its first form deleted an `off` gate from `effectiveTick`
      // and **survived**: `effectiveAnimation` already resolved every ramp to
      // `none`, so the branch was unobservable — the finding was about the code,
      // and the gate came out. Its second form is this one, which reaches the
      // same corner through the function that actually owns it.
      name: "`off` leaves the colour ramps running",
      file: R,
      from: '  if (motion === "off") return "none";',
      to: '  if (motion === "off" && effect === undefined) return "none";',
      expect: "T2.166",
    },
    {
      // **`reduced` promoted to `off`.** Every group stops, not the ambient
      // three — so a reader who asked for less motion loses the `working` and
      // `waiting` ramps that are the ones saying something they must act on.
      // The frame is still and looks deliberate; only the partition is wrong.
      name: "`reduced` stops every effect rather than the ambient three",
      file: R,
      from: '  if (motion === "reduced" && effect !== undefined && AMBIENT_ANIMATIONS.has(effect)) return "none";',
      to: '  if (motion === "reduced" && effect !== undefined) return "none";',
      expect: "T2.168",
    },
    {
      // **And the other way**: `reduced` stops nothing, so the setting is
      // indistinguishable from `full`. The union's every other member answers
      // correctly, which is why the row asserts the partition and not the three.
      name: "`reduced` stops nothing, and is `full` under another name",
      file: R,
      from: '  if (motion === "reduced" && effect !== undefined && AMBIENT_ANIMATIONS.has(effect)) return "none";',
      to: "  // reduced: nothing to do",
      expect: "T2.168",
    },
    {
      // **The drift, not a collapse.** A fourth member in the tree's table with
      // the registry untouched — the failure mode a subset check cannot see,
      // and the reason this membership is compared by equality in both
      // directions as the bar alphabets and the spinner sets are.
      name: "a fourth ambient effect in the tree that the registry does not name",
      file: R,
      from: 'new Set<RampAnimation>(["glint", "drift", "tide"]);',
      to: 'new Set<RampAnimation>(["glint", "drift", "tide", "twinkle"]);',
      expect: "T2.168",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
