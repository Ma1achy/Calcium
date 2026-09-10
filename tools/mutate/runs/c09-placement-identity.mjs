// C09 I66 — the placement's identity is the block's within its entry, and the
// picture is what is cached at it (F421, F987).
//
// **The control answers one id for every block**: `placementIdOf` returning a
// constant. Every row this run reads asserts that two placements differ or that
// one placement is addressed by both sides, so a harness that cannot see every
// id collapse onto one can see nothing below.
//
// **Each mutation is a half of the shipped defect, restored.** The renderer
// deriving the picture's id again; the seam ignoring its group's scope; the
// scope dropped from the hash; the cache asked `has` where it is asked
// `get === key`; and the release sweep removed. The last two are the ones a
// green suite is least able to see, because both leave every frame correct and
// only the record wrong.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const KITTY = "src/presentation/image/kitty.ts";
const IMAGE = "src/presentation/blocks/kinds/image.ts";
const SEAM = "src/shell/transmit-image.ts";

const FILES =
  "test/unit/image-kitty.test.ts test/contract/image-placement.test.ts " +
  "test/edge/image-placement.test.ts test/integration/image-placement.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024,
    });
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
    file: KITTY,
    from: '  return scope === undefined ? imageId(imageKey(block)) : imageId(`${scope}\\u0000${block.id}`);\n',
    to: "  return 1;\n",
    why: "every block is one placement, so no row that separates two placements can hold",
  },
  mutations: [
    {
      // **The renderer deriving the picture's id again**, which is the shipped
      // arm: the frame moves when the picture does.
      //
      // Re-anchored 2026-09-10: the call is unchanged and its indentation is
      // not. The ternary's test moved from `ctx.capabilities.imageProtocol ===
      // "kitty"` to `placesAtProtocol(block, ctx.capabilities, ctx.width)`
      // (C09 I67, F1026), which is shorter, so the continuation lost two
      // spaces. Same statement, same expectation.
      name: "the renderer derives the picture's id with a scope in hand",
      file: IMAGE,
      from: "      ? placementRows(placementIdOf(block, ctx.placementScope), cols, rows)\n",
      to: "      ? placementRows(placementIdOf(block), cols, rows)\n",
      expect: "T2.135",
    },
    {
      // **The seam ignoring its group's scope** — the half-landed pair, from
      // the other side. Every frame is correct and nothing is addressed.
      name: "the seam ignores its group's scope",
      file: SEAM,
      from: "    const id = placementIdOf(image, scope);\n",
      to: "    const id = placementIdOf(image);\n",
      expect: "T2.135",
    },
    {
      // **The scope dropped from the hash**: two entries holding one block id
      // collapse onto one placement, which is the wrong picture rather than
      // none — the failure this arm exists to avoid.
      name: "the scope is dropped from the placement hash",
      file: KITTY,
      from: '  return scope === undefined ? imageId(imageKey(block)) : imageId(`${scope}\\u0000${block.id}`);\n',
      to: "  return scope === undefined ? imageId(imageKey(block)) : imageId(block.id);\n",
      expect: "T2.135",
    },
    {
      // **The cache asked the placement rather than what is at it.** Every
      // frame after the first is skipped at a stable placement, so an animation
      // draws its first frame for ever.
      name: "the cache skips on the placement alone",
      file: SEAM,
      from: "    if (sent.get(id) === key) continue;\n",
      to: "    if (sent.has(id)) continue;\n",
      expect: "T3.86",
    },
    {
      // **The release sweep removed**: the record only grows, which is the
      // hundred-entry defect F987 measured.
      name: "the release sweep is removed",
      file: SEAM,
      from: "  for (const id of [...sent.keys()]) if (!live.has(id)) sent.delete(id);\n",
      to: "",
      expect: "T3.86",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
