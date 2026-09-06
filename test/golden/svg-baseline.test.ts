/**
 * SB1–SB5 — **the SVG arm's frames, so its moves can be read** (C12 §3ak.10, F275).
 *
 * `terminal-baseline.test.ts`'s mirror, and it exists for the opposite reason.
 * T1 gates an arm that must **not** move; this one gates an arm that is supposed
 * to, on every commit of step 4, under a rule that says *every move is read*.
 *
 * **Nothing could read one.** F264's remedy split the catalogue digest and its
 * doc says the 66 `phase*` frames are the SVG arm's output. Measured: `digestOf`
 * hashes `.txt` only and **zero** of those contain `<svg` — the `phase3-*` ones
 * are `-cells.txt`, terminal renderings of the forms this arm *refuses*. No
 * golden snapshot holds SVG either. So a commit could change every ticked form's
 * axis and move no tracked byte, which is what one did.
 *
 * **This row does not forbid a move.** It reports what moved and by name, which
 * is what the terminal baseline's diff does for the arm that must hold still.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { REFUSED, SVG_BASELINE_DIR, expectedSvgCount, svgFrames, writeSvgBaseline } from "../../tools/svg-baseline.mjs";

const DIR = SVG_BASELINE_DIR as string;
const frames = svgFrames as () => Map<string, string>;
const expected = expectedSvgCount as () => number;
const write = writeSvgBaseline as (dir: string) => { written: number; stale: number };
const refusal = REFUSED as string;

type Diff = Readonly<{ moved: string[]; missing: string[]; extra: string[]; compared: number }>;

/** The committed corpus against a fresh render, **by bytes**. */
function diff(fresh: Map<string, string>): Diff {
  const onDisk = new Set(readdirSync(DIR).filter((f) => f.endsWith(".svg")));
  const moved: string[] = [];
  const missing: string[] = [];
  let compared = 0;
  for (const [name, bytes] of fresh) {
    if (!onDisk.has(name)) { missing.push(name); continue; }
    compared += 1;
    if (readFileSync(join(DIR, name), "utf8") !== bytes) moved.push(name);
  }
  const extra = [...onDisk].filter((f) => !fresh.has(f));
  return { moved: moved.sort(), missing: missing.sort(), extra: extra.sort(), compared };
}

