// C04 I93 · C09 I39 · C22 I77 — the GIF decoder, the frame store, the wake and
// the kitty ruling.
//
// **The mutations attack what a frame count cannot see.** A decoder that drops
// the disposal step, a store that steps once per wake, a wake that never arms
// and a key without its axis all leave `measure` equal to `render` and draw the
// right number of rows — the picture is the only thing that moves, which is why
// the rows named here read pixels, indices and cadences rather than counts.
//
// Anchors checked for uniqueness before the pass (F219), atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const GIF = "src/presentation/image/gif.ts";
const CODEC = "src/presentation/image/codec.ts";
const IMAGE = "src/presentation/blocks/kinds/image.ts";
const FRAMES = "src/shell/frames.ts";
const SESSION = "src/shell/session.ts";
const KITTY = "src/presentation/image/kitty.ts";
const SEAM = "src/shell/transmit-image.ts";

// `image-halfblock.test.ts` is here because HB8 reads the codec's refusal
// wording, which the front door must not change.
const FILES = "test/edge/image-frames.test.ts test/unit/image-halfblock.test.ts test/edge/owed-gate.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: GIF,
    from: "        canvas[d + 3] = 255;",
    to: "        canvas[d + 3] = 0;",
    why: "every painted pixel left transparent — sharp's pages disagree on every opaque pixel of every fixture",
  },
  mutations: [
    {
      // **The signature not read.** A GIF is handed to `decodePng` and refused as
      // *not a PNG*; every GIF row falls to the fault box.
      name: "the front door dispatches nothing to the GIF decoder",
      file: CODEC,
      from: "  if (isGifSignature(bytes)) {",
      to: "  if (false && isGifSignature(bytes)) {",
      expect: "IF1",
    },
    {
      // **Disposal skipped.** Method 2 and 3 do nothing before the next frame, so
      // a cleared rectangle keeps the old frame's pixels. IF2's fixtures are all
      // disposal 1 and cannot see it; IF4 patches the byte and can.
      name: "the previous frame's disposal is never applied",
      file: GIF,
      from: "    if (previous !== null) {",
      to: "    if (false && previous !== null) {",
      expect: "IF4",
    },
    {
      // **Interlace ignored.** Rows land in stream order; C's gradient permutes.
      name: "an interlaced frame is read as progressive",
      file: GIF,
      from: "    const order = interlaced ? interlaceOrder(h) : null;",
      to: "    const order = null;",
      expect: "IF2",
    },
    {
      // **Transparency ignored.** B's delta frames paint their transparent index
      // as colour 0 over the dot they meant to leave — sharp disagrees.
      name: "the transparent index is painted",
      file: GIF,
      from: "        if (index === control.transparent) continue;",
      to: "        if (false) continue;",
      expect: "IF2",
    },
    {
      // **The clamp removed.** A 0 or 10 ms delay reaches the store as written.
      // Re-anchored 2026-09-05 at the one clamp: this mutation used to remove the
      // scanner's copy alone and **survived** — the decoder's copy at the delay
      // list still clamped, and IF3 reads that list (F778). Two copies of one rule,
      // found by the pass rather than by reading.
      name: "short delays are not clamped",
      file: GIF,
      from: "  return ms < MIN_DELAY_MS ? DEFAULT_DELAY_MS : ms;",
      to: "  return ms;",
      expect: "IF3",
    },
    {
      // **The KwKwK case dropped.** LZW's one special case; A's flat frames never
      // reach it, D's palettes do — the reference comparison catches it.
      name: "LZW mishandles a code equal to the next table entry",
      file: GIF,
      from: "    } else if (code === next) {",
      to: "    } else if (false) {",
      expect: "IF2",
    },
    {
      // **The frame index unread.** Every arm draws frame 0 for ever, which is
      // a correct still — the symptom C22 I77 names.
      name: "the renderer ignores the context's frame",
      file: IMAGE,
      from: "    const px = pixelsOf(block, ctx.frames?.[block.id] ?? 0, ctx.probe);",
      to: "    const px = pixelsOf(block, 0);",
      expect: "IF6",
    },
    {
      // **A step per wake.** The index advances once per call regardless of the
      // elapsed time — four wakes of 25 ms and one of 100 disagree.
      name: "the store steps once per wake rather than by elapsed time",
      file: FRAMES,
      from: "    let shown = was.shown + (elapsedMs % loop);",
      to: "    let shown = was.shown + Math.max(0, delays[index] ?? 0);",
      expect: "IF8",
    },
    {
      // **Zero kept in the key.** A full loop keys apart from untouched — one
      // appearance, two slots.
      name: "frame 0 after a loop is keyed apart from untouched",
      file: FRAMES,
      from: "    const live = [...held].filter(([, h]) => h.index !== 0);",
      to: "    const live = [...held];",
      expect: "IF8",
    },
    {
      // **The axis dropped from the slot.** The entry hits the cache on every
      // wake and the watcher never sees frame 1 — the sixth axis's symptom, one
      // axis along (C22 I71).
      name: "the frame key is not in the render slot",
      file: SESSION,
      // Re-anchored 2026-09-05: the ninth axis (`seriesKey`, C22 I78) follows `framesKey`.
      from: "\\u0000${cursorKey}\\u0000${framesKey}\\u0000${seriesKey}${animated}`;",
      to: "\\u0000${cursorKey}\\u0000${seriesKey}${animated}`;",
      expect: "T4.17o",
    },
    {
      // **No advance on the wake.** The timer arms and fires and the store
      // never moves; every render is frame 0.
      name: "the wake does not advance the frames",
      file: SESSION,
      from: "      for (const f of frames) graph.frames.advance(f.entryId, f.blockId, f.delays, since);",
      to: "      void frames;",
      expect: "T4.17o",
    },
    {
      // **Armed at the floor rather than at the delay.** Thirty wakes in 990 ms
      // instead of six; the picture is right and the cost is not.
      name: "the frame wake is armed at the floor, not at the next frame",
      file: SESSION,
      from: "      framesMs = Math.max(floor, Number.isFinite(due) ? due : floor);",
      to: "      framesMs = floor;",
      expect: "T4.17o",
    },
    {
      // **Gathered at kitty too.** The terminal is animating and the session
      // redraws placeholders that do not change — a wake per frame for nothing.
      name: "animated images are gathered on the protocol arm",
      file: SESSION,
      from: '  const rasterising = graph.capabilities.imageProtocol !== "kitty";',
      to: "  const rasterising = true;",
      expect: "T4.17o",
    },
    {
      // **The GIF sent as PNG bytes.** `f=100` with GIF data — kitty decodes
      // nothing and draws nothing, §4c's loud failure.
      name: "a GIF is transmitted as its bytes under f=100",
      file: SEAM,
      from: '    const isPng = image.data.startsWith("iVBORw0KGgo");',
      to: "    const isPng = true;",
      expect: "IF10",
    },
    {
      // **Later frames not sent.** The placement goes and the loop starts with
      // one frame in it; the terminal shows a still.
      name: "only the first frame is uploaded",
      file: KITTY,
      from: "  for (let k = 1; k < frames.length; k += 1) { // cells-ok — a frame count",
      to: "  for (let k = frames.length; k < frames.length; k += 1) { // cells-ok — a frame count",
      expect: "IF9",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
