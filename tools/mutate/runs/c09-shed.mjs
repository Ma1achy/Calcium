// C09 I81's shed step, mutated (F1233).
//
// **The rows this pass exists to test were written from frames, not from the
// code**, which is the disposition that most needs checking: T3.93 reads a
// rendered row and asks which parts are still in it, so every claim it makes is
// one step removed from the arithmetic that produced it. A row like that can be
// green because the ladder is right, or because the probe cannot see the
// difference — and only breaking the ladder tells the two apart.
//
// **Three mutations are the three findings the build produced, put back.** The
// mark unbudgeted, the shed part drawn anyway, and the shrink order taken from
// the rank: each was a real defect in this file's own history, each was found by
// reading a frame rather than by an assertion, and each is here to ask whether
// the assertions can now see it.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/edge/blocks.test.ts test/unit/blocks.test.ts " +
  "test/contract/rows-arm.test.ts test/contract/blocks.test.ts";

const SHED = "src/presentation/blocks/shed.ts";
const KINDS = "src/presentation/blocks/kinds/structured.ts";

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
    file: SHED,
    from: "  spanOf(parts, (p) => p.natural, gap);",
    to: "  0 * spanOf(parts, (p) => p.natural, gap);",
    why: "the ladder never engages, because every row is measured as fitting; the four kinds fall back to the cut-everything they had at HEAD and T3.93 fails at the first narrow width",
  },
  mutations: [
    {
      // **The withholding unstated.** The first thing a reader loses, and the
      // one a height assertion cannot see: the rows are the same count and the
      // same width, and a part has gone with nothing saying so.
      name: "the withholding is never stated",
      file: SHED,
      from: "mark: !marked || solved.shed.length === 0 ? null : `${SHED_LEAD}${String(solved.shed.length)}`,",
      to: "mark: null,",
      expect: "T3.93",
    },
    {
      // **The mark unbudgeted** — the finding that produced the two-pass shape.
      // The widths are settled against the whole row and the mark is appended
      // after, so the clamp takes its cells out of the last part.
      name: "the withholding is not budgeted for",
      file: SHED,
      from: "  const second = solveRow(parts, Math.max(0, Math.floor(width) - mark), gap); // cells-ok — a cell count",
      to: "  const second = solveRow(parts, Math.max(0, Math.floor(width)), gap); // cells-ok — a cell count",
      expect: "T3.93",
    },
    {
      // **The declared order ignored.** Parts shed in declaration order, which
      // is right for no kind and looks deliberate in all four.
      name: "parts shed in declaration order rather than by rank",
      file: SHED,
      from: "  const order = [...parts].sort((a, b) => a.rank - b.rank || parts.indexOf(a) - parts.indexOf(b));",
      to: "  const order = [...parts];",
      expect: "T3.93",
    },
    {
      // **Decoration shrinks.** `a cut label is not a label` removed, so the
      // threshold becomes a floor and `events` draws `sc…` beside a message
      // with twenty cells to spare.
      name: "decoration shrinks to its declared minimum rather than shedding whole",
      file: SHED,
      from: 'const floorOf = (p: Part): number => (p.tier === "decoration" ? p.natural : p.min);',
      to: "const floorOf = (p: Part): number => p.min;",
      expect: "T3.93",
    },
    {
      // **The two value columns measured apart.** They carry one natural width
      // between them — the widest of either — which is what makes them narrow
      // together; measured per column they diverge, and a reader sees two
      // columns of a comparison at different widths.
      //
      // **This replaces a mutation on a `peer` tier that failed nothing.** The
      // tier held the two in lockstep and the kind had already made them equal,
      // so the arm could not be disobeyed; it is gone, and what is mutated now
      // is the construction that actually holds the property (F1233).
      name: "the two value columns are measured apart",
      file: KINDS,
      from: "  const valueNat = Math.max(",
      to: "  const valueNat = Math.min(",
      expect: "T3.93",
    },
    {
      // **The reservation wins over the row.** At the narrow end the mark takes
      // the cells the last part standing needed, and `clampSpans` cuts the
      // first span rather than the last — so the frame is the withholding.
      name: "the reservation is taken even where it makes the row clip",
      file: SHED,
      from: "  return second.clipped ? stated(first, false) : stated(second, true);",
      to: "  return stated(second, true);",
      expect: "T3.93",
    },
    {
      // **A shed part drawn anyway**, the second finding put back verbatim: a
      // missing width defaults to the part's declared minimum, so the type
      // returns at three cells beside a mark saying it had gone. The first
      // anchor for this was `steps`' shed check, and the pass found that
      // unfalsifiable — the width beside it said the same thing.
      name: "a shed part is drawn at a default width",
      file: KINDS,
      from: '    const typeRoom = got("type");',
      to: '    const typeRoom = got("type") ?? MIN_TYPE;',
      expect: "T3.93",
    },
    {
      // **`comparison`'s order as C09 I81 first declared it** — the field name
      // shed before the values, which the frame overturned.
      name: "comparison sheds the field name first",
      file: KINDS,
      from: '    { id: "field", natural: fieldNat, min: Math.min(fieldNat, MIN_PART), tier: "content" as const, rank: 4 },',
      to: '    { id: "field", natural: fieldNat, min: Math.min(fieldNat, MIN_PART), tier: "content" as const, rank: 0 },',
      expect: "T3.93",
    },
    {
      // **The bar shed instead of its detail**, which is what C09 I81's table
      // asked for and T1.5c has refused since C04 I51: `valueBar` formats the
      // value into the run, so the bar is the value's narrow form.
      name: "keyValue sheds the bar and keeps the text",
      file: KINDS,
      from: "  if (rest < MIN_DETAIL) return run;",
      to: "  if (rest < MIN_DETAIL) return truncate(stripControl(entry.value), valueWidth, ctx.capabilities);",
      expect: "T1.5c",
    },
    {
      // **An item dropped rather than a part shed** — the thing I81 refuses and
      // no width assertion can see. A focus then names a row that draws nothing.
      name: "a kind drops a row it cannot draw",
      file: KINDS,
      from: "      block.events.map((event) => {",
      to: "      block.events.filter(() => width > 20).map((event) => {",
      expect: "T3.94",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
