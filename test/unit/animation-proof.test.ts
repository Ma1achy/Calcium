// `tools/animation-proof.mjs` — the instrument's own fixture.
//
// **A GIF is the one artefact where *looks fine* and *is correct* diverge.** A
// dropped frame plays smoothly, a duplicated frame plays smoothly, and a frozen
// counter beside a turning spinner plays smoothly — which is F227's failure mode
// exactly, and the reason this file exists.
//
// **It asserts the generator's own frames, not frames rebuilt from its intent.**
// `status-proof.test.ts` builds its own and checks those are distinct, which is
// a property of `renderSequenceToLines` and not of the generator: it would pass
// unchanged against a generator passing a constant tick. That is not
// hypothetical — the two status GIFs it covered held `elapsedMs: 4000` and
// `retryInMs: 8000` for **every** frame, so the spinner turned and the numbers
// beside it stood still, and sixteen green assertions said nothing. A probe
// rebuilt from intent agrees with the intent.
import { describe, expect, it } from "vitest";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { animationFrames, SUBJECT_NAMES } from "../../tools/animation-proof.mjs";
import { gifFrom } from "../../tools/catalogue-png.mjs";

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const plain = (s: string): string => s.replace(SGR, "");

const frames = animationFrames();

describe("tools/animation-proof.mjs — the frames it assembles", () => {
  it("AP1: every subject the generator names produces frames", () => {
    // **The set, not its first member** — a generator that dropped a subject
    // would leave every surviving row green, and the README's table is built
    // from whatever it did emit, so nothing downstream would say so either.
    expect(Object.keys(frames).sort()).toEqual([...SUBJECT_NAMES].sort());
    for (const [name, s] of Object.entries(frames)) {
      expect(s.frames.length, `${name} has frames`).toBeGreaterThan(0);
    }
  });

  it("AP2: a plot's window never repeats — 100 frames, 100 distinct, both arms", () => {
    // The sliding window makes every frame a different picture by construction.
    // Anything less is a dropped or duplicated frame, which is the one defect a
    // GIF cannot show a reader.
    for (const name of ["line-cells", "line-svg", "ring-cells", "ring-svg"]) {
      const f = frames[name]?.frames ?? [];
      expect(f.length, `${name} frame count`).toBe(100);
      expect(new Set(f).size, `${name} distinct frames`).toBe(f.length);
    }
  });

  it("AP3: the elapsed counter crosses one second, and the crossing is a rung", () => {
    // **The row `status-proof.test.ts` could not have**, because it covers
    // `steps`, which carries no numbers. `elapsed` returns the empty string
    // below 1000 ms — *a fast load must not flash a counter* — so the line goes
    // `loading` → `loading (1s)` → `loading (2s)`, and a generator holding
    // `elapsedMs` constant produces exactly one of those three for ever.
    const lines = (frames["loading"]?.frames ?? []).map((f) =>
      plain(f).split("\n").find((l) => l.includes("loading")) ?? "",
    );
    // **`loading` with no parenthesis, not `loading` at end of line.** The
    // status line sits inside a box, so every row ends in `│` — the first form
    // of this row anchored on `$` and reported a missing rung against frames
    // that had it. The assertion has to name the thing that varies.
    expect(lines.some((l) => l.includes("loading") && !l.includes("loading (")), "a frame with no counter").toBe(true);
    expect(lines.some((l) => l.includes("(1s)")), "a frame at one second").toBe(true);
    expect(lines.some((l) => l.includes("(2s)")), "a frame at two seconds").toBe(true);
    // **And in that order**, because a counter that reads 2s before 1s is a
    // generator indexing its numbers by something other than time.
    const first = (probe: string): number => lines.findIndex((l) => l.includes(probe));
    expect(first("(1s)")).toBeLessThan(first("(2s)"));
  });

  it("AP4: the countdown falls and the attempt increments exactly once", () => {
    const lines = (frames["retrying"]?.frames ?? []).map((f) =>
      plain(f).split("\n").find((l) => l.includes("retrying in")) ?? "",
    );
    const read = (l: string): { s: number; attempt: number } => {
      const m = /retrying in (\d+)s \(attempt (\d+)\)/u.exec(l);
      if (m === null) throw new Error(`unreadable activity line: ${JSON.stringify(l)}`);
      return { s: Number(m[1]), attempt: Number(m[2]) };
    };
    const read0 = lines.map(read);
    const attempts = [...new Set(read0.map((r) => r.attempt))];
    expect(attempts, "two backoffs, so two attempt numbers").toEqual([2, 3]);
    // **Monotone within a backoff**, which is the whole of *the countdown
    // falling*. Across the handover it rises, and that is the mechanism rather
    // than a defect — `countdown` rounds rather than floors, so the reader sees
    // `1s` then the next attempt with no zero in between.
    for (const attempt of attempts) {
      const run = read0.filter((r) => r.attempt === attempt).map((r) => r.s);
      const fell = run.every((v, i) => i === 0 || v <= (run[i - 1] as number));
      expect(fell, `attempt ${String(attempt)} counts down: ${run.join(",")}`).toBe(true);
      expect(new Set(run).size, `attempt ${String(attempt)} shows more than one figure`).toBeGreaterThan(1);
    }
  });

  it("AP5: steps — one frame before, the whole set after (F227)", () => {
    // Both halves of the regression proof, and the *before* is the claim that
    // matters: every frame at tick 0 is what a real session drew for the life of
    // the project, measured at one distinct glyph across ten frames.
    const before = frames["steps-before"]?.frames ?? [];
    const after = frames["steps-after"]?.frames ?? [];
    expect(before.length).toBe(after.length);
    expect(new Set(before).size, "tick 0 repeated is one frame").toBe(1);
    expect(new Set(after).size, "the counter moving is the whole set").toBe(after.length);
  });

  it("AP6: every frame of a subject occupies the same box", () => {
    // **The encoder pads to a common box**, so a frame one row taller than its
    // neighbours is absorbed silently and the GIF plays with a band of
    // background where content should be. That is a geometry change hidden by a
    // tolerance, so the tolerance is never allowed to be load-bearing.
    //
    // **The two arms need two questions and the first draft asked one.** A
    // terminal frame's rows *are* its geometry; an SVG document's newlines are
    // markup, and this row failed against a perfectly square corpus reporting
    // six different "heights" for `line-svg`. What fixes the box there is the
    // `viewBox`, which is the same claim in the arm's own units.
    for (const [name, s] of Object.entries(frames)) {
      if (s.arm === "terminal") {
        const heights = new Set(s.frames.map((f) => f.split("\n").length));
        expect([...heights], `${name} row counts`).toHaveLength(1);
        const widths = new Set(s.frames.map((f) => Math.max(...f.split("\n").map((l) => plain(l).length))));
        expect([...widths], `${name} row widths`).toHaveLength(1);
        continue;
      }
      const boxes = new Set(s.frames.map((f) => /viewBox="([^"]*)"/u.exec(f)?.[1] ?? "none"));
      expect([...boxes], `${name} viewBox`).toHaveLength(1);
      expect([...boxes][0], `${name} declares a viewBox`).not.toBe("none");
    }
  });

  it("AP8: the ring draws its ordinate — eight labelled rows (F420)", () => {
    // **The subject is the monitor's ring and the monitor got this wrong**, so
    // the catalogue is where it stays right. C12 I18: *a heatmap's row labels
    // **are** its ordinate*, and `layoutFor` sizes that column from
    // `series[].label`. The block declared `categories` instead — legal on a
    // `Plot`, read by no matrix form — and the frame was eight anonymous rows of
    // perfectly correct colour, which is why no gate and no eye caught it until
    // the picture was looked at.
    const first = frames["ring-cells"]?.frames[0] ?? "";
    const rows = plain(first).split("\n");
    for (let i = 0; i < 8; i += 1) {
      expect(rows.some((l) => l.startsWith(`core ${String(i)} `)), `core ${String(i)} labels its row`).toBe(true);
    }
  });

  it("AP9: the encoder puts the pixels it was given into the file (F419)", async () => {
    // **The row that had to exist, and the reason is a shipped defect nothing
    // could see.** `gifFrom` declared `channels: 3` against a raster that has
    // four — SVG rendering carries alpha — so every row was read four thirds as
    // long as declared and the shear accumulated down the page. Every GIF this
    // repository ever produced came out **green, tripled horizontally and
    // illegible**, including the two cited by F227 as its regression proof.
    //
    // Nothing caught it. `metadata()` reported the right page count and delays;
    // the fixture asserted the frames were distinct, which is true of corrupt
    // frames; the still catalogue was never affected, because a PNG is written
    // without the raw round trip. **It was found by looking at a picture.**
    //
    // So this asks the one question no frame assertion can: do the bytes that
    // come *out* of the encoder carry the colours that went in. Two flat pages,
    // read back page by page — a channel mismatch cannot produce them.
    const dir = mkdtempSync(join(tmpdir(), "calcium-gif-"));
    try {
      const solid = async (hex: string): Promise<Buffer> =>
        await sharp({ create: { width: 8, height: 4, channels: 4, background: hex } }).png().toBuffer();
      const want = ["#c81e3c", "#1e78c8"];
      const pages = await Promise.all(want.map(solid));
      const file = join(dir, "probe.gif");
      const box = await gifFrom(pages, [80, 80], file);
      expect(box.pages, "two pages in, two pages out").toBe(2);

      for (const [i, hex] of want.entries()) {
        const { data } = await sharp(file, { page: i, pages: 1 })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const got = `#${[...data.subarray(0, 3)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        // GIF quantises to 256 colours, so the channels must match closely
        // rather than exactly — and a channel-count error is nowhere near.
        const near = (a: string, b: string): boolean =>
          [1, 3, 5].every((k) => Math.abs(parseInt(a.slice(k, k + 2), 16) - parseInt(b.slice(k, k + 2), 16)) <= 8);
        expect(near(got, hex), `page ${String(i)} is ${hex}, read back ${got}`).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AP7: the generator is deterministic — two calls, identical bytes", () => {
    // **The property the committed pair rests on.** `steps-before.gif` and
    // `steps-after.gif` are written to `docs/media/` because a finding cites
    // them, so a generator whose output drifted would dirty the tree on every
    // run and the diff would stop meaning anything. A GIF whose bytes move
    // between runs is the `Math.random()` finding in a new file.
    const again = animationFrames();
    for (const name of SUBJECT_NAMES) {
      expect(again[name]?.frames, `${name} regenerates identically`).toEqual(frames[name]?.frames);
    }
  });
});
