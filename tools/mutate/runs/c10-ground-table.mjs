// C10 I60, R-THM-004 — the floor's scope is the registry's table, and contrast.ts
// names no ground. Mutated (C10 T6.123, T6.124).
//
// **T6.123 is the mutation the item asked for: a ground added with no edit to
// the validator.** It edits the registry and its projection together, so the
// generator's `--check` stays green and the projection agrees with its source —
// the only thing left that can object is the validator measuring the new row.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/theme.test.ts";
const CONTRAST = "src/presentation/theme/contrast.ts";
const REGISTRY = "docs/design/language/calcium-registry.json";
const PROJECTION = "src/presentation/theme/four-bit.generated.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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
    file: PROJECTION,
    from: '  Object.freeze({ ground: "bgDeep", pairing: "chip", refs: Object.freeze({ tone: Object.freeze(["meta"]) }) }),\n',
    to: "",
    why: "the projection loses the chip's row that the registry still has — T2.59 reads the registry",
  },
  mutations: [
    {
      name: "A GROUND ADDED: border as a page row, in the registry and its projection, contrast.ts untouched (T6.123)",
      file: REGISTRY,
      from: '        {\n          "ground": "bgDeep",',
      to: '        {\n          "ground": "border",\n          "pairing": "page",\n          "refs": "meaning"\n        },\n        {\n          "ground": "bgDeep",',
      also: [
        {
          file: PROJECTION,
          from: '  Object.freeze({ ground: "bgDeep",',
          to: '  Object.freeze({ ground: "border", pairing: "page", refs: "meaning" }),\n  Object.freeze({ ground: "bgDeep",',
        },
      ],
      expect: "T2.71",
    },
    {
      name: "EVERY-ROW: textSurfaces selects every row, not the page rows (T6.124)",
      file: CONTRAST,
      from: '  return rowsOf("page", tokens).map(([row, hex]) => [row.ground, hex] as const);',
      to: "  return rowsOf(undefined, tokens).map(([row, hex]) => [row.ground, hex] as const);",
      expect: "T2.71",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
