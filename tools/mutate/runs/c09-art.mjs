// Roadmap 22 — `art`'s chain, mutated.
//
// **The rows are the walk's table and the walk is what they have to be checked
// against.** A suite indexed by rule interaction can still be a suite indexed by
// the author's belief about the interaction, and a green run says nothing about
// which. So each mutation below restores one of the readings §8a ruled out, and
// the one that matters is `SELECT-BY-TIER`: it is the entry's own sketch, put
// back. If that survives, the table's row 3 is decoration.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/art.test.ts";
const FILE = "src/presentation/art.ts";

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
    file: FILE,
    from: "  return block({ kind: \"notice\", id, tone: \"accent\", text: spec.text });",
    to: "  return block({ kind: \"raw\", id, text: spec.text });",
    why: "every row that reaches the last rung asserts the kind; a run where this survives cannot see a kill at all",
  },
  mutations: [
    {
      // **The entry's own sketch, restored.** `variants: { blocks, ascii }` has
      // no width in it anywhere, so selecting by tier alone is the reading a
      // careful author arrives at from the declaration form. It hands back art
      // the renderer then truncates, silently, on the machine that is too narrow
      // — which is the defect docker-tui measured from the other side.
      name: "SELECT-BY-TIER: eligibility drops the `fits` conjunct",
      file: FILE,
      from: "    if (widthOf(declared, caps.ambiguousWidth) <= width) {",
      to: "    if (true) {",
      expect: "T2.84c",
    },
    {
      // The other half of row 3: width decides and the tier does not. A `blocks`
      // variant drawn on a terminal that renders it as replacement characters is
      // the failure C02's whole ladder exists to prevent.
      name: "the tier is ignored and only width decides",
      file: FILE,
      from: "  return tier === \"ascii\" || (caps.unicode !== \"ascii\" && caps.ambiguousWidth !== \"wide\");",
      to: "  return tier === \"ascii\" || (caps.unicode !== \"never\" && caps.ambiguousWidth !== \"wide\");",
      expect: "T2.84a",
    },
    {
      // Row 5's forgiving direction, reversed: preference order is the ladder,
      // and reversing it means a declared blocks variant loses to an ascii one
      // on a terminal that can draw both.
      name: "the preference order is reversed",
      file: FILE,
      from: "const ORDER: readonly ArtTier[] = [\"blocks\", \"ascii\"];",
      to: "const ORDER: readonly ArtTier[] = [\"ascii\", \"blocks\"];",
      expect: "T2.84b",
    },
    {
      // **`.length` rather than `cells`.** The framework's own named defect,
      // inside the function whose entire job is a measurement. It agrees with
      // `cells` on every ASCII variant, which is why a fixture built only from
      // ASCII art cannot tell the two apart — T2.84l is built so it can.
      name: "the measurement is `.length`",
      file: FILE,
      from: "  return art.split(\"\\n\").reduce((n, line) => Math.max(n, cells(line, ambiguousWidth)), 0);",
      to: "  return art.split(\"\\n\").reduce((n, line) => Math.max(n, line.length), 0);",
      expect: "T2.84l",
    },
    {
      // Row 9's conflation, restored: a tab is read as *this variant is
      // unavailable* rather than *this declaration is wrong*, so the chain falls
      // to the next rung and the art renders correctly on the machine that
      // wrote it.
      name: "a tab selects the next rung instead of throwing",
      file: FILE,
      from: "  if (art.includes(\"\\t\")) {",
      to: "  if (false && art.includes(\"\\t\")) {",
      expect: "T2.84i",
    },
    {
      // The validation loop runs over the *declared* variants rather than the
      // selected one, and that is deliberate: a tab in the variant this terminal
      // cannot draw is still a tab. Narrowing it to the selected variant means
      // the check fires on the machine that can draw the art and not on the one
      // that wrote it — the check exists for the second machine.
      name: "only the selected variant is validated",
      file: FILE,
      from: "    validate(tier, declared);",
      to: "    if (eligible(tier, caps)) validate(tier, declared);",
      expect: "T2.84i",
    },
    {
      // **The row the walk did not have.** SS50 found it, not §8a: block
      // elements are ambiguous-width throughout, so a `wide` terminal draws the
      // wordmark at double. Restoring the tier test to `unicode` alone is the
      // reading every table in the entry supports.
      name: "the ambiguous-width convention stops excluding the blocks variant",
      file: FILE,
      from: "  return tier === \"ascii\" || (caps.unicode !== \"ascii\" && caps.ambiguousWidth !== \"wide\");",
      to: "  return tier === \"ascii\" || caps.unicode !== \"ascii\";",
      expect: "T2.84m",
    },
    {
      // The measurement drops the convention while the tier keeps it — so a
      // variant an app declares under `ascii` and draws with box characters is
      // measured narrow and rendered wide. The tier arm does not cover this,
      // which is why both exist.
      name: "the measurement drops the convention",
      file: FILE,
      from: "  return art.split(\"\\n\").reduce((n, line) => Math.max(n, cells(line, ambiguousWidth)), 0);\n}",
      to: "  return art.split(\"\\n\").reduce((n, line) => Math.max(n, cells(line)), 0);\n}",
      expect: "T2.84n",
    },
    {
      // Row 8: an empty fallback makes the whole declaration able to produce
      // nothing, which is the one thing the chain refuses.
      name: "an empty fallback is accepted",
      file: FILE,
      from: "  if (spec.text === \"\") {",
      to: "  if (spec.text === \"\\u0000\") {",
      expect: "T2.84j",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
