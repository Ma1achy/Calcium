// The three probes, verified — group 9.
//
//     node examples/docker/tools/probes_test.mjs
//
// **What these instruments claim**: that the heights they print are the ones the
// application draws. `gap-check.mjs` compares a view's per-block sum against the
// sequence's real height, `measure-raw.mjs` asks whether `n`/`p` can reach the
// bottom of S5, `measure-s3.mjs` splits S3's height per block. Three questions,
// one dependency: the registry the measurement goes through.
//
// **What distinguishes a broken one**: a registry missing a kind. The block is
// then measured by the *fallback*, which answers 5 rows for a panel that draws
// 13 — a correct measurement of a different application, with nothing in the
// output to say so. It is the failure mode a probe cannot show you, because a
// number is what a working probe produces too.
//
// So the rows compare the probes' registry against the shell's **by equality**,
// and check that the wrong registry really does give a different answer. A row
// that only asserted "the plot measures 13" would pass the day someone adds a
// fourth definition to `construct.ts` and forgets these files.
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";

import { createBlockRegistry } from "../../../dist/presentation/blocks/index.js";
import { b } from "../../../dist/shell/builders/index.js";
import { appRegistry, EXTRA } from "./registry.mjs";

const HERE = new URL(".", import.meta.url);
const CONSTRUCT = new URL("../../../src/shell/construct.ts", import.meta.url);

const cases = [];
const say = (name, got, want) => cases.push([name, JSON.stringify(got), JSON.stringify(want)]);

// 1 — **the shell's list, read from the shell.** `construct.ts:337` registers
// three definitions beyond the defaults; this is that list, compared as a set.
// A fourth arriving there fails here rather than silently narrowing three
// probes.
const registered = [
  ...readFileSync(CONSTRUCT, "utf8").matchAll(/^\s+blocks\.register\((\w+)Definition/gm),
].map((m) => m[1]);
say("the shell's registrations were found", registered.length > 0, true);
say(
  "the probes register exactly what the shell registers",
  [...registered].sort(),
  EXTRA.map((d) => d.kind).sort(),
);

// 2 — **and the difference is measurable**, which is what makes row 1 about the
// application rather than about two lists agreeing. One plot block through both
// registries: the app's answers its real height, the defaults-only one answers
// the fallback's.
const plot = b.plot({
  id: "cpu",
  series: [{ label: "cpu", points: [1, 2, 3, 4, 5, 6] }],
  height: 8,
});
const app = appRegistry().measure(plot, 100);
const bare = createBlockRegistry({ defaults: true }).measure(plot, 100);
say("the app's registry measures the plot's real height", app >= 8, true);
say("the defaults-only registry answers something else", app !== bare, true);

// 3 — **no probe builds its own.** The omission had three places to happen
// because there were three registries; this is the allow-list form of the rule,
// so a new probe added next to these three fails until it uses the shared one.
const OWN = new Set(["registry.mjs", "probes_test.mjs"]);
/** **Comments stripped first.** The first run of this row reported
 * `measure-s3.mjs`, and the hit was the sentence in its header explaining the
 * defect — prose about a mechanism reads exactly like the mechanism to a grep,
 * and an unbuilt or removed one is usually documented more than a working one. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const offenders = readdirSync(HERE)
  .filter((f) => f.endsWith(".mjs") && !OWN.has(f))
  .filter((f) => code(readFileSync(new URL(f, HERE), "utf8")).includes("createBlockRegistry("));
say("no probe builds a registry of its own", offenders, []);

let failed = 0;
for (const [name, got, want] of cases) {
  if (got === want) console.log(`  ok    ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${name}\n          got  ${got}\n          want ${want}`);
  }
}
console.log(`\nprobes (gap-check · measure-raw · measure-s3) — ${cases.length - failed}/${cases.length} rows`);
process.exit(failed === 0 ? 0 : 1);
