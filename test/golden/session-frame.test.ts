/**
 * **Golden frames — the composed ones** (F163, F738, roadmap 49).
 *
 * Every other snapshot in this directory renders a *block*. This one renders a
 * **session**: a real `Session` against a fake terminal, driven by bytes, read
 * back as the grid those bytes accumulate to. It exists because the category
 * whose whole job is catching a change in what the frame looks like stopped one
 * layer below the thing that composes the frame — so the theme's background
 * base, the prompt's window and its elision markers, the selection wash, the
 * chrome rows, the frame's height arithmetic, the cursor sequences and the
 * write-as-a-difference had never appeared in a snapshot at all.
 *
 * | what the entry named | the scene that constructs it |
 * |---|---|
 * | the theme's background base | every theme at `boot`; `light` and `high-contrast` declare `surface`, `dark` inherits and paints none |
 * | the prompt window and its elision markers | `window-tail`, `window-head`, `window-both` — all three branches of `promptWindow`, plus the ascii marker |
 * | the selection wash | `selection`, and `window-wash` for a wash inside a window |
 * | the chrome rows and the frame's height arithmetic | every scene: the grid is `rows` tall and the rules sit where `compose` put them |
 * | the cursor shape and position sequences | the `writes` reading of every scene |
 * | the diff a frame is written as | `boot` writes from `ESC[H`; every other scene addresses rows with `ESC[r;cH` |
 *
 * **The theme arm is `Object.keys(defaultTheme)` and not a list.** F163's second
 * instance is that `blocks.test.ts` and `table.test.ts` both hold hand-written
 * theme pairs, so `high-contrast` shipped into no golden snapshot and the suite
 * stayed green. A derived arm is what makes a fourth theme join rather than pass
 * by, and the finding says the rendering worth having is a **frame** — this one.
 *
 * **Two of these frames moved when C22 I109 landed, and they are the only two
 * in 468 golden entries** — `window-wash` in its `styles` and its `writes`
 * reading, the same scene twice. The wash now stops one column before the right
 * edge and the base owns the last cell, which is `APPEARANCE.md` §15 rule 8
 * arriving: *content stops one column before the right edge*. The three rule
 * rows and the chrome's clusters are unmoved, which is the half that says the
 * margin landed where §6l.9 put it rather than on the frame.
 *
 * **The count is the finding.** Naming the expected movers before the run
 * predicted all 45 session entries; 43 did not move, and F1227's measurement had
 * already said why — three content rows reached the last column across the whole
 * corpus, and every frame that never touches the edge cannot see a margin. The
 * measured number was right and the prediction taken from the change's *reach*
 * was wrong, which is the same lesson as F1225's on the axis next door: a corpus
 * that cannot distinguish a correct margin from a wrong one shows two frames
 * moving either way.
 *
 * **Three readings per scene, never one.** `states.test.ts` strips SGR on the
 * grounds that a snapshot carrying both the glyphs and the colours moves when
 * either does and then neither is protected. The same ruling here splits the
 * grid, the style map and the bytes into three rows that fail separately.
 */
import { describe, expect, it } from "vitest";

import { defaultTheme } from "../../src/presentation/theme/index.js";
import { readFrame, type Arm, type FrameReading, type Scene } from "../support/frame-golden.js";

const ESC = String.fromCharCode(0x1b);
/** `⌥a` — select all (C17 §5b). `⌃⇧a` is the same byte as `⌃a`, which is `home`. */
const SELECT_ALL = ESC + "a";
/** `⌃a` — line start. */
const LINE_START = String.fromCharCode(0x01);
/** `⌃j` — `insertNewline`; the wire form every terminal can send. */
const NEWLINE = "\n";
const LEFT = ESC + "[D";

/** Twelve short lines and a thirteenth, which is more rows than any prompt cap here. */
const thirteenLines = (): readonly string[] => {
  const out: string[] = [];
  for (let i = 0; i < 12; i += 1) out.push(`row${String(i)}`, NEWLINE);
  out.push("last");
  return out;
};

/** Twenty three-character lines — enough that `promptWindow`'s middle branch is reachable. */
const twentyLines = (): readonly string[] => {
  const out: string[] = [];
  for (let i = 0; i < 19; i += 1) out.push(`r${String(i).padStart(2, "0")}`, NEWLINE);
  out.push("r19");
  return out;
};

/**
 * A chrome that names the application on the upper rule (§069).
 *
 * **Header and footer are the defaults' shape and only `label` is the subject.**
 * A chrome supplying three new things would move three parts of the frame, and
 * then the label's row could not be read against the fixture without first
 * subtracting two unrelated changes.
 */
