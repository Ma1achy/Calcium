// C04 §5c and C09 §7e — the trail's band at the head of a streaming run.
//
// **The band is what a terminal can afford.** §026 rules out a per-character
// fade over time and a glyph rising into its cell, both by cost; what is left
// is a fixed band whose cost is its width and not the reply's length.
import { describe, expect, it } from "vitest";

import { validateDocument, TRAIL_FORMS } from "../../src/data/viewmodel/index.js";
import type { Block, Notice } from "../../src/data/viewmodel/index.js";
import { OneShots } from "../../src/shell/one-shots.js";
import { measurable, visible, FULL_CAPS, DARK_THEME, ASCII_CAPS as ASCII_CAPS_ROW, MONO_UNICODE_CAPS as MONO_UNICODE_CAPS_ROW } from "../support/render.js";
import { cells, truncate } from "../../src/presentation/text.js";
import { capabilities } from "../support/fake-terminal.js";
import { spinnerFrames } from "../../src/presentation/blocks/glyphs.js";
import { background, slot, tone as toneStyle } from "../../src/presentation/blocks/paint.js";
import { sgr } from "../../src/terminal/escapes.js";

/** The SGR parameters a style resolves to, as `styled-screen` records them. */
const sgrParams = (style: Parameters<typeof sgr>[0]): string =>
  sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");
import { tickIntervalOf } from "../../src/presentation/blocks/index.js";
import { applySgr, styledScreenFrom, washRuns, type CellStyle } from "../support/styled-screen.js";
import { rampStyle, resolveTone } from "../../src/presentation/theme/index.js";
import { nearestAnsi256 } from "../../src/presentation/theme/colormap.js";
import type { Ramp, Tone } from "../../src/data/viewmodel/index.js";
import { graphemes } from "../../src/presentation/text.js";

const ESC = String.fromCharCode(27);

/** C09 §7e's band width, restated here so the row reads without the source. */
const TRAIL_CELLS = 14;

/**
 * The visible text of `bytes[0, i)`, with an incomplete escape trimmed off.
 *
 * **A byte-wise common prefix can stop inside a sequence**, and `visible`
 * strips only complete ones — so the leftover `38;2;2` read as text and the
 * empty case failed. Trimmed back to the escape only when the cut is inside
 * one, because cutting back at every escape would swallow the text before it.
 */
const safePrefix = (bytes: string, i: number): string => {
  const esc = bytes.lastIndexOf(ESC, i - 1);
  if (esc < 0) return visible(bytes.slice(0, i));
  const closed = /[a-zA-Z]/u.test(bytes.slice(esc, i));
  return visible(bytes.slice(0, closed ? i : esc));
};

const notice = (over: Partial<Notice> = {}): Notice =>
  ({ kind: "notice", id: "n", tone: "default", text: "the parser tracks quotes", ...over }) as Notice;

/** A complete envelope, so a legal block gives an empty list rather than nine. */
const doc = (b: unknown): unknown => ({
  schema: "tui.view/1",
  command: "x",
  status: "ok",
  meta: {
    verb: null,
    adapter: "test",
    stderr: "",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [],
    transport: "local",
    origin: "user",
  },
  blocks: [b],
});
const errorsOf = (b: unknown): readonly string[] => {
  const r = validateDocument(doc(b) as never) as { ok: boolean; error?: readonly string[] };
  return r.ok ? [] : (r.error ?? []);
};

/** The rendered rows, with SGR kept — a trail is only visible in the bytes. */
const bytesOf = (b: Notice, width = 40, caps = FULL_CAPS): string =>
  measurable({ capabilities: caps }).renderToLines(b as never, width).join("\n");
const plainOf = (b: Notice, width = 40, caps = FULL_CAPS): string =>
  visible(bytesOf(b, width, caps));

/**
 * A visible line with the agent's head mark taken off the end (C09 I101).
 *
 * **The rows below compare a streaming block against a settled one**, and the
 * mark is a second difference between the two — so without this they fail for
 * the mark rather than for the band, which is a different claim. Stripping it
 * keeps each row on its own subject. It refuses to strip anything that is not a
 * frame of the set, so a row cannot quietly lose a character of text.
 */
const withoutMark = (line: string, caps = FULL_CAPS): string => {
  const trimmed = line.replace(/\s+$/u, "");
  const tail = trimmed.slice(-1);
  if (!spinnerFrames(caps, "agent").includes(tail)) return line;
  return trimmed.slice(0, -1).replace(/\s+$/u, ""); // cells-ok — a code-unit slice
};

/**
 * The rendered rows as a styled grid, so a cell can be asked for its colour.
 *
 * **A substring search answers neither half of the claim.** The mark is a
 * colour at a position, and `indexOf` gives a code-unit offset into a string
 * that is mostly escapes — it says nothing about which column the frame
 * landed in and nothing about the tone it took.
 */
/** A tone's 24-bit hex in the dark theme — the ends a trail's ramp is mixed between. */
const hexOf = (tone: Tone): string => {
  const c = resolveTone(tone, DARK_THEME, { colourDepth: 24 }).colour;
  return c !== undefined && c.kind === "rgb" ? c.hex : "#000000";
};
/** `#rrggbb` → the `fg` a styled cell records for it. */
const fgOf = (hex: string): string =>
  `38;2;${String(Number.parseInt(hex.slice(1, 3), 16))};${String(Number.parseInt(hex.slice(3, 5), 16))};${String(Number.parseInt(hex.slice(5, 7), 16))}`;
/** Each channel ×`f`, clamped at 255 — §026's lift, restated so the row reads without the source. */
const liftFg = (fg: string, f: number): string =>
  fg.split(";").map((v, i) => (i < 2 ? v : String(Math.min(255, Math.round(Number(v) * f))))).join(";");

/**
 * The rendered row as clusters with their style — **by grapheme, not by code
 * unit**, because the rows it reads carry combining marks, families and flags,
 * which `styledScreenFrom`'s one-index-per-cell model splits (C09 I134).
 */
