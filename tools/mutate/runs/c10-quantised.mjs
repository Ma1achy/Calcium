// C10 I41 — the shipped quantisations: a table read before the DP, held to the
// computation by T3.73. Mutated.
//
// **The shape this run exists to catch is a table that is read and wrong, or
// right and not read.** A resolver that skips the table computes the same
// answer sixty milliseconds later and every colour row stays green; a key that
// ignores the values serves one theme's picks to another; an entry dropped
// from the generated file is a theme quietly back on the DP; a DP that drifts
// from the table is a shipped constant that is no longer the computation's
// output. Each is a reading T3.73 takes and nothing else does.
//
// **And the floor at the rungs the table serves** (C10 I68, T6.134–T6.135):
// `quantisedShortfalls` measures the quantised ink on the quantised ground, and
// its two lists are held by equality in `test/contract/quantised-contrast.test.ts`.
// It lives in the resolver since C10 I70 made it the 8-bit load gate.
//
// **And the quantiser holding it** (C10 I69, T6.136–T6.141): the floor as an
// admission on the DP, the ground arm, the yield ladder, the band's one ink,
// the page and the infeasible arm — each hand-mutated on landing first, which
// is how T6.138's survivor was found and T2.77 gained its constructed set.
//
// **And `muted` kept apart, and the load gate** (C10 I17, I70, T6.142–T6.148):
// the sixth member of the distinctness set, the gate at both store sites and
// beside the 24-bit validators, the scratch name forgotten, the two memos kept
// for frozen sets only, and the precondition that keeps a malformed hex out of
// the quantiser. Hand-mutated first; T2.79's first draft died on a membership
// assertion, a proxy, and now dies on `hcDark`'s `error` and `muted` on one index.
//
// **And the gate's scope and its distinctness half** (C10 I70, T6.149–T6.152):
// shipped projections skipped by identity, and two of I17's six on one index
// refused unless the set gave them one value.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/theme.test.ts test/contract/quantised-contrast.test.ts test/contract/quantised-gate-scope.test.ts test/edge/theme.test.ts";
const Q = "src/presentation/theme/quantise.ts";
const R = "src/presentation/theme/resolve.ts";
const TABLE = "src/presentation/theme/quantised.generated.ts";
const FOUR = "src/presentation/theme/four-bit.ts";
const STORE = "src/presentation/theme/store.ts";

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
    file: Q,
    from: "  const out: Record<string, number> = {};\n  for (const { slot, pick } of chosen) out[slot] = pick.index;\n  return Object.freeze(out);",
    to: "  const out: Record<string, number> = {};\n  return Object.freeze(out);",
    why: "the DP answers nothing for every slot — every 8-bit row that reads a pick, and T3.73's equality against the table, go red",
  },
  mutations: [
    {
      // **The table is never read.** Same answer, the DP every time: sixty
      // milliseconds back on the cold load and every colour row green.
      name: "TABLE-SKIPPED: quantiseSet computes whatever the table holds",
      file: Q,
      from: "  return QUANTISED[quantisationKey(slots)] ?? computeQuantisation(slots);",
      to: "  return computeQuantisation(slots);",
      expect: "T3.73",
    },
    {
      // **The key ignores the values.** Two themes with the same slot names read
      // as one set: the table is missed everywhere (its keys carry values), and
      // a table regenerated under this key would serve one theme's picks to the
      // other.
      name: "KEY-BY-NAMES: the key carries the slot names and not their values",
      file: Q,
      from: "  return JSON.stringify(Object.entries(slots).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));",
      to: "  return JSON.stringify(Object.keys(slots).sort());",
      expect: "T3.73",
    },
    {
      // **An entry dropped from the generated file.** The theme it served is
      // back on the DP and nothing but the coverage half notices.
      name: "ENTRY-DROPPED: no shipped set is in the table",
      file: TABLE,
      // **Anchored on the export, and it is the class at n = 41 rather than at
      // n = 1.** This dropped one entry, anchored on that entry's comment — and
      // the comment names which themes share the set, in the order the generator
      // walks them, so it rewrites whenever a theme is added, renamed or
      // reordered. It rotted twice in one sitting for reasons that have nothing
      // to do with a dropped entry, which is `an anchor that names a constant is
      // not an anchor` in a generated file: there is no stable text in here to
      // point a single-entry drop at.
      //
      // So the mutation is the whole table instead. It is blunter — one missing
      // entry is the subtle case and this is not it — and it is the same defect:
      // every shipped theme back on the DP, every colour row still green, and
      // only the coverage half of T3.73 noticing. What is lost is the *n*, and
      // what is bought is an anchor made of hand-written text.
      //
      // **The first insertion tried here was worse than a rotting anchor**: a
      // bogus `"[]"` entry beside the real ones, which T3.73 accepts, because
      // the computation over an empty set is an empty set and the row compares
      // each entry against its own computation. A mutation that survives is a
      // finding about the tests — except when the instrument wrote it, and then
      // it is a finding about the instrument.
      from: 'export const QUANTISED: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({\n',
      to: 'export const QUANTISED: Readonly<Record<string, Readonly<Record<string, number>>>> = Object.freeze({});\nconst DROPPED_QUANTISED = Object.freeze({\n',
      expect: "T3.73",
    },
    {
      // **The DP drifts from the table.** A widened tie band regroups levels;
      // the shipped constant is no longer the computation's output.
      name: "TIE-WIDENED: the level threshold moves and the table is stale",
      file: Q,
      from: "const TIE = 0.02;",
      to: "const TIE = 0.06;",
      expect: "T3.73",
    },
    {
      // **The hex read back for a neighbouring index.** The negative half
      // reads `quantisedHex` against the cube's own hex for the fresh pick.
      name: "HEX-OFF-BY-ONE: cubeHexOf answers for the next index",
      file: Q,
      from: "  return CUBE.find((entry) => entry.index === index)?.hex ?? null;",
      to: "  return CUBE.find((entry) => entry.index === index + 1)?.hex ?? null;",
      expect: "T3.73",
    },
    {
      // **T6.134 — the ink measured with no ground.** A composed ink and a
      // band's one ink both become the flat slot, so the measurement is of a
      // pair the resolver never paints on that ground.
      name: "T6.134: quantisedShortfalls resolves the ink without its ground",
      file: R,
      from: "    const ink = hexOf(resolve(ref, theme, caps, ground).colour);",
      to: "    const ink = hexOf(resolve(ref, theme, caps).colour);",
      expect: "T2.74",
    },
    {
      // **T6.135 — a ground the resolver does not paint stops being a cell.**
      // At 4 bits `focusGround` has no curated index on eight themes, and the
      // ink lands on the page; without the fallback those 216 cells vanish.
      name: "T6.135: the 4-bit fallback to the page removed",
      file: R,
      from: "?? (depth === 4 ? page : null);",
      to: "?? (depth === 4 ? null : page);",
      expect: "T2.75",
    },
    {
      // **T6.136 — the nearest-entry pick restored.** The set's nearest picks
      // are served without asking whether a floor refuses one: C10 I68's 193 cells.
      name: "T6.136: holdFloor answers the nearest set unasked",
      file: R,
      from: "  return refused ? computeQuantisation(slots, admits) : nearest;",
      to: "  return nearest;",
      expect: "T2.74",
    },
    {
      // **T6.137 — the ground arm removed.** The surfaces take their nearest
      // entries, and hcDark's focus band is back on #005faf, where no ink the
      // cube has reaches 7.
      name: "T6.137: the surfaces quantised with no admission",
      file: R,
      from: 'return quantisedFor(theme, "surface", surfaces, () => groundAdmits(theme.tokens));',
      to: 'return quantisedFor(theme, "surface", surfaces);',
      expect: "T2.74",
    },
    {
      // **T6.138 — the ladder's second step removed.** No shipped set reaches
      // it; the first hand mutation here survived, and T2.77's constructed set
      // is the answer to that survivor.
      name: "T6.138: the distinctness repair skips a free entry outside its window",
      file: Q,
      from: "      closest(entry.lab, free) ??\n",
      to: "",
      expect: "T2.77",
    },
    {
      // **T6.139 — a band split again.** Two slots given one value treated as
      // a collision: hcDark's black selection ink becomes five near-blacks.
      name: "T6.139: the same-value exemption removed from the repair",
      file: Q,
      from: "if (holder === undefined || holder === entry.hex) {",
      to: "if (holder === undefined) {",
      expect: "T2.78",
    },
    {
      // **T6.140 — the page held against nothing.** An absent ground looked up
      // under a name no ground has, so the page's painters get the nearest set.
      name: "T6.140: the page passes no admission",
      file: R,
      from: '  const ground = on ?? "bg";',
      to: '  const ground = on ?? "";',
      expect: "T2.76",
    },
    {
      // **T6.141 — the infeasible arm removed.** A set with no assignment keeps
      // the DP's initial picks, every one the cube's first entry.
      name: "T6.141: a set with no assignment is left at its initial picks",
      file: Q,
      from: "    for (const member of chosen) member.pick = nearest(member.lab, (c) => member.admits(c.hex));\n",
      to: "",
      expect: "T2.74",
    },
    {
      // **T6.142 — `muted` free to collapse again.** `hcDark`'s `error` and
      // `muted` share white on `diffAdd`, and `paper`'s `info` and `muted` one
      // grey on its page.
      name: "T6.142: muted out of the distinctness set",
      file: FOUR,
      from: '  "accent",\n  "muted",\n]);',
      to: '  "accent",\n]);',
      expect: "T2.79",
    },
    {
      // **T6.143 — `loadTheme` with the 24-bit validators alone.**
      name: "T6.143: loadTheme without the 8-bit gate",
      file: STORE,
      from: "  const errors = names.flatMap((name) => gates(set[name]!).map(",
      to: "  const errors = names.flatMap((name) => [...validateTokens(set[name]!), ...validatePaintedFloors(set[name]!)].map(",
      expect: "T2.80",
    },
    {
      // **T6.144 — `applyOverrides` with the 24-bit validators alone.**
      name: "T6.144: applyOverrides without the 8-bit gate",
      file: STORE,
      from: "const failures = [...gates(patched).map(",
      to: "const failures = [...[...validateTokens(patched), ...validatePaintedFloors(patched)].map(",
      expect: "T2.80",
    },
    {
      // **T6.145 — the first draft: the gate only after the others pass.** No
      // theme reaching it that way has a short cell (C10 I70), so it is a gate
      // no input reaches.
      name: "T6.145: the gate run only on themes the 24-bit gates pass",
      file: STORE,
      from: "  return [...validateTokens(tokens), ...validatePaintedFloors(tokens), ...eight];",
      to: "  const found = [...validateTokens(tokens), ...validatePaintedFloors(tokens)];\n  return found.length > 0 ? found : eight;",
      expect: "T2.80",
    },
    {
      // **T6.146 — the scratch name's picks left in the memo.** Every set
      // measured after another reads that set's picks.
      name: "T6.146: the scratch name not forgotten",
      file: R,
      from: "    forget(SCRATCH);\n",
      to: "",
      expect: "T2.80",
    },
    {
      // **T6.147 — the verdict kept for a set that can still change.**
      name: "T6.147: the verdict kept for a token object that is not frozen",
      file: R,
      from: "  if (frozenThrough(tokens)) verdicts.set(tokens, verdict);",
      to: "  verdicts.set(tokens, verdict);",
      expect: "T2.80",
    },
    {
      // **T6.148 — a malformed hex reaches the quantiser** and throws where
      // `validateTokens` would have named it.
      name: "T6.148: the gate run on a theme whose values are not all hexes",
      file: R,
      from: "  if (!quantisable(tokens)) return Object.freeze([]);\n",
      to: "",
      // The title's colon: the match is a substring, and `T3.2` is a prefix of
      // any T3.2x row these files gain.
      expect: "T3.2:",
    },
    {
      // **T6.149 — the shipped set measured at every load again**: the answer
      // is the same and the cost is 250–300 ms, so only the call can see it.
      name: "T6.149: the shipped projections measured at load",
      file: STORE,
      from: "  const eight = SHIPPED.has(tokens) ? [] : validateQuantisedFloors(tokens);",
      to: "  const eight = validateQuantisedFloors(tokens);",
      expect: "T2.82",
    },
    {
      // **T6.150 — a shipped set told apart by name**: a consumer's set spelled
      // `dark` passes unmeasured.
      name: "T6.150: a shipped projection told apart by name, not identity",
      file: STORE,
      from: "  const eight = SHIPPED.has(tokens) ? [] : validateQuantisedFloors(tokens);",
      to: "  const eight = [...SHIPPED].some((t) => t.name === tokens.name) ? [] : validateQuantisedFloors(tokens);",
      expect: "T2.80",
    },
    {
      // **T6.151 — the silent case back**: every hue on `#767575` painted black.
      name: "T6.151: the distinctness half removed",
      file: R,
      from: "      }).concat(collisions(theme)),",
      to: "      }),",
      expect: "T2.81",
    },
    {
      // **T6.152 — a band counted as a collision**: every tone on it is its one ink.
      name: "T6.152: two slots with one value counted as sharing an index",
      file: R,
      from: "      if (new Set(members.map((m) => m.value)).size < 2) continue;",
      to: "      if (members.length < 2) continue;",
      expect: "T2.81",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
