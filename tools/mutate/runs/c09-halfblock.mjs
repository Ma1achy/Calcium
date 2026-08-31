// C09 I37/I38 — the half-block rung and the decode refusal, mutated.
//
// **The rows are §8b's table, and a green run says nothing about whether the
// table is right.** Each mutation below restores a reading §8b ruled out, and
// two of them are defects the table *found* — `KITTY-FALLS-TO-DITHER` is F409
// put back, and `FAULT-IS-ALT` is F410. If either survives, the row that claims
// to cover it is decoration.
//
// **`SWAP-HALVES` is the one the golden corpus cannot catch.** `ONE_PER_KIND`'s
// image is a flat red square, so exchanging the top and bottom samples produces
// a byte-identical frame in every one of the sixteen golden variants. HB2 is the
// only thing standing between that and a shipped transposition.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/image-halfblock.test.ts test/unit/image-overlay.test.ts";
const HALF = "src/presentation/image/halfblock.ts";
const KIND = "src/presentation/blocks/kinds/image.ts";

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
    file: HALF,
    from: 'export const HALF_BLOCK = "▀";',
    to: 'export const HALF_BLOCK = "X";',
    why: "HB1, HB4, HB5 and IO1b all assert the glyph; a run where this survives cannot see a kill at all",
  },
  mutations: [
    {
      // §8b's ambiguous-width gate, removed. `▀` is East_Asian_Width=Ambiguous
      // — `cells()` answers 2 under `wide` — so a terminal declaring `wide`
      // draws the picture at double the width `imageCells` measured for it.
      name: "AMBIGUOUS-IGNORED: the wide convention no longer excludes the rung",
      file: HALF,
      from: '    caps.ambiguousWidth !== "wide" &&',
      to: "    true &&",
      expect: "HB3",
    },
    {
      // The colour gate collapsed onto the unicode one. They are not the same
      // question: `unicode` asks what can be drawn, depth asks what can be spent.
      name: "DEPTH-IGNORED: 4-bit and 1-bit reach a rung whose claim is two colours",
      file: HALF,
      from: "    caps.colourDepth >= 8",
      to: "    caps.colourDepth >= 0",
      expect: "HB3",
    },
    {
      // §8b G5 — the structural interaction, and the gate no artefact indexed by
      // events would have found. Both colour channels are already the picture.
      name: "OVERLAY-IGNORED: a block with a field takes the rung anyway",
      file: HALF,
      from: "    !hasOverlay &&",
      to: "    true &&",
      expect: "HB4",
    },
    {
      // **F409, restored.** The refusal path re-entering the ladder at the
      // bottom rather than the top. A kitty terminal is non-ascii and at least
      // 8-bit by construction, so this is two rungs down and no frame shows it.
      name: "KITTY-FALLS-TO-DITHER: a refused placement skips the rung it qualifies for",
      file: KIND,
      from: "    if (halfBlockEligible(ctx.capabilities, block.overlay !== undefined)) {",
      to: "    if (false && halfBlockEligible(ctx.capabilities, block.overlay !== undefined)) {",
      expect: "HB5",
    },
    {
      // The top and bottom samples exchanged. **Byte-identical in every golden
      // frame**, because the corpus fixture is a flat colour.
      name: "SWAP-HALVES: the foreground takes the lower pixel",
      file: HALF,
      from: "        top: at(sampleRgb(px, c * sx, upper, (c + 1) * sx, mid), depth),\n"
        + "        bottom: at(sampleRgb(px, c * sx, mid, (c + 1) * sx, lower), depth),",
      to: "        top: at(sampleRgb(px, c * sx, mid, (c + 1) * sx, lower), depth),\n"
        + "        bottom: at(sampleRgb(px, c * sx, upper, (c + 1) * sx, mid), depth),",
      expect: "HB2",
    },
    {
      // §8b G9 — a cell is two pixels and an image need not be an even number of
      // them. Without the clamp the lower sample of a one-row image is off the
      // end, and `?? 0` turns that into a dark band that looks like a picture.
      name: "NO-CLAMP: the lower sample may index past the last row",
      file: HALF,
      from: "  const top = Math.max(0, Math.min(px.height - 1, Math.floor(y0))); // cells-ok — a pixel index",
      to: "  const top = Math.max(0, Math.floor(y0)); // cells-ok — a pixel index",
      expect: "HB6",
    },
    {
      // The 8-bit funnel bypassed, so the quantised arm emits truecolour. The
      // picture would be right and the escape wrong — invisible to anything
      // asserting the glyph.
      name: "DEPTH-NOT-QUANTISED: 8-bit emits rgb rather than an ansi256 index",
      file: HALF,
      from: "  return depth >= 24 ? { kind: \"rgb\", hex } : { kind: \"ansi256\", index: nearestAnsi256(hex) };",
      to: "  return depth >= 0 ? { kind: \"rgb\", hex } : { kind: \"ansi256\", index: nearestAnsi256(hex) };",
      expect: "HB7",
    },
    {
      // **F410, restored.** The decoder's reason dropped and `alt` drawn for
      // every refusal, so a corrupt file and a deliberately-unbuilt format are
      // the same picture to a reader.
      name: "FAULT-IS-ALT: the refusal loses the sentence the decoder computed",
      file: KIND,
      from: "      const fault = decoded.ok ? \"\" : decoded.fault;",
      to: "      const fault = decoded.ok ? \"\" : \"\";",
      expect: "HB8",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
