// C10 I62 — every value a generated theme carries is read from the registry.
// Mutated (C10 T6.109–T6.110): a palette lent from a hand-written token set
// again, in the two forms that differ in what can see them, and the 4-bit
// substitution T6.102 measured, now made in the registry and in the projection.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/palette-port.test.ts test/contract/curated.test.ts";
const GENERATED = "src/presentation/theme/tokens.generated.ts";
const REGISTRY = "docs/design/language/calcium-registry.json";
// ES imports hoist, so one placed before the export is live wherever it sits —
// which lets a lend be a single mutation site plus this one.
const LEND_IMPORT = {
  file: GENERATED,
  from: "export const REGISTRY_THEMES: ThemeSet = Object.freeze({",
  to: 'import { DARK } from "./tokens-dark.js";\nexport const REGISTRY_THEMES: ThemeSet = Object.freeze({',
};

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
    file: GENERATED,
    from: '          "keyword": "#a626a4",',
    to: '          "keyword": "#a626a5",',
    why: "light's curated keyword one step off its .syn-keyword rule — T2.65 reads every curated slot",
  },
  mutations: [
    {
      // **The lend the port retired, in the form that moved a value**: `light`
      // taking `dark`'s keyword, which is the shape `lend(DARK, …)` had for
      // every light theme before the lenders were split by polarity.
      name: "LEND-VALUE: light's syntax keyword lent from DARK (T6.109)",
      file: GENERATED,
      from: '          "keyword": "#a626a4",',
      to: '          "keyword": DARK.palettes["syntax"]!.slots["keyword"]!,',
      also: [LEND_IMPORT],
      expect: "T2.65",
    },
    {
      // **The same lend where it moves nothing** — `dark` from `DARK`, equal by
      // value. No value row can see it, which is why T1.52 reads the source.
      name: "LEND-EQUAL: dark's syntax keyword lent from DARK, same value (T6.109)",
      file: GENERATED,
      from: '          "keyword": "#c678dd",',
      to: '          "keyword": DARK.palettes["syntax"]!.slots["keyword"]!,',
      also: [LEND_IMPORT],
      expect: "T1.52",
    },
    {
      // **T6.102's substitution in the projection**: `hcDark` handed the dark
      // map, which is what the generator's first draft did from `variant`.
      name: "HC-DARK-MAP: hcDark's fourBit is the dark map in the generated file (T6.110)",
      file: GENERATED,
      from: "    fourBit: FOUR_BIT.highContrast,",
      to: "    fourBit: FOUR_BIT.dark,",
      expect: "T2.39a",
    },
    {
      // **And in the registry, unregenerated** — the record names the dark map
      // and the projection still says otherwise. T1.52 compares each theme's
      // map to the one its record names, so the two cannot part silently.
      name: "HC-DARK-RECORD: hcDark's registry record names the dark map (T6.110)",
      file: REGISTRY,
      from: '      "fourBit": "highContrast",',
      to: '      "fourBit": "dark",',
      expect: "T1.52",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