const labelledChrome = (name: string): Scene["chrome"] => ({
  header: () => [],
  footer: () => [],
  label: () => name,
});

const SCENES: Readonly<Record<string, Scene>> = {
  /** Nothing typed. The frame a session opens with, written whole from `ESC[H`. */
  boot: { columns: 80, rows: 24, drive: [] },
  /** A command in the prompt: the diff is one row, addressed. */
  typed: { columns: 80, rows: 24, drive: ["/help keys"] },
  /** The wash, over a one-row prompt. */
  selection: { columns: 80, rows: 24, drive: ["/help keys", SELECT_ALL] },
  /** A populated transcript — the mark, the gutter, the tones, a multi-row diff. */
  transcript: { columns: 80, rows: 24, drive: ["/help\r"] },
  /** Thirteen prompt rows against a cap of eight: the marker is **above**. */
  "window-tail": { columns: 60, rows: 16, drive: [...thirteenLines()] },
  /** The cursor walked back to the head: the marker is **below**. */
  "window-head": { columns: 60, rows: 16, drive: [...thirteenLines(), LEFT.repeat(40)] },
  /** Twenty rows with the cursor mid-buffer: **both** ends marked. */
  "window-both": {
    columns: 60,
    rows: 16,
    drive: [...twentyLines(), LINE_START, LEFT.repeat(36)],
  },
  /**
   * A wash inside a window — the interaction the two rules have.
   *
   * `promptWindow`'s own comment records the defect this constructs: membership
   * was tested on the *painted* index, where a marker row and a content row are
   * the same kind of number, so a selection span washed the elision marker. The
   * marker being unwashed is the only place that fix is visible.
   */
  "window-wash": { columns: 60, rows: 16, drive: [...thirteenLines(), SELECT_ALL] },

  /**
   * §069's labelled rule — **the first scene in this corpus with an
   * application's chrome**.
   *
   * `chrome.label?.(ctx)` is what `frame.ts` asks and every scene here answered
   * `null`, because none of them supplied a `chrome` at all: the prompt's upper
   * rule is bare in every frame the directory holds, so the labelled form was
   * built, wired and drawn by nothing. §069 specifies it completely — inline at
   * the end, one rule glyph to its right, painted as a **ground** rather than
   * as text, the bottom rule staying bare, one label per prompt.
   */
  label: { columns: 80, rows: 24, drive: [], chrome: labelledChrome("Calcium") },

  /**
   * The same chrome at sixty columns, where the label is **shed**.
   *
   * §069's own ordering: *at 60 columns the label drops before anything else,
   * and the frame still works* — `R-BLK-175` ranks it 1 of 4 in the whole
   * degradation order. Sixty is the narrowest width the frame draws at at all,
   * and the shed is `<=`, so this scene is the boundary rather than a width
   * below it: the three rules are here and the label is not.
   */
  "label-shed": { columns: 60, rows: 16, drive: [], chrome: labelledChrome("Calcium") },

  /**
   * The label at one bit, where it is shed for a different reason.
   *
   * There is no ground to paint with, and drawing it as plain text would put
   * the application's identity in the rule's own voice — which is the one thing
   * `R-COL-003` separates. Two sheds with two causes, and a frame showing only
   * the width one would read as though the rule had a single condition.
   */
  "label-mono": { columns: 80, rows: 24, drive: [], chrome: labelledChrome("Calcium") },
};

/** A terminal with no colour beyond the sixteen and no Unicode (C02 §3). */
const ASCII_ENV = { TERM: "xterm", LANG: "C" } as const;

/**
 * One bit, where §069's label is shed for want of a ground rather than width.
 *
 * **No environment reaches this rung, and the first draft's did not.** It read
 * `{TERM: "xterm-mono", LANG: "C.UTF-8", NO_COLOR: "1"}` and the row was named
 * `1-bit`; the frame came back at **4** — `fg 90  bg 40` in the styles grid,
 * with the label drawn rather than shed, which is the row asserting the
 * opposite of what it exists to show. `detectColourDepth`
 * (`capabilities.ts:202`) answers `1` for `dumb` or an absent `TERM` and for
 * nothing else — `NO_COLOR` is not one of its five sources and `xterm-mono`
 * falls through to the `4` default.
 *
 * **And `dumb` cannot be driven**: `unusableCause` (`session.ts:161`) refuses
 * it by name, so `readFrame` threw. The two gates between them make the rung
 * unreachable from the environment, which is why the arm takes
 * `TuiConfig.capabilities` — the app-facing override, the same door a consumer
 * pinning a rung would use. A name chosen for the rung an arm was meant to be
 * at is not a measurement of the rung it reaches.
 */