const clustersOf = (b: Notice, width = 40): readonly { g: string; style: CellStyle }[] => {
  const line = measurable({ capabilities: FULL_CAPS }).renderToLines(b as never, width)[0] ?? "";
  const out: { g: string; style: CellStyle }[] = [];
  let style: CellStyle = { fg: "", bg: "", attrs: [] };
  for (const piece of line.split(/(\u001b\[[0-9;]*m)/u)) {
    const sgrMatch = /^\u001b\[([0-9;]*)m$/u.exec(piece);
    if (sgrMatch !== null) {
      style = applySgr(style, sgrMatch[1] === "" ? [0] : sgrMatch[1]!.split(";").map(Number));
      continue;
    }
    for (const g of graphemes(piece)) out.push({ g, style });
  }
  return out;
};
/** The clusters of `text` in the row, in order — or a failure naming what the row drew instead. */
const textClusters = (b: Notice, width = 40): readonly { g: string; style: CellStyle }[] => {
  const all = clustersOf(b, width);
  const want = graphemes(b.text);
  for (let k = 0; k + want.length <= all.length; k += 1) {
    if (want.every((g, i) => all[k + i]!.g === g)) return all.slice(k, k + want.length);
  }
  throw new Error(`the row does not hold the text whole: ${JSON.stringify(all.map((c) => c.g).join(""))}`);
};

const gridOf = (b: Notice, width = 40, caps = FULL_CAPS, tick?: number) => {
  const kit = measurable({ capabilities: caps, ...(tick === undefined ? {} : { tick }) });
  const lines = kit.renderToLines(b as never, width);
  return styledScreenFrom(lines.map((l, i) => (i === 0 ? l : `\r\n${l}`)), {
    columns: width,
    rows: lines.length,
  });
};

describe("C04 §5c — the fact on the block", () => {
  it("T1.46 (C04 I122, §5c): `streaming` and `trail` pass the gate, and a wrong type does not", () => {
    expect(errorsOf(notice()), "the envelope itself is complete").toEqual([]);
    expect(errorsOf(notice({ streaming: true, trail: "hue" })), "the two fields are legal").toEqual([]);
    expect(
      errorsOf(notice({ streaming: "yes" as never })).some((e) => e.includes("C04 I122")),
      "a non-boolean `streaming` is refused",
    ).toBe(true);
  });

  it("T1.47 (C04 I123, §5c): `trail` with no `streaming` means nothing, and an unknown form is refused", () => {
    // **A settled block has no head**, so the pairing is legal and draws
    // nothing — asserted as the rendered rows, not only as validity.
    expect(errorsOf(notice({ trail: "ripple" })), "a trail with no stream is legal").toEqual([]);
    expect(bytesOf(notice({ trail: "ripple" })), "and it draws nothing").toBe(bytesOf(notice()));

    // **Refused rather than defaulted.** A misspelled form drawn as `hotEdge`
    // leaves the document saying one thing and the screen showing another, with
    // nothing reporting the disagreement.
    expect(
      errorsOf(notice({ streaming: true, trail: "hotedge" as never })).some((e) => e.includes("C04 I123")),
      "a misspelled form is refused, not defaulted",
    ).toBe(true);
    for (const form of TRAIL_FORMS) {
      expect(errorsOf(notice({ streaming: true, trail: form })), `${form} is in the union`).toEqual([]);
    }
  });
});

describe("C09 §7e — the band", () => {
  /**
   * Where the band begins, read as the text the two arms still agree on.
   *
   * **A row asserting only that the bytes differ cannot see the unit.** Counted
   * in characters rather than cells, the band is still a band and the bytes
   * still differ — a mutation swapping the two survived exactly that row. The
   * common byte prefix is where the styling first diverges, and its visible
   * text is the part of the line the band did **not** reach.
   */
  const untrailed = (b: Notice, width = 40): string => {
    const a = bytesOf(b, width);
    const bare = bytesOf({ ...b, streaming: false } as Notice, width);
    let i = 0;
    while (i < a.length && i < bare.length && a[i] === bare[i]) i += 1;
    return safePrefix(a, i);
  };

  it("T1.54 (C09 I90, §7e): the band is the last fourteen cells, not the last fourteen characters", () => {
    // **A line ending in wide clusters is what separates the two units**:
    // fourteen cells is the seven `字`, and fourteen *characters* would take the
    // seven, the space and six letters before them.
    expect(
      untrailed(notice({ text: "abcdefghij 字字字字字字字", streaming: true })),
      "fourteen cells, seven wide clusters",
    ).toBe("abcdefghij ");

    // And on a narrow alphabet the two units coincide, which is why the row
    // above needs the wide one — this arm only shows the band is fourteen of
    // something.
    expect(untrailed(notice({ text: "abcdefghijklmnopqrstu", streaming: true })), "fourteen cells of narrow text").toBe("abcdefg");

    // A text shorter than the band takes all of it and reaches no further.
    const tiny = notice({ text: "ab", streaming: true });
    // **The mark is stripped, not ignored** (C09 I101): a streaming block carries
    // one and this row is about the band, so the difference is removed by name
    // rather than by loosening the comparison.
    expect(withoutMark(plainOf(tiny)), "the text is intact").toBe(plainOf(notice({ text: "ab" })).trimEnd());
    expect(untrailed(tiny), "the whole text is the band").toBe("");
  });

  it("T1.76 (C09 I90, §7e): a band longer than the last wrapped row continues on the row above", () => {
    // Seventeen cells and nine at width 20, and the same with or without the
    // mark's two reserved cells — so the two arms `untrailed` compares wrap
    // alike and differ only in style.
    const b = notice({ text: "aaa bbb ccc ddddd eeeee fff", streaming: true });
    const rows = withoutMark(plainOf(b, 20)).split("\n").map((r) => r.trimEnd());
    expect(rows, "the fixture wraps where the row says").toEqual(["aaa bbb ccc ddddd", "eeeee fff"]);

    // **The nine of the last row and the last five of the row above.** A band
    // stopping at the last row leaves `aaa bbb ccc ddddd` untouched, which is
    // the derivation this replaced.
    expect(untrailed(b, 20)).toBe("aaa bbb ccc ");

    // **One gradient across the break, not one per row**: the newest character
    // is accent on the second row, which a ramp restarted at the break would
    // leave short of its end.
    const grid = gridOf(b, 20);
    const newest = grid[1]!.filter((c) => c.ch === "f").at(-1)!;
    const accent = gridOf(notice({ text: "x", tone: "accent" }))[0]![0]!.style.fg;
    expect(newest.style.fg, "the head across a wrap is the lifted accent (C09 I133)").toBe(liftFg(accent, 1.35));
  });

  it("T1.77 (C09 I90, §7e, §026): the head is the hot end of the band", () => {
    // §026's figure: `d = (head − i) / trail`, accent where the text arrives
    // and cooling behind it. Twenty-one narrow cells, so the band is the last
    // fourteen — `h` its oldest and `u` its newest.
    const row = gridOf(notice({ text: "abcdefghijklmnopqrstu", streaming: true, trail: "hotEdge" }))[0]!;
    const at = (ch: string) => row.find((c) => c.ch === ch)!;
    const accent = gridOf(notice({ text: "x", tone: "accent" }))[0]![0]!.style.fg;
    expect(at("u").style.fg, "the newest character is the accent lifted ×1.35 (C09 I133)").toBe(liftFg(accent, 1.35));
    expect(at("h").style.fg, "and the band's oldest is not").not.toBe(accent);
    // **The control: outside the band the text is its own ink**, so the two
    // reads above are about the band and not about the whole row being accent.
    expect(at("a").style.fg, "a cell before the band").not.toBe(accent);
  });

  it("T1.55 (C09 I90, §7e, R-BLK-198): chrome is never in the band, at any width", () => {
    // **A header has no position in the stream, so it exists complete or not at
    // all.** The band is derived over the wrapped *text* and the glyph is
    // prepended afterwards, so the mark's cells cannot be styled by the trail.
    //
    // **The case that separates it is a band covering the whole text**: with
    // two cells of text and a three-cell band there is nothing the band could
    // stop at, so a derivation measuring over the prefix would reach the mark.
    for (const [width, text] of [[40, "ab"], [40, "the parser tracks quotes"], [12, "ab"]] as const) {
      const marked = notice({ glyph: "work-unit", state: "running", text, streaming: true });
      const bare = notice({ glyph: "work-unit", state: "running", text });
      const a = bytesOf(marked, width);
      const b = bytesOf(bare, width);
      expect(withoutMark(visible(a)), `the text at ${String(width)} is unchanged`).toBe(visible(b).trimEnd());
      // The mark is drawn, or the row is asserting nothing about it.
      expect(visible(b).trimStart().length, `the mark exists at ${String(width)}`).toBeGreaterThan(0);
      // **The agreed prefix covers the mark.** Where the styling first diverges
      // is inside the text, never at or before the glyph lead.
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
      const agreed = safePrefix(a, i);
      expect(agreed.length, `the band starts after the mark at ${String(width)}`).toBeGreaterThanOrEqual(2);

      // **And it starts exactly where the band's own width puts it**, which is
      // the half the bound above cannot say. A derivation that measures over
      // the glyph's cells as well as the text's still begins after the mark —
      // it begins *later*, with a band short by the lead — so a one-sided
      // assertion is satisfied by the defect it was written against. The tail
      // left over is the band, and it is `TRAIL_CELLS` wide or the whole text.
      const rest = visible(b).slice(agreed.length).trimEnd();
      expect(
        cells(rest, "narrow"),
        `the band is the text's last ${String(TRAIL_CELLS)} cells at ${String(width)}`,
      ).toBe(Math.min(TRAIL_CELLS, cells(text, "narrow")));
    }
  });

  it("T1.56 (C09 I90, C04 I123, §7e): the target is the run's own ink, not a fixed colour", () => {
    // **Inside the band, where the target is the only difference.** The two
    // rows below compare whole frames, and since C09 I133 gave hotEdge its lift
    // and hue none, the second differs at the head whatever the target — a
    // fixed target survived it. `x y` is all band, so every cell is a ramp
    // sample and the run's tone reaches the bytes only through `from`.
    const band = (over: Partial<Notice>) => textClusters(notice({ text: "x y", streaming: true, trail: "hotEdge", ...over }));
    const dimBand = band({ spans: [{ from: 0, to: 3, tone: "dim" }] } as Partial<Notice>);
    const plainBand = band({});
    expect(dimBand[0]!.style.fg, "the oldest cell cools toward dim, not toward the body").not.toBe(plainBand[0]!.style.fg);

    // **Two documents one field apart.** A fixed target passes any row that only
    // asks whether a ramp is present, so the arms differ by the run's tone
    // alone — `R-BLK-196`'s dim reasoning block, whose trail must cool to dim.
    const spans = [{ from: 0, to: 24, tone: "dim" as const }];
    const dim = notice({ text: "the parser tracks quotes", spans, streaming: true });
    const plain = notice({ text: "the parser tracks quotes", streaming: true });
    expect(bytesOf(dim), "a dim run's trail is not the body's").not.toBe(bytesOf(plain));

    // **`hue` cools to the body tone and `hotEdge` to the run's**, which is the
    // whole difference between them — they coincide when the run has no ink of
    // its own and separate the moment it does.
    expect(
      bytesOf(notice({ text: "x y", spans: [{ from: 0, to: 3, tone: "dim" }], streaming: true, trail: "hue" })),
      "hue and hotEdge differ on a run with its own ink",
    ).not.toBe(
      bytesOf(notice({ text: "x y", spans: [{ from: 0, to: 3, tone: "dim" }], streaming: true, trail: "hotEdge" })),
    );
  });

  it("T1.57 (C09 I90, I101, §7e): a trail costs no rows, and the render is what measure said", () => {
    // **The settled block is no longer the control, and I101 is why.** A
    // streaming block reserves the mark's two cells, so it wraps where a settled
    // one does not — the old row compared two different wraps and the *no cell
    // moves* half would now be asserting that the reservation did not happen.
    //
    // What it was holding is the measurement invariant, the one carve-out the
    // design does not override, and that is asserted directly against the
    // render. *The trail costs nothing* is the five forms agreeing with each
    // other, which is the claim I90 actually makes.
    const kit = measurable();
    const text = "the parser tracks quotes with a single boolean";
    for (const width of [60, 40, 20, 10]) {
      const counts = TRAIL_FORMS.map((form) => {
        const b = notice({ text, streaming: true, trail: form });
        const drawn = kit.renderToLines(b as never, width);
        // Geometry never moves with appearance: what `measure` promised is what
        // the frame took.
        expect(kit.measure(b as never, width), `${form} at ${String(width)}: measure is the render`).toBe(
          drawn.length,
        );
        return kit.measure(b as never, width);
      });
      expect(new Set(counts).size, `at ${String(width)} the five forms cost the same`).toBe(1);
    }
  });

  it("T1.58 (C09 I91, I101, §7e): at 1-bit `weight` is bold, the other four draw nothing, and the mark survives", () => {
    const mono = capabilities({ colourDepth: 1 });
    const text = "the parser tracks quotes";
    const drawn = new Map(
      TRAIL_FORMS.map((form) => [form, bytesOf(notice({ text, streaming: true, trail: form }), 40, mono)]),
    );

    // **The four compared to each other, which is what *nothing* means here.**
    // The settled block stopped being the reference when the mark landed — it
    // survives 1-bit (C09 I101) and so does its reservation — so a row against it
    // would fail for the mark rather than for the trail.
    const quiet = TRAIL_FORMS.filter((f) => f !== "weight");
    const first = drawn.get(quiet[0]!);
    for (const form of quiet) {
      expect(drawn.get(form), `${form} draws nothing at 1-bit`).toBe(first);
    }
    // Bold is SGR 1, and it is the only thing a 1-bit terminal has.
    expect(drawn.get("weight"), "weight is bold").toContain(`${ESC}[1m`);
    expect(drawn.get("weight"), "and it is a change").not.toBe(first);

    // **The other half, separated rather than standing in for the first**: at
    // 1-bit a streaming block differs from a settled one, and it differs by the
    // mark. Both halves would be one assertion under the old reference.
    const bare = bytesOf(notice({ text }), 40, mono);
    expect(first, "the mark survives 1-bit").not.toBe(bare);
    const marks = spinnerFrames(mono, "agent");
    expect(marks.includes(visible(first ?? "").trimEnd().slice(-1)), "and the difference is a frame of it").toBe(true);
  });
});

describe("C09 §7e / §026 — the mark at the head", () => {
  const MARK_TEXT = "the parser tracks quotes with a single boolean, which is why";


  it("T1.63 (C09 I101, §026 R-BLK-182): the mark is a frame of the agent set, one space past the head, in accent", () => {
    const b = notice({ text: MARK_TEXT, streaming: true });
    const grid = gridOf(b);
    const last = grid[grid.length - 1]!;
    const plain = last.map((c) => c.ch).join("");
    const head = plain.trimEnd().length - 1; // cells-ok — a column index

    const frames = spinnerFrames(FULL_CAPS, "agent");
    const mark = last[head]!;
    expect(frames.includes(mark.ch), `cell ${String(head)} holds ${JSON.stringify(mark.ch)}, an agent frame`).toBe(
      true,
    );
    // **One space, not zero and not two**: the cell before the mark is blank and
    // the one before that is the last character that arrived.
    expect(last[head - 1]!.ch, "one space between the text and the mark").toBe(" ");
    expect(last[head - 2]!.ch, "and the character before it is the head of the stream").not.toBe(" ");

    // **The tone, read against a reference rather than against a literal.** An
    // `accent` notice's own text is what accent looks like in this theme, so a
    // theme change moves both sides together.
    const ref = gridOf(notice({ text: "x", tone: "accent" }));
    expect(mark.style.fg, "the mark is accent").toBe(ref[0]![0]!.style.fg);

    // The control: settled, and the cell holds nothing.
    const settled = gridOf(notice({ text: MARK_TEXT }));
    const tail = settled[settled.length - 1]!.map((c) => c.ch).join("").trimEnd();
    expect(frames.includes(tail.slice(-1)), "a settled notice draws no mark").toBe(false);

    // **The frame advances and the column does not** — which is the whole of
    // *appearance animates, geometry never does* at this seam.
    const moved = gridOf(b, 40, FULL_CAPS, 7);
    const movedLast = moved[moved.length - 1]!;
    expect(movedLast[head]!.ch, "the tick moved the frame").not.toBe(mark.ch);
    expect(frames.includes(movedLast[head]!.ch), "and it is still a frame of the same set").toBe(true);
    expect(movedLast[head - 1]!.ch, "and the column did not move").toBe(" ");
  });

  it("T1.64 (C09 I101, C04 I122, R-BLK-188): the cells are reserved, and a settled notice reserves nothing", () => {
    const kit = measurable();
    for (let width = 8; width <= 60; width += 1) { // cells-ok — a width sweep
      const b = notice({ text: MARK_TEXT, streaming: true });
      const drawn = kit.renderToLines(b as never, width);
      expect(kit.measure(b as never, width), `streaming at ${String(width)}: measure is the render`).toBe(
        drawn.length,
      );
      // **The width is the half that fires first**, because a row over the frame
      // is what the compositor wraps and the row count is what `measure` then
      // gets wrong. Asserted per row, not on the total.
      for (const line of drawn) {
        expect(cells(visible(line)), `no row overruns ${String(width)}`).toBeLessThanOrEqual(width);
      }
      const settled = notice({ text: MARK_TEXT });
      expect(kit.measure(settled as never, width), `settled at ${String(width)}: measure is the render`).toBe(
        kit.renderToLines(settled as never, width).length,
      );
    }
  });

  it("T1.65 (C09 I101, C03 I8): a streaming notice asks for the agent set's cadence, and a settled one for nothing", () => {
    const b = notice({ text: MARK_TEXT, streaming: true });
    const settled = notice({ text: MARK_TEXT });
    // **The premise, asserted rather than assumed.** `notice` is `false` in
    // `ANIMATES`, so a row checking only *some interval* would have passed on
    // the day neither carrier ticked — which is the day this clause repaired.
    expect(tickIntervalOf(settled as never), "a settled notice does not animate").toBeNull();
    expect(tickIntervalOf(b as never), "a streaming one does").not.toBeNull();
  });
});

describe("C09 §073 — the button's three rungs", () => {
  const BTN = { kind: "notice", id: "btn", tone: "default", text: "Approve", action: { kind: "activate", id: "a" } };
  const button = (over: object = {}) => ({ ...BTN, ...over }) as unknown as Notice;
  const FOCUS = { blockId: "btn", rowId: "btn" };
  const MONO = capabilities({ colourDepth: 1 });
  const ASCII = capabilities({ unicode: "ascii" });

  const gridOf = (b: Notice, caps = FULL_CAPS, focus?: unknown, width = 40) => {
    const kit = measurable({ capabilities: caps, ...(focus === undefined ? {} : { focus }) } as never);
    const lines = kit.renderToLines(b as never, width);
    return styledScreenFrom(lines.map((l, i) => (i === 0 ? l : `\r\n${l}`)), { columns: width, rows: lines.length });
  };
  /** The first row's painted run: its text, its ink and its attributes. */
  const runOf = (grid: readonly (readonly { ch: string; style: { fg: string; bg: string; attrs: readonly number[] } }[])[]) => {
    const row = grid[0]!;
    const cellsOn = row.filter((c) => c.style.bg !== "");
    return {
      text: row.map((c) => c.ch).join("").replace(/\s+$/u, ""),
      painted: cellsOn.map((c) => c.ch).join(""),
      fg: cellsOn[0]?.style.fg ?? "",
      bg: cellsOn[0]?.style.bg ?? "",
      bold: cellsOn[0]?.style.attrs.includes(1) ?? false,
    };
  };

  it("T1.66 (C09 I102, §073, C10 I51): resting is bgElev padded, focused is pick/pickInk bold with › inside, and no ground gives brackets", () => {
    const resting = runOf(gridOf(button()));
    // **Two cells wider than the label, one either side** — a ground flush to
    // the glyphs says *these letters* are the surface, not the button.
    expect(resting.painted, "the ground is the label plus one cell either side").toBe(" Approve ");

    const focused = runOf(gridOf(button(), FULL_CAPS, FOCUS));
    expect(focused.painted, "› is INSIDE the ground, not before it").toBe(" › Approve ");
    expect(focused.bold, "the chosen pair is bold").toBe(true);
    // **Absolutely, not relatively** — and the mutation pass is what said so.
    // The first form of these two asserted only *not the resting ground* and
    // *not the resting ink*, which `focusGround` satisfies exactly: the mutation
    // putting the focused button back on the region's ground **survived**. Not-X
    // is met by every wrong answer. So the values come from the theme, which
    // also means a theme change moves both sides together rather than a hex here.
    expect(focused.bg, "focused takes `pick`").toBe(
      sgrParams(background("surface.pick", DARK_THEME, FULL_CAPS)),
    );
    expect(focused.fg, "with `pickInk`, which is why the slot exists").toBe(
      sgrParams(slot("surface.pickInk", DARK_THEME, FULL_CAPS)),
    );
    expect(resting.bg, "and resting is `bgElev`").toBe(
      sgrParams(background("surface.bgElev", DARK_THEME, FULL_CAPS)),
    );

    for (const [caps, why] of [[MONO, "1-bit"], [ASCII, "ascii"]] as const) {
      const b = runOf(gridOf(button(), caps));
      expect(b.text, `${why} draws brackets`).toBe("[ Approve ]");
      expect(b.painted, `${why} paints no cell`).toBe("");
    }

    // **The control, and it is what makes every line above mean something**: the
    // same notice with no `action` draws bare text at every rung, so a renderer
    // that painted every notice would fail here rather than pass the assertions.
    for (const caps of [FULL_CAPS, MONO, ASCII]) {
      const plain = runOf(gridOf(button({ action: undefined }), caps));
      expect(plain.text, "a notice with no action is bare text").toBe("Approve");
      expect(plain.painted, "and takes no ground").toBe("");
    }
  });

  it("T1.67 (C09 I102, C09 I2, C04 I122, §073): the chrome is reserved, and the reservation is the same at every rung", () => {
    const kit = measurable();
    const b = button({ text: "Approve this change to the parser" });
    for (let width = 8; width <= 60; width += 1) { // cells-ok — a width sweep
      // **One `measure` answers for every rung, which is the assertion.** A
      // budget that varied with the rung would be `measure` reading a theme,
      // and `measure(block, width)` cannot see one (I2).
      const promised = kit.measure(b as never, width);
      for (const caps of [FULL_CAPS, MONO, ASCII]) {
        const drawn = measurable({ capabilities: caps }).renderToLines(b as never, width);
        expect(drawn.length, `rows at ${String(width)} match the one measure`).toBe(promised);
        for (const line of drawn) {
          expect(cells(visible(line)), `no row overruns ${String(width)}`).toBeLessThanOrEqual(width);
        }
      }
    }
  });

  it("T1.68 (C09 I102, C09 I47, §073): a call head is not a button", () => {
    // `declaresElement` is true for both, so this is the row that says the
    // predicate is `action` — a head stands in the ring without being pressed.
    // **It carries BOTH, and that is the whole row** — the mutation pass is what
    // said so. The first fixture here had `state` and no `action`, so the
    // mutation that drops the predicate's `isCallHead` half could not reach it
    // and **survived**: a block with no action is not a button either way. A
    // tool-call header is the real subject — it heads a call *and* offers a
    // retry — and it is the only shape that tells the two halves apart.
    //
    // `glyph: "step"` is gone: M4 retired the slot and a head's mark resolves
    // from `state` (I45).
    const head = button({ state: "running" });
    const grid = gridOf(head as Notice);
    expect(grid[0]!.some((c) => c.style.bg !== ""), "a call head takes no ground").toBe(false);
    expect(runOf(gridOf(button())).painted, "and the same notice with an action does").not.toBe("");
  });

  /** A `pills` row of three answers, as the confirm host draws them (C23 I104). */
  const ROW = (over: object = {}): Block =>
    ({
      kind: "pills",
      id: "row",
      buttons: true,
      chips: [{ label: "approve" }, { label: "deny" }, { label: "show full diff" }],
      ...over,
    }) as unknown as Block;
  const rowGrid = (b: Block, caps = FULL_CAPS, focus?: unknown, width = 60) => {
    const kit = measurable({ capabilities: caps, ...(focus === undefined ? {} : { focus }) } as never);
    const lines = kit.renderToLines(b, width);
    return styledScreenFrom(lines.map((l, i) => (i === 0 ? l : `\r\n${l}`)), { columns: width, rows: lines.length });
  };
  const washes = washRuns;
  const rowText = (grid: ReturnType<typeof rowGrid>, row = 0): string =>
    (grid[row] ?? []).map((c) => c.ch).join("").replace(/\s+$/u, "");
  const ON = { blockId: "row", rowId: "chip-1" };

  it("T1.153 (C09 I139, I102, C04 I151, §073): a pills row of buttons — the three rungs by cell, and whole chips wrapping with every label drawn", () => {
    // **Ground rung.** The chip the focus names is `pick` with `pickInk`, bold, `›`
    // inside the ground; the others are `bgElev`, a cell either side of the label.
    const grid = rowGrid(ROW(), FULL_CAPS, ON);
    const runs = washes(grid);
    expect(runs.map((r) => r.text), "the chips are the labels with one cell either side, and `›` inside the focused one").toEqual([
      " approve ",
      " › deny ",
      " show full diff ",
    ]);
    expect(runs[1]!.bg, "the focused chip takes `pick`").toBe(sgrParams(background("surface.pick", DARK_THEME, FULL_CAPS)));
    expect(runs[1]!.fg, "with `pickInk`").toBe(sgrParams(slot("surface.pickInk", DARK_THEME, FULL_CAPS)));
    expect(runs[1]!.attrs, "bold").toContain(1);
    expect(runs[0]!.bg, "the others are `bgElev`").toBe(sgrParams(background("surface.bgElev", DARK_THEME, FULL_CAPS)));
    expect(runs[2]!.bg).toBe(runs[0]!.bg);
    expect(rowText(grid), "two cells between the washes — each wash is padded, so four between the labels").toBe(" approve    › deny    show full diff");

    // **With no focus on the block every chip is at rest** — the focus is the
    // render's and a block naming another id selects nothing.
    expect(washes(rowGrid(ROW(), FULL_CAPS, { blockId: "other", rowId: "chip-1" })).map((r) => r.text)).toEqual([
      " approve ",
      " deny ",
      " show full diff ",
    ]);

    // **ASCII**: every chip bracketed, and no `›`.
    expect(rowText(rowGrid(ROW(), ASCII_CAPS_ROW, ON))).toBe("[ approve ]  [ deny ]  [ show full diff ]");

    // **1-bit with Unicode** — the rung the claim is about: brackets, and the
    // focused chip alone inverse. `›` has no place in a bracketed chip.
    const mono = rowGrid(ROW(), MONO_UNICODE_CAPS_ROW, ON);
    expect(rowText(mono)).toBe("[ approve ]  [ deny ]  [ show full diff ]");
    const inverse = (grid: ReturnType<typeof rowGrid>): string[] => {
      const out: string[] = [];
      let cur = "";
      for (const c of grid[0] ?? []) {
        if (c.style.attrs.includes(7)) cur += c.ch;
        else if (cur !== "") {
          out.push(cur);
          cur = "";
        }
      }
      return cur === "" ? out : [...out, cur];
    };
    expect(inverse(mono), "at 1-bit one chip is inverse, and it is the focused one").toEqual(["[ deny ]"]);

    // **A chip's tone is the button's ink at rest** — the destructive pair §073
    // draws, green to go and red to stop. Without this row a button that ignored
    // its chip's tone would pass every assertion above.
    const toned = washes(rowGrid(ROW({ chips: [{ label: "approve", tone: "ok" }, { label: "deny" }] }), FULL_CAPS));
    expect(toned[0]!.fg, "the toned chip's ink is its tone").toBe(
      sgrParams(toneStyle("ok", DARK_THEME, FULL_CAPS, "bgElev")),
    );
    expect(toned[1]!.fg, "and an untoned one is the default ink").toBe(
      sgrParams(toneStyle("default", DARK_THEME, FULL_CAPS, "bgElev")),
    );
    expect(toned[0]!.fg, "which is a different ink").not.toBe(toned[1]!.fg);

    // **The control**: the same chips without `buttons` are chips at every rung.
    const chips = rowGrid(ROW({ buttons: undefined }), ASCII_CAPS_ROW, ON);
    expect(rowText(chips), "no brackets").toBe("approve  deny  show full diff");
    expect(washes(rowGrid(ROW({ buttons: undefined }), FULL_CAPS)), "and no ground at rest").toEqual([]);
  });

  it("T1.153b (C09 I139, I2, C04 I151, I20): whole chips wrap, none is shed, and measure is the rows rendered at every width", () => {
    // Sizes are `label + 4`: 11, 8 and 18 with two gaps of two — 41 cells.
    const kit = measurable();
    expect(kit.measure(ROW(), 41), "fits in one row at 41").toBe(1);
    expect(kit.measure(ROW(), 40), "one cell short, the third wraps").toBe(2);
    const wrapped = rowGrid(ROW(), FULL_CAPS, undefined, 40);
    expect(rowText(wrapped, 0), "two chips on the first row").toBe(" approve    deny");
    expect(rowText(wrapped, 1), "and the third whole on the second").toBe(" show full diff");

    // From the widest chip: a chip wider than the row is clamped to it (`pillsDefinition`), which is
    // the kind's own limit and not this form's.
    for (let width = 18; width <= 60; width += 1) { // cells-ok — a width sweep
      const promised = kit.measure(ROW(), width);
      for (const caps of [FULL_CAPS, ASCII_CAPS_ROW, MONO_UNICODE_CAPS_ROW]) {
        const drawn = measurable({ capabilities: caps }).renderToLines(ROW(), width);
        expect(drawn.length, `rows at ${String(width)} match the one measure`).toBe(promised);
        const text = drawn.map(visible).join("\n");
        for (const label of ["approve", "deny", "show full diff"]) {
          expect(text, `"${label}" is drawn at ${String(width)}`).toContain(label);
        }
        for (const line of drawn) expect(cells(visible(line)), `no row overruns ${String(width)}`).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("C09 §099 — an elided run shortens from its middle", () => {
  const PATH = "src/integration/parser/parse.ts";
  const CAPS = { unicode: "full" as const, ambiguousWidth: "narrow" as const };

  it("T1.69 (C09 I103, §099, C09 I79): the cut keeps the head AND the tail, which is what an end-cut does not", () => {
    for (const w of [29, 21, 11, 8, 5]) {
      const out = truncate(PATH, w, CAPS, "middle");
      expect(cells(out), `${String(w)}: exactly the budget`).toBe(w);
      const [head, tail] = out.split("…") as [string, string];
      // **The tail is the assertion that separates this from the defect.** An
      // end-cut answer is also exactly the budget and also begins with the
      // path's head, so a row checking only those passes under `"end"`.
      expect(PATH.startsWith(head.trimEnd()), `${String(w)}: the head is the path's head`).toBe(true);
      expect(PATH.endsWith(tail.trimStart()), `${String(w)}: the tail is the path's own tail`).toBe(true);
      expect(tail.trim().length, `${String(w)}: there IS a tail`).toBeGreaterThan(0);
    }
    // The control: short enough to fit is byte-identical, marker and all.
    expect(truncate(PATH, 60, CAPS, "middle"), "no cut when it fits").toBe(PATH);
    // And the old behaviour is a different answer, so the row can tell them apart.
    expect(truncate(PATH, 21, CAPS, "middle")).not.toBe(truncate(PATH, 21, CAPS, "end"));

    // **Through the fitter, not only the function** — the mutation pass is what
    // said so. Everything above calls `truncate` directly, so the mutation
    // pointing `fitRuns` back at `"end"` **survived**: the mechanism was tested
    // and the wiring was not. This arm renders a block with an `elide` span, the
    // shape `callHead` writes, and asks the frame.
    const head = "read_file(";
    const text = `${head}${PATH})`;
    const elided = {
      kind: "notice",
      id: "e",
      tone: "default",
      glyph: "work-unit",
      state: "running",
      text,
      spans: [{ from: head.length, to: head.length + PATH.length, elide: true }],
    } as unknown as Notice;
    const drawn = visible(bytesOf(elided, 34));
    expect(drawn, "the fitter cut the argument").toContain("…");
    expect(drawn.endsWith(".ts)"), "and the path's own tail survived the fitter").toBe(true);
    expect(drawn.indexOf("…"), "the marker is inside the argument").toBeGreaterThan(drawn.indexOf(head));
  });

  it("T1.70 (C09 I103, C09 I79, C04 I84): one cut, on a cluster boundary, at every width and both widths of ambiguous", () => {
    const corpus = [
      PATH,
      "src/👨‍👩‍👧‍👦/parse.ts",
      "src/1️⃣/parse.ts",
      "src/école/parse.ts",
      "src/図表ディレクトリ/parse.ts",
    ];
    for (const ambiguousWidth of ["narrow", "wide"] as const) {
      const caps = { unicode: "full" as const, ambiguousWidth };
      for (const text of corpus) {
        for (let w = 4; w <= cells(text, ambiguousWidth) + 1; w += 1) { // cells-ok — a width sweep
          const out = truncate(text, w, caps, "middle");
          expect(cells(out, ambiguousWidth), `${text} at ${String(w)} never overruns`).toBeLessThanOrEqual(w);
          // **One marker is the assertion that the kind cut once**: a second cut
          // by the composer is §099's named defect, and it shows as two.
          const marks = [...out].filter((c) => c === "…").length;
          expect(marks, `${text} at ${String(w)}: cut once, not twice`).toBeLessThanOrEqual(1);
          // No cluster split: every cluster of the answer is a cluster of the
          // input, or a space or the marker.
          const segs = new Intl.Segmenter("en", { granularity: "grapheme" });
          const source = new Set([...segs.segment(text)].map((x) => x.segment));
          for (const g of [...segs.segment(out)].map((x) => x.segment)) {
            if (g === "…" || g === " ") continue;
            expect(source.has(g), `${JSON.stringify(g)} is a cluster of the input`).toBe(true);
          }
        }
      }
    }
  });
});

describe("C04 I148 and C09 I133, I134 — the hot edge's overshoot and the band by grapheme (review batch 4 M13.4, M13.5)", () => {
  it("T1.82 (C04 I148, C10 I36): overshoot samples lift the head at 24-bit, quantise at 8-bit, and change nothing at 4 and 1", () => {
    const stop = { lift: 1.35, share: 0.35 };
    const plain: Ramp = { fill: "gradient", from: "default", to: "accent" };
    const lifted: Ramp = { ...plain, overshoot: stop };
    const at = (ramp: Ramp, t: number, colourDepth: 1 | 4 | 8 | 24) => rampStyle(ramp, t, 0, DARK_THEME, { colourDepth });
    const hex = (ramp: Ramp, t: number): string => {
      const c = at(ramp, t, 24)?.colour;
      return c !== undefined && c.kind === "rgb" ? c.hex : "";
    };
    const accent = hexOf("accent");
    const ch = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
    // t = 1: every channel ×1.35, clamped at 255 — the demo's `Math.min`.
    expect(ch(hex(lifted, 1))).toEqual(ch(accent).map((c) => Math.min(255, Math.round(c * 1.35))));
    expect(ch(hex(lifted, 1)).some((c) => c === 255), "the accent's red channel clamps").toBe(true);
    // The knee is the accent exactly, and below it the plain mix over [0, 0.65].
    expect(hex(lifted, 0.65), "t = 1 − share is `to`").toBe(accent);
    expect(hex(lifted, 0.325), "halfway to the knee is the plain mix at one half").toBe(hex(plain, 0.5));
    expect(hex(lifted, 0), "t = 0 is `from`").toBe(hex(plain, 0));
    // The lift rises through the stop: t = 0.825 is halfway, ×1.175.
    expect(ch(hex(lifted, 0.825))).toEqual(ch(accent).map((c) => Math.min(255, Math.round(c * 1.175))));
    for (const t of [0, 0.2, 0.325, 0.65, 0.7, 0.825, 0.9, 1]) {
      // 8-bit: the 24-bit sample, quantised — including the lifted ones.
      expect(at(lifted, t, 8), `8-bit at ${String(t)}`).toEqual({ colour: { kind: "ansi256", index: nearestAnsi256(hex(lifted, t)) } });
      // 4-bit and 1-bit: no colour brighter than `to`, so the stop says nothing.
      expect(at(lifted, t, 4), `4-bit at ${String(t)}`).toEqual(at(plain, t, 4));
      expect(at(lifted, t, 1), `1-bit at ${String(t)}`).toEqual(at(plain, t, 1));
    }
    // **The control**: the 8-bit head is not the plain accent's index, so the
    // 8-bit row above is about the lift and not about two equal quantisations.
    expect(at(lifted, 1, 8)).not.toEqual(at(plain, 1, 8));
  });

  it("T1.150 (C09 I133, §7e): each form's head, middle, tail and first cell outside, as colours", () => {
    // Twenty-one narrow cells: the band is `h`..`u`, so `u` is the head, `r`
    // the fourth-newest, `h` the oldest and `g` the first cell outside.
    const text = "abcdefghijklmnopqrstu";
    const read = (over: Partial<Notice>, tick?: number) => {
      const row = gridOf(notice({ text, ...over }), 40, FULL_CAPS, tick)[0]!;
      const at = (c: string) => row.find((x) => x.ch === c)!.style;
      return { head: at("u"), fourth: at("r"), oldest: at("h"), outside: at("g") };
    };
    const ink = read({}).outside; // the same cell of the same notice, not streaming
    const warnInk = read({ tone: "warn" }).outside;
    const accent = fgOf(hexOf("accent"));
    const channels = (fg: string) => fg.split(";").slice(2).map(Number);

    const hot = read({ streaming: true, trail: "hotEdge" });
    expect(hot.head.fg, "hotEdge's head: the accent ×1.35, clamped").toBe(liftFg(accent, 1.35));
    expect(hot.fourth.fg, "the fourth-newest is lifted — inside the newest 35%").not.toBe(accent);
    channels(hot.fourth.fg).forEach((c, i) => expect(c, `channel ${String(i)} at or above the accent's`).toBeGreaterThanOrEqual(channels(accent)[i]!));
    expect(hot.oldest.fg, "the oldest is tinted").not.toBe(ink.fg);
    const step = channels(accent).map((a, i) => Math.abs(a - channels(fgOf(hexOf("default")))[i]!) / 0.65 / 14);
    channels(hot.oldest.fg).forEach((c, i) =>
      expect(Math.abs(c - channels(fgOf(hexOf("default")))[i]!), `the oldest within one step of the ink, channel ${String(i)}`).toBeLessThanOrEqual(Math.ceil(step[i]!) + 1),
    );
    expect(hot.outside, "the first cell outside is the ink exactly").toEqual(ink);

    const fade = read({ streaming: true, trail: "fade" });
    expect(fade.head.fg, "fade's head is `muted`").toBe(fgOf(hexOf("muted")));
    expect(fade.outside).toEqual(ink);

    const hue = read({ streaming: true, trail: "hue", tone: "warn" });
    expect(hue.head.fg, "hue's head is the accent, with no lift").toBe(accent);
    expect(hue.oldest.fg, "cooling toward the warn body tone").not.toBe(accent);
    expect(hue.outside, "and outside it the warn notice's own ink").toEqual(warnInk);

    // **The ripple runs once from its arrival and holds** (C09 I133, C04 I109;
    // ruling 81). The shell stamps `trailSince` at the frame that draws the
    // arrival; here it is stamped by hand at 0, so the ring crosses the band
    // over ticks 1–11 and rests on its final frame — the ink — from 12 on.
    // Every band cell and the first outside are read, because a ring is a few
    // cells wide and the four named ones need not be under it on a given tick.
    const band = (over: Partial<Notice>, tick: number) => {
      const row = gridOf(notice({ text, ...over }), 40, FULL_CAPS, tick)[0]!;
      return [..."ghijklmnopqrstu"].map((c) => row.find((x) => x.ch === c)!.style);
    };
    const stamped = { streaming: true, trail: "ripple", trailSince: 0 } as const;
    const running = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((tick) => band(stamped, tick).some((cell) => cell.fg !== ink.fg));
    expect(running.length, "the ring is drawn on some tick before the duration ends").toBeGreaterThan(0);
    for (const tick of [12, 20, 100]) {
      band(stamped, tick).forEach((cell, i) => expect(cell, `held at tick ${String(tick)}, cell ${String(i)}`).toEqual(ink));
    }
    // **The control**: the same notice unstamped holds the not-started frame —
    // frame 0, the ring at radius 0, which lights the band's centre — at every
    // tick, so the running frames above come from the stamp and not from the
    // tick alone. It is not the ink: the parked note said it was, measured at
    // the four named cells, none of which is the centre.
    const unstamped = { streaming: true, trail: "ripple" } as const;
    const still = band(unstamped, 0);
    expect(still.filter((cell) => cell.fg !== ink.fg).length, "frame 0 lights the centre and nothing else").toBe(1);
    for (let tick = 1; tick <= 12; tick += 1) expect(band(unstamped, tick), `unstamped at tick ${String(tick)}`).toEqual(still);
    expect(band(stamped, 0), "stamped at 0 and drawn at 0 is the same frame 0").toEqual(still);

    const weight = read({ streaming: true, trail: "weight" });
    for (const [where, style] of [["head", weight.head], ["fourth", weight.fourth], ["oldest", weight.oldest]] as const) {
      expect(style.attrs, `weight is bold at the ${where}`).toContain(1);
    }
    expect(weight.outside.attrs, "and not outside").not.toContain(1);
  });

  it("T3.129 (C09 I134, §7e): a cluster at the band's edge is wholly in or out, a combining mark is never dropped, and the newest cluster is the head", () => {
    const lifted = liftFg(fgOf(hexOf("accent")), 1.35);
    const settled = (text: string) => textClusters(notice({ text }));
    const streaming = (text: string) => textClusters(notice({ text, streaming: true, trail: "hotEdge" }));
    /** The clusters the band tinted: those whose style differs from the settled row's. */
    const band = (text: string) => {
      const plain = settled(text);
      return streaming(text).filter((c, i) => c.style.fg !== plain[i]!.style.fg);
    };
    const bandCells = (text: string) => band(text).reduce((n, c) => n + cells(c.g), 0);

    // **The measured case**: `k` + U+0301 just outside fourteen cells. The mark
    // was dropped from the frame; `textClusters` throws if it is not there whole.
    const edge = "abcdefghijk\u0301lmnopqrstuvwxy";
    const drawn = streaming(edge);
    const k = drawn.find((c) => c.g === "k\u0301")!;
    expect(k, "the cluster is drawn whole").toBeDefined();
    expect(k.style.fg, "and it is outside the band").toBe(settled(edge).find((c) => c.g === "k\u0301")!.style.fg);
    expect(bandCells(edge)).toBe(14);

    // **A band ending in a ZWJ family**: five code points, one cluster — and
    // the newest cluster is the head. Counting code points put it at 12/17.
    const family = "abcdefghijklmnop\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(streaming(family).at(-1)!.style.fg, "the family is the head").toBe(lifted);

    // **U+0301 inside the band**: the newest `y` is the head, not a step short.
    const inside = "abcdefghijklmnopqrste\u0301xy";
    expect(streaming(inside).at(-1)!.style.fg, "`y` is the head").toBe(lifted);
    // **And across a run boundary** the advance is in clusters too: a span
    // ending on `é` starts a second run, and a run advancing by code points
    // pushes `x` to `t = 1` beside `y`. Only the newest cluster is the head.
    const split = notice({ text: inside, streaming: true, trail: "hotEdge", spans: [{ from: 20, to: 22, tone: "identifier" }] } as Partial<Notice>);
    expect(textClusters(split).filter((c) => c.style.fg === lifted).map((c) => c.g), "one head, and it is `y`").toEqual(["y"]);

    // **Wide clusters straddling the edge** are wholly in or wholly out: one
    // cell of room left is not room for two.
    for (const wide of ["\u{1F600}", "\u{1F1EC}\u{1F1E7}"]) {
      const out = `abc${wide}${"m".repeat(13)}`;
      expect(band(out).map((c) => c.g), `${wide} one cell short: out`).not.toContain(wide);
      expect(bandCells(out), `${wide} out: the band is the thirteen`).toBe(13);
      const inn = `abc${wide}${"m".repeat(12)}`;
      expect(band(inn).map((c) => c.g), `${wide} with room: in`).toContain(wide);
      expect(bandCells(inn), `${wide} in: fourteen`).toBe(14);
    }

    // Every band: at most fourteen cells, and every cluster whole in the row
    // (`textClusters` would have thrown otherwise).
    for (const text of [edge, family, inside, "short", "e\u0301".repeat(20)]) {
      expect(bandCells(text), JSON.stringify(text)).toBeLessThanOrEqual(14);
    }
  });
});

describe("C22 I131 — the trail's one-shot is stamped by the shell, per arrival (ruling 81)", () => {
  it("T1.173 (C22 I131, C04 I109, C09 I133): a streaming ripple notice is stamped at the first frame, keeps its stamp on a re-emission, is re-stamped on a new arrival, and a producer's trailSince is kept", () => {
    const shots = new OneShots();
    /** The stamp on the entry's one notice after a frame at `tick`, over a fresh array each time — a re-emission. */
    const frame = (over: Partial<Notice>, tick: number, entry = "e1"): Notice =>
      shots.stamp(entry, [notice({ id: "n", streaming: true, trail: "ripple", ...over })], tick)[0] as Notice;

    expect(frame({ text: "abc" }, 5).trailSince, "the first frame that draws it stamps its tick").toBe(5);
    expect(frame({ text: "abc" }, 9).trailSince, "a re-emission of the same text keeps the stamp").toBe(5);
    expect(frame({ text: "abcd" }, 11).trailSince, "the next arrival takes the new tick").toBe(11);
    expect(frame({ text: "abcd" }, 30).trailSince, "and keeps it until the one after").toBe(11);
    expect(frame({ text: "abcde", trailSince: 2 }, 40).trailSince, "a producer's own stamp is kept, through a new arrival").toBe(2);

    // Nothing to stamp: a still form, and a settled ripple.
    expect(frame({ text: "abc", trail: "hotEdge" }, 5, "e2").trailSince, "hotEdge does not animate once").toBeUndefined();
    expect(frame({ text: "abc", streaming: false }, 5, "e3").trailSince, "a settled block has no head").toBeUndefined();
    expect(shots.size, "only the ripple's entry holds a stamp").toBe(1);

    // Nested: a notice inside a panel is stamped by the same walk.
    const nested = shots.stamp("e4", [{ kind: "panel", id: "p", title: "t", children: [notice({ id: "n", text: "x", streaming: true, trail: "ripple" })] }], 7);
    expect(((nested[0] as { children: readonly Block[] }).children[0] as Notice).trailSince, "inside a container").toBe(7);
  });
});
