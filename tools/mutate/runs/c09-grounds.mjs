// §072's two channels, mutated — which kinds paint, how far, and the 1-bit rung.
//
// **The subject is invisible to the corpus that would otherwise cover it.**
// `design-surfaces.test.ts` strips SGR, which is right for a fixture about
// shape and blind to one whose whole subject is the other channel: a washed row
// and a bare one fold to the same picture. So the frame is a mask and T2.159 is
// the gate beside it, and these are the ways either could be satisfied by the
// wrong picture.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const LINES = "src/presentation/patch/lines.ts";
const PANEL = "src/presentation/blocks/kinds/containers.ts";
const FILES = "test/contract/blocks.test.ts test/golden/design-surfaces.test.ts";

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
    // A change the census can see: no patch line takes a ground at all, so the
    // painted set loses its largest member and every mask row empties.
    file: LINES,
    from: "  if (behind.background === undefined) return spans;",
    to: "  return spans;\n  if (behind.background === undefined) return spans;",
    why: "no changed line is painted, so the painted set is two kinds and the diff's mask is empty",
  },
  mutations: [
    {
      // **The extent, which is the whole of §072's first example.** A ground
      // stopping at the last character says a *word* changed, and that is a
      // different claim. Dressing before the row is padded is how it happens,
      // and every count, every width and every stripped frame is unmoved.
      name: "the ground stops at the text rather than the block's edge",
      file: LINES,
      from: "  return spans.map((span) => ({ text: span.text, style: withBackground(span.style, behind) }));",
      to: "  return spans.map((span) => ({ text: span.text.trimEnd(), style: withBackground(span.style, behind) }));",
      expect: "T2.159",
    },
    {
      // **A second painted label**, and it is the one §073 will land on
      // purpose: *a name is a THING, and things take a ground* gives the panel's
      // title `bgElev`. Today I95's set is three and the panel is text, so a
      // title that quietly starts painting is the drift this row exists to
      // catch — and every assertion about a panel's shape, width and border is
      // unmoved by it, because the glyphs do not change at all.
      name: "a panel's title takes a ground",
      file: PANEL,
      from: '          { text: titlePart, style: tone("accent", ctx.theme, ctx.capabilities) },',
      // The ground is written as a literal rather than resolved through
      // `background("surface.bgElev", …)`, because `containers.ts` imports
      // neither helper and a mutation gets one anchor. The value is `bgElev`'s
      // dark hex; what the row reads is that a cell has a background at all.
      to: '          { text: titlePart, style: { ...tone("accent", ctx.theme, ctx.capabilities), background: { kind: "rgb", hex: "#222222" } } },',
      expect: "T2.159",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
