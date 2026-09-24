// C10 I53 — the ten hues, three tiers, per theme. Mutated at the generator.
//
// **The subject is a projection, so the mutations go where the projection is
// decided.** `src/presentation/theme/tokens.generated.ts` is emitted by
// `tools/theme/from-registry.mjs`, and a mutation written into the emitted file
// is a hand-edit of an artefact that regenerates — it would be reverted by the
// next `make themes` and would rot on any unrelated registry change. So the
// command regenerates before it runs, and the mutations edit the generator.
//
// **The defect this run exists to catch shipped as a comment.** The collector
// stood at module level keyed by hue name alone, under the sentence *"the hues
// are theme-INDEPENDENT… they land once, as `HUES`"* — and there is no `HUES`,
// so nothing was emitted and nothing read it. Both halves were wrong: measured
// over the registry's 300 tokens, blue's ground takes nine distinct values
// across ten themes and its ink three. Keyed by hue alone, ten themes overwrite
// each other and one vocabulary is written out ten times. THE DEFECT below is
// that outcome expressed at the emit site.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
// The regeneration is part of the command, not a step before it: a mutation of
// the generator is invisible until the projection is taken again.
const CMD = "node tools/theme/from-registry.mjs >/dev/null && npx vitest run test/contract/theme.test.ts";
const G = "tools/theme/from-registry.mjs";

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
    // The block emits nothing, so no theme carries hues at all. This is the
    // state the tree was actually in before C10 I53 — the values collected and
    // never written — and a run where it survives is measuring nothing.
    from: "  return `\\n    hues: Object.freeze({\\n${body}\\n    }),`;",
    to: "  return \"\";",
    why: "with no hues emitted every theme fails T2.53's first assertion; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT.** Every theme takes the first theme's hues, which is what
      // a record keyed by hue name alone produces once ten themes have written
      // through it. Caught by the control pair — light and paper lift blue's
      // ink, and blue's ground is nine distinct values.
      name: "THE DEFECT: one vocabulary written out ten times",
      file: G,
      from: "${huesBlock(theme.id, collected.get(theme.id).hues)}",
      to: "${huesBlock(theme.id, collected.get(themes[0].id).hues)}",
      expect: "T2.53",
    },
    {
      // The order as a set rather than a sequence. Every value is right and
      // every hue is present; only the arrangement moves — which is §093's
      // whole argument, since the assignment it replaced was a spectrum that
      // put five identities a deuteranope cannot separate next to each other.
      // A set comparison passes this.
      name: "the order sorted alphabetically — a set where §093 argues a sequence",
      file: G,
      from: "  return out;\n})();",
      to: "  return out.sort();\n})();",
      expect: "T2.53",
    },
    {
      // The two ink tiers swapped: the hue's own ink becomes the ink drawn ON
      // its band and back. Ten hues × ten themes all still present, all three
      // tiers filled, the order untouched — only which value sits in which
      // tier. This is the mutation that would survive a row asserting shape.
      name: "`h-` and `hi-` transposed — the hue's ink and the ink on its band swapped",
      file: G,
      from: '        hues[hue][name.startsWith("hi-") ? "on" : "ink"] = norm(colour[1]);',
      to: '        hues[hue][name.startsWith("hi-") ? "ink" : "on"] = norm(colour[1]);',
      expect: "T2.53",
    },
    {
      // The band ink hard-coded to black — which is **93 of the registry's 100
      // answers**, and the shape a build takes when nobody notices the tier is
      // derived. Caught by T2.54's count of seven white answers as much as by
      // T2.53's equality, and the count is why it is here.
      //
      // **T2.54 has no mutation of its own, and that is a property of its
      // subject rather than a gap.** It asserts that the REGISTRY satisfies
      // §070's rule — `on` is the higher-contrast of black and white against
      // the hue's ground, 100 of 100 — and the registry is immutable here
      // (`lint-immutable.mjs`), so there is no change to the tree that could
      // make it false while leaving the projection faithful. Its control is
      // inside the row: the seven white answers, and §070's own example read
      // both ways. A claim the corpus cannot hold is not a row to strengthen.
      name: "the band ink hard-coded to black — right 93 times of 100",
      file: G,
      from: '        hues[hue][name.startsWith("hi-") ? "on" : "ink"] = norm(colour[1]);',
      to: '        hues[hue][name.startsWith("hi-") ? "on" : "ink"] = name.startsWith("hi-") ? "#000000" : norm(colour[1]);',
      expect: "T2.54",
    },
  ],
});

console.log(report(results));

// The generator is restored by the harness; the projection is not, because it
// is not a file the pass touched. Take it again from the restored generator.
execSync("node tools/theme/from-registry.mjs >/dev/null", { cwd: ROOT });

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
