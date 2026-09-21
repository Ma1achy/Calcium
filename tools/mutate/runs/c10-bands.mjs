// C10 I45, R-THM-003 — the band, its total ink, and the four contrasts.
//
// **The subject is totality, and totality is invisible to a sweep.** Every row
// about `hcDark` was green while ten of its nineteen meaning slots sat below the
// theme's promise on the selection ground, because the composition covering that
// ground was an enumeration of nine and nothing asked whether nine was all of
// them. A band's ink is a property of the band, so the omission cannot recur — and
// a mutation is the only instrument that can show the difference between a
// mechanism that is total and one that merely happens to be complete today.
//
// **The four contrasts are four mutations and not one**, for the same reason the
// gate states them separately: they bind for different reasons, and a run that
// killed all four with one edit would mean three of them are restatements. Each is
// weakened on its own, and each must take T2.42 down alone.
//
// **What the control has to be.** Not a value — every band value could move for a
// legitimate reason. The control removes the band from `inkOn`'s answer, which is
// the mechanism rather than a number: with it gone every slot falls back to its
// flat ink, both high-contrast themes stop loading, and the whole suite goes with
// it. A control that only some rows notice would leave the pass unable to say
// whether a survivor was a live defect or a dead corpus.
//
// **Anchors checked for uniqueness before the pass** (F219), and anchored on what
// changes plus the least context that makes it unique — two anchors in this file's
// neighbour rotted on a bracket that moved for an unrelated reason.
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONTRAST = "src/presentation/theme/contrast.ts";

// `test/contract/theme.test.ts` carries T2.42, T2.43 and T2.44; the unit and edge
// suites carry the load path, so a band that stops a theme loading is caught there
// rather than only in the row that names it.
const FILES = "test/contract/theme.test.ts test/unit/theme.test.ts test/edge/theme.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 300_000,
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
    file: CONTRAST,
    from: "  const band = tokens.bandInk?.[surfaceName];",
    to: "  const band = undefined as string | undefined;",
    why: "with no band in the answer every slot falls back to its flat ink, both high-contrast themes fail to load, and every suite that resolves one goes with it",
  },
  mutations: [
    {
      // **The revert that already shipped** (T6.103). An enumeration is what the
      // registry carried, and it was complete for nine slots of nineteen. Here the
      // band answers for the ten tones and stops, which is the same shape: the row
      // that catches it is the one asserting *every* meaning slot, not a count of
      // the ones somebody listed.
      name: "the band answers for the tones and not the syntax slots",
      file: CONTRAST,
      from: "  const band = tokens.bandInk?.[surfaceName];",
      to: "  const band = ref.startsWith(\"tone.\") ? tokens.bandInk?.[surfaceName] : undefined;",
      expect: "T2.43",
    },
    {
      // A band that answers *after* composition rather than before. Nothing in the
      // shipped set composes on a banded surface, so this is green on every value
      // the tree holds — and it is the door through which a later composition
      // undercuts the promise on the one surface that cannot afford it.
      name: "a composition outranks the band",
      file: CONTRAST,
      from: "  const band = tokens.bandInk?.[surfaceName];\n  if (band !== undefined) return band;\n  const composed",
      to: "  const band = tokens.bandInk?.[surfaceName];\n  const composed",
      expect: "T2.43",
    },
    {
      name: "the selection band need only read as an extent",
      file: CONTRAST,
      from: "export const BAND_VS_PAGE = 3;",
      to: "export const BAND_VS_PAGE = 1;",
      expect: "T2.42",
    },
    {
      name: "the focus band is held to the page at the selection band's figure",
      file: CONTRAST,
      from: "export const FOCUS_VS_PAGE = 2;",
      to: "export const FOCUS_VS_PAGE = 1;",
      expect: "T2.42",
    },
    {
      name: "the two bands need not be told apart",
      file: CONTRAST,
      from: "export const BAND_VS_BAND = 3;",
      to: "export const BAND_VS_BAND = 1;",
      expect: "T2.42",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
