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
const CMD = "npx vitest run test/unit/image-halfblock.test.ts test/unit/image-overlay.test.ts test/unit/capabilities.test.ts";
const HALF = "src/presentation/image/halfblock.ts";
const CAPS = "src/terminal/capabilities.ts";
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
      // **This slot held `NO-CLAMP` and it could not be killed** (F412). Removing
      // `Math.min(px.height - 1, …)` fails nothing because the clamp never fires:
      // 1.24 billion coordinates swept, and none of `sampleRgb`'s four bounds
      // binds. An uncatchable mutation left in a run is a row that reports the
      // suite is thorough about a guard doing no work.
      //
      // **The midline is what actually carries the two-pixels-a-cell claim.**
      // Collapsing it onto the upper edge makes both halves sample one pixel row,
      // so every cell's foreground equals its background — the picture halves its
      // vertical resolution and still looks like a picture.
      name: "MID-COLLAPSES: both halves sample the same pixel row",
      file: HALF,
      from: "      const mid = (r * 2 + 1) * sy; // cells-ok — a pixel coordinate",
      to: "      const mid = (r * 2) * sy; // cells-ok — a pixel coordinate",
      expect: "HB2",
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
      // **F413's ordering, undone.** The protocol arm gated on pixels again, so a
      // PNG the terminal decodes and we cannot is described rather than drawn.
      // This is F410's effective behaviour restored — the gate on the block.
      name: "PROTOCOL-NEEDS-PIXELS: the placement waits on a decode it does not use",
      file: KIND,
      from: '    if (placed !== null && "rows" in placed) {',
      to: '    if (placed !== null && "rows" in placed && pixelsOf(block) !== null) {',
      expect: "HB11",
    },
    {
      // The extent dropped on refusal, so geometry falls back to the 20-column
      // placeholder for a picture whose IHDR we read perfectly well.
      name: "NO-EXTENT: a refusal forgets the size it already knew",
      file: KIND,
      from: "  return decoded.ok ? decoded.pixels : (decoded.size ?? null);",
      to: "  return decoded.ok ? decoded.pixels : null;",
      expect: "HB10",
    },
    {
      // **F415, restored.** Ghostty forgotten, and the whole protocol arm becomes
      // unreachable on it. Nothing in the renderer's own suite can see this:
      // every test injects capabilities, which is correct, and leaves the
      // detection as the one door nothing opens.
      //
      // **Compound since F418 single-sourced the identification**, and the shape
      // change is the point rather than an inconvenience. The old anchor was one
      // line of `detectImageProtocol` — `xterm-kitty || xterm-ghostty ||
      // program === "ghostty"` — which was itself the second of three lists over
      // *which emulator is this*. There is one list now, so forgetting a terminal
      // takes an edit in both of its keys: `TERM`, which a multiplexer rewrites,
      // and `TERM_PROGRAM`, which survives one. A single-anchor version would
      // leave ghostty identified by the other key and mutate nothing observable.
      name: "GHOSTTY-FORGOTTEN: the one identification loses a terminal by both keys",
      file: CAPS,
      from: '  "xterm-ghostty": "ghostty",\n',
      to: "",
      also: [{ file: CAPS, from: "  ghostty: \"ghostty\",\n", to: "" }],
      expect: "T1.7",
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