const MONO_ARM = {
  theme: "dark",
  env: { TERM: "xterm-256color", LANG: "C.UTF-8" },
  caps: { colourDepth: 1 as const },
};

/**
 * The arms each scene is drawn at.
 *
 * **`Object.keys(defaultTheme)` rather than a pair**, which is the whole of
 * F163's second instance: both theme lists in this directory are literals, and
 * a literal is what does not notice a third theme arriving.
 */
const THEMES = Object.keys(defaultTheme);

const CORPUS: readonly Readonly<{ scene: string; arm: Arm; name: string }>[] = [
  ...THEMES.flatMap((theme) =>
    ["boot", "transcript"].map((scene) => ({ scene, arm: { theme }, name: `${scene} · ${theme}` })),
  ),
  { scene: "selection", arm: { theme: "dark" }, name: "selection · dark" },
  { scene: "selection", arm: { theme: "light" }, name: "selection · light" },
  { scene: "typed", arm: { theme: "dark" }, name: "typed · dark" },
  { scene: "window-tail", arm: { theme: "dark" }, name: "window-tail · dark" },
  { scene: "window-head", arm: { theme: "dark" }, name: "window-head · dark" },
  { scene: "window-both", arm: { theme: "dark" }, name: "window-both · dark" },
  { scene: "window-wash", arm: { theme: "dark" }, name: "window-wash · dark" },
  { scene: "label", arm: { theme: "dark" }, name: "label · dark" },
  { scene: "label-shed", arm: { theme: "dark" }, name: "label-shed · dark" },
  { scene: "label-mono", arm: MONO_ARM, name: "label-mono · 1-bit" },
  { scene: "boot", arm: { theme: "dark", env: ASCII_ENV }, name: "boot · ascii" },
  { scene: "window-tail", arm: { theme: "dark", env: ASCII_ENV }, name: "window-tail · ascii" },
];

/**
 * One session per scene-arm, three rows reading it.
 *
 * Memoised rather than rebuilt per row: a session costs ~50 ms and the three
 * readings are of **one** frame — rebuilding would let the grid and the style
 * map come from different sessions, which is a way for two snapshots to agree
 * about a frame neither of them saw.
 */
const readings = new Map<string, Promise<FrameReading>>();
const reading = (name: string, scene: string, arm: Arm): Promise<FrameReading> => {
  const held = readings.get(name);
  if (held !== undefined) return held;
  const built = readFrame(SCENES[scene]!, arm);
  readings.set(name, built);
  return built;
};

describe("golden frames — a composed session, not a block", () => {
  // **The corpus's own size, derived.** A `for` over a list that has quietly
  // shrunk produces a green run with nothing in it, and the exit status is the
  // same bit for *complete* and for *did not run*.
  it("SF0: every theme in the set is drawn, and the corpus is the size it claims", () => {
    expect(THEMES.length, "themes in defaultTheme").toBeGreaterThan(2); // cells-ok — a count
    for (const theme of THEMES) {
      expect(
        CORPUS.filter((c) => c.arm.theme === theme && c.arm.env === undefined).length,
        `scenes drawn at ${theme}`,
      ).toBeGreaterThan(0); // cells-ok — a count
    }
    // Twelve fixed arms: nine, plus §069's three — `label`, `label-shed` and
    // `label-mono`, which are one subject at three rungs and not one scene.
    expect(CORPUS.length, "scene-arms").toBe(THEMES.length * 2 + 12); // cells-ok — a count
    expect(new Set(CORPUS.map((c) => c.name)).size, "names are distinct").toBe(CORPUS.length);
    expect(new Set(CORPUS.map((c) => c.scene)), "every scene is drawn").toEqual(
      new Set(Object.keys(SCENES)),
    );
  });

  for (const { scene, arm, name } of CORPUS) {
    it(`SF1 · ${name} — the grid`, async () => {
      expect((await reading(name, scene, arm)).text).toMatchSnapshot();
    });

    it(`SF2 · ${name} — the styles`, async () => {
      expect((await reading(name, scene, arm)).styles).toMatchSnapshot();
    });

    it(`SF3 · ${name} — the bytes`, async () => {
      expect((await reading(name, scene, arm)).writes).toMatchSnapshot();
    });
  }
});