describe("SB — the SVG baseline (C12 §3ak.10, F275)", () => {
  const fresh = frames();

  it("SB1: the corpus is the whole form set, and the count is derived", () => {
    // A literal would answer *did every frame get compared* with a number
    // written when the corpus was a different size (F256).
    expect(fresh.size).toBe(expected());
    expect(fresh.size, "one frame per form·variant in the catalogue").toBeGreaterThan(150);
  });

  it("SB2: committed and fresh name the same frames, compared by equality both ways", () => {
    const d = diff(fresh);
    expect(d.missing, "a fresh frame with nothing committed for it").toEqual([]);
    expect(d.extra, "a committed frame nothing renders any more").toEqual([]);
  });

  it("SB3 (§3ak.10): what moved, by name — and the count compared is reported", () => {
    const d = diff(fresh);
    // **The count first.** An empty `moved` list means *nothing moved* only if
    // something was compared; a run that compared none reports clean exactly as
    // a run that compared everything and found nothing.
    expect(d.compared, "frames compared").toBe(expected());
    expect(d.moved, "regenerate with `npx tsx tools/svg-baseline.mjs` and READ the diff").toEqual([]);
  });

  it("SB4 (F259): a refusal is a frame, so one cannot appear or vanish silently", () => {
    // `plotToSvg` returns `null` for a shrinking set of forms, for a non-default
    // origin, and for an empty value list — every one a decision. A corpus that
    // skipped them would let a claimed form quietly stop drawing, which is the
    // one thing a `null` arm must not do.
    //
    // **The `> 50` floor is gone, and it is the third row this pass has taken it
    // out of** (F310, F328). It was a number that had to be edited every time a
    // form landed and that said nothing when it was — 77 refusals when it was
    // written, 45 now, and F310's own finding names this row as *the one whose
    // headline states the property its assertion cannot see*. That finding fixed
    // the partition and left the bounds.
    //
    // **What the row can assert without a literal**: every refusal on disk is
    // byte-identical to the placard, over **all** of them rather than the first
    // three — a slice is the sampling blind spot one level down from the bound —
    // and the two sides together are the corpus.
    // **And the set is now empty, which the bound this row already removed once
    // could not have said** (F383, F390). The paragraph above took out a `> 50`
    // floor because *a number that had to be edited every time a form landed
    // said nothing when it was*; `> 0` is the same shape at the other end, and
    // it fails the day the set empties rather than the day a refusal returns —
    // which is backwards, because an empty set is the good news and a returning
    // refusal is the thing this row exists to catch.
    //
    // **The refusal returned, and the equality is what said so on the day.**
    // `plot3d` is `SVG_FAMILY: null` — no emitter here carries a projection
    // (C12 §3am) — so every variant of it is a placard, twenty-one of them now
    // that the polyline carrier, the surface and the wireframe have landed
    // (C04 I78, I79, I80). The placard check
    // below now has something to run over, which it did not while every form
    // drew, and it is asserted as the **exact set** rather than as a count: a
    // second form joining is a decision somebody makes here.
    const refusals = [...fresh.entries()].filter(([, v]) => v === refusal).map(([k]) => k);
    expect([...refusals].sort(), "the refused frames, by name").toEqual([
      "plot3d-axes-none.svg",
      "plot3d-axes-origin.svg",
      "plot3d-axis-styles.svg",
      "plot3d-box-full.svg",
      "plot3d-braille-surface.svg",
      "plot3d-braille-wire.svg",
      "plot3d-colour-series.svg",
      "plot3d-colour-value.svg",
      "plot3d-constant-surface.svg",
      "plot3d-constant-value.svg",
      "plot3d-coplanar.svg",
      "plot3d-default.svg",
      "plot3d-headlight.svg",
      "plot3d-line-wire.svg",
      "plot3d-lines-series.svg",
      "plot3d-marker.svg",
      "plot3d-near-clip.svg",
      "plot3d-origin-centre.svg",
      "plot3d-origin-explicit.svg",
      "plot3d-origin-min.svg",
      "plot3d-orthographic.svg",
      "plot3d-saddle.svg",
      "plot3d-surface-cage.svg",
      "plot3d-surface-field.svg",
      "plot3d-surface-flat.svg",
      "plot3d-surface-light.svg",
      "plot3d-surface-path.svg",
      "plot3d-surface-smooth.svg",
      "plot3d-surface-wire.svg",
      "plot3d-surface.svg",
      "plot3d-trajectory.svg",
      "plot3d-wireframe.svg",
    ]);
    const drawn = [...fresh.entries()].filter(([, v]) => v !== refusal).map(([k]) => k);
    expect(drawn.length, "and the drawn side is the rest of it").toBe(fresh.size - refusals.length);
    expect(refusals.length + drawn.length, "refused and drawn are the whole corpus").toBe(fresh.size);
    for (const name of refusals) {
      expect(readFileSync(join(DIR, name), "utf8"), name).toBe(refusal);
    }
  });

  it("SB5: the comparison responds to a frame moving, and to one going missing", () => {
    // **A gate certified only by its own record agrees with itself whatever it
    // does** (AD5's argument, one instrument along). Written through the real
    // tool into a temp directory, then corrupted.
    const tmp = mkdtempSync(join(tmpdir(), "svgb-"));
    try {
      const { written } = write(tmp);
      expect(written).toBe(expected());
      const victim = readdirSync(tmp).filter((f) => f.endsWith(".svg")).sort()[0]!;
      const at = (dir: string): Diff => {
        const onDisk = new Set(readdirSync(dir).filter((f) => f.endsWith(".svg")));
        const moved: string[] = []; const missing: string[] = []; let compared = 0;
        for (const [name, bytes] of fresh) {
          if (!onDisk.has(name)) { missing.push(name); continue; }
          compared += 1;
          if (readFileSync(join(dir, name), "utf8") !== bytes) moved.push(name);
        }
        return { moved, missing, extra: [], compared };
      };
      expect(at(tmp).moved, "a clean write moves nothing").toEqual([]);
      writeFileSync(join(tmp, victim), "<svg/>\n");
      expect(at(tmp).moved, "and a corrupted frame is named").toEqual([victim]);
      rmSync(join(tmp, victim));
      const gone = at(tmp);
      expect(gone.missing, "a deleted frame reports MISSING, not unchanged").toEqual([victim]);
      expect(gone.moved, "and it is not counted as moved as well").toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
