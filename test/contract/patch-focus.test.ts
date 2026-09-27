// C25 §3d — a patch line is an element, and focus and selection land on it
// (I24, I25; C10 §4k.2 row 3).
//
// **Read through a terminal, not through the bytes.** T2.17 writes each row to
// `@xterm/headless` and reads the cells back, because the defect row h exists
// for was invisible in the painter's bytes and visible only there: bold and dim
// share SGR 22, and the composed row lost the bold after the first dim run
// (F1258). An assertion over escape codes agrees with whatever wrote them.
import xterm from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { background, focusStyle, paint, selectionStyle, tone } from "../../src/presentation/blocks/paint.js";
import { checkElements, formatElementReport } from "../../src/testing/navigation-conformance.js";
import type { NavigableRegistry } from "../../src/testing/navigation-conformance.js";
import type { Hunk } from "../../src/data/viewmodel/index.js";
import type { Style } from "../../src/presentation/theme/index.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { PATCH_CORPUS, hunkOf, patchOf } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS, measurable, visible } from "../support/render.js";

type Focus = Parameters<typeof measurable>[0] extends infer O ? (O extends { focus?: infer F } ? F : never) : never;

const kit = (capabilities: TerminalCapabilities = FULL_CAPS, focus?: Focus) =>
  measurable({ capabilities, definitions: [patchDefinition as never], ...(focus === undefined ? {} : { focus }) });

/** §3d's row-walk fixture: a context line, one removal, two additions, both ends elided. */
const WALK = patchOf({
  id: "p",
  hunks: [hunkOf([" ctx", "-old", "+new", "+new2"], { collapsedBefore: 4 })],
  collapsedAfter: 2,
});

type Cell = Readonly<{ ch: string; bold: boolean; dim: boolean; inverse: boolean; bg: number | null; fg: number | null }>;

async function cellsOf(row: string, cols = 130): Promise<readonly Cell[]> {
  const term = new xterm.Terminal({ cols, rows: 1, allowProposedApi: true });
  await new Promise<void>((done) => term.write(row, done));
  const line = term.buffer.active.getLine(0);
  const out: Cell[] = [];
  for (let i = 0; i < cols; i += 1) {
    const c = line?.getCell(i);
    if (c === undefined) break;
    out.push({
      ch: c.getChars() === "" ? " " : c.getChars(),
      bold: c.isBold() !== 0,
      dim: c.isDim() !== 0,
      inverse: c.isInverse() !== 0,
      bg: c.isBgDefault() ? null : c.getBgColor(),
      fg: c.isFgDefault() ? null : c.getFgColor(),
    });
  }
  term.dispose();
  return out;
}

/** What one cell painted in `style` reads back as — the oracle for a ground or an ink. */
async function reference(style: Style): Promise<Cell> {
  const [cell] = await cellsOf(paint([{ text: "x", style }]), 4);
  return cell!;
}

describe("C25 §3d — patch elements and focus", () => {
  it("T1.28 (C25 I24): §3d's row walk as data, unified and split", () => {
    const k = kit();
    const walk = (w: number) => k.registry.elementsOf(WALK, w).map((e) => [e.id, e.rows.from, e.cols.from, e.cols.to]);
    expect(walk(60), "unified: one element a line, the full width").toEqual([
      ["18:18", 3, 0, 60],
      ["19:", 4, 0, 60],
      [":19", 5, 0, 60],
      [":20", 6, 0, 60],
    ]);
    // `s` = ⌊(120 − 1) / 2⌋ = 59; the separator is cell 59, and cell 119 is the
    // row's own padding — neither side's (§3d).
    expect(walk(120), "split: the pair shares a row, left and right of the separator").toEqual([
      ["18:18", 3, 0, 120],
      ["19:", 4, 0, 59],
      [":19", 4, 60, 119],
      [":20", 5, 60, 119],
    ]);

    // **The frame, not only the numbers**: each element's cells hold its line.
    for (const w of [60, 120]) {
      const frame = k.renderToLines(WALK, w).map(visible);
      for (const e of k.registry.elementsOf(WALK, w)) {
        const text = e.copy!.slice(1);
        expect(frame[e.rows.from]!.slice(e.cols.from, e.cols.to), `${e.id} at ${String(w)}`).toContain(text);
      }
    }
    expect(k.registry.elementsOf(WALK, 60).map((e) => e.copy), "copy is the line as unified diff").toEqual([
      " ctx",
      "-old",
      "+new",
      "+new2",
    ]);
    expect(k.registry.elementsOf(WALK, 60).some((e) => /^h\d+:/u.test(e.id)), "no positional id").toBe(false);

    // A line missing the number its kind needs declares nothing.
    const numberless: Hunk = {
      header: "@@ -1,0 +1,2 @@",
      lines: [
        { kind: "add", text: "x" },
        { kind: "add", text: "y", newNo: 3 },
      ],
    };
    expect(k.registry.elementsOf(patchOf({ id: "n", hunks: [numberless] }), 60).map((e) => e.id)).toEqual([":3"]);

    // A repeated id keeps its first line, and only that line takes the mark.
    const twice = patchOf({ id: "d", hunks: [hunkOf(["+a"]), hunkOf(["+b"])] });
    // 0 path · 1 header · 2 `+a` · 3 header · 4 `+b`.
    expect(k.registry.elementsOf(twice, 60).map((e) => [e.id, e.rows.from])).toEqual([[":18", 2]]);
    const marked = kit(MONO_UNICODE_CAPS, { blockId: "d", rowId: ":18" }).renderToLines(twice, 60);
    const unmarked = kit(MONO_UNICODE_CAPS).renderToLines(twice, 60);
    expect(marked[2], "the first :18 takes the mark").not.toBe(unmarked[2]);
    expect(marked[4], "the second does not").toBe(unmarked[4]);
  });

  it("T2.16 (C25 I24, C26 I4–I7): C26's element conformance over a patch corpus, window agreement included", () => {
    const nav = (): NavigableRegistry => kit().registry as unknown as NavigableRegistry;
    const report = checkElements(nav(), PATCH_CORPUS);
    expect(report.failures, formatElementReport(report)).toEqual([]);
    expect(report.kinds, "patch declares elements").toContain("patch");
    expect(report.checked, "and the sweep checked some").toBeGreaterThan(0);
    expect(report.agreements, "patch declares window and elements both").toBeGreaterThan(0);

    // **The control, and it is the owed attempt's id.** Positional ids (`h0`,
    // `h1`…) pass every predicate on the whole block and fail on the first
    // window that drops a line — `patch-three-hunks` is the fixture that does.
    const real = nav();
    const positional: NavigableRegistry = {
      measure: (b, w) => real.measure(b, w),
      get: (kind) => real.get(kind),
      elementsOf: (b, w) => real.elementsOf(b, w).map((e, i) => ({ ...e, id: `h${String(i)}` })),
    };
    expect(checkElements(positional, PATCH_CORPUS).failures.map((f) => f.predicate)).toContain("window-agreement");
  });

  it("T2.17 (C25 I25): §3d's classification table at three rungs", async () => {
    const P = patchOf({ id: "p", hunks: [hunkOf([" ctx", "-old", "+new"])] });
    // Unified at 60: 0 path · 1 header · 2 `18:18` · 3 `19:` · 4 `:19`.
    const draw = (caps: TerminalCapabilities, focus?: Focus, block = P, width = 60) =>
      kit(caps, focus).renderToLines(block, width);
    const head = (id: string): Focus => ({ blockId: "p", rowId: id });
    const extent = (id: string): Focus => ({ blockId: "elsewhere", rowId: "x", selected: [{ blockId: "p", rowId: id }] });
    const both = (id: string): Focus => ({ blockId: "p", rowId: id, selected: [{ blockId: "p", rowId: id }] });
    const drawn = (cells: readonly Cell[]) => cells.slice(0, 60);
    const markerOf = (cells: readonly Cell[], mark: string) => cells.find((c) => c.ch === mark);

    for (const caps of [FULL_CAPS, ASCII_CAPS]) {
      const rung = caps === FULL_CAPS ? "24-bit" : "ascii";
      const ground = async (name: `${string}.${string}`) => (await reference(background(name, DARK_THEME, caps))).bg;
      const ink = async (t: "ok" | "muted", on: string) => (await reference(tone(t, DARK_THEME, caps, on))).fg;
      const selection = (await reference(selectionStyle(DARK_THEME, caps))).bg;
      const focusGround = (await reference(focusStyle(DARK_THEME, caps))).bg;
      const diffAdd = await ground("surface.diffAdd");
      expect(new Set([selection, focusGround, diffAdd]).size, `${rung}: three grounds to tell apart`).toBe(3);

      // a — at rest, the diff's own ground and its ink on it.
      const rest = await cellsOf(draw(caps)[4]!);
      expect(drawn(rest).every((c) => c.bg === diffAdd), `${rung} a`).toBe(true);
      expect(markerOf(rest, "+")?.fg, `${rung} a: + in ok on diffAdd`).toBe(await ink("ok", "diffAdd"));

      // b — selected, head in a sibling block: the wash, + kept, its ink on the wash, no bold.
      const b = await cellsOf(draw(caps, extent(":19"))[4]!);
      expect(drawn(b).every((c) => c.bg === selection), `${rung} b: the wash, sibling head`).toBe(true);
      expect(markerOf(b, "+")?.fg, `${rung} b: + in ok on the selection`).toBe(await ink("ok", "selection"));
      expect(drawn(b).some((c) => c.bold), `${rung} b: no weight`).toBe(false);

      // c — selected and the head: the wash, and bold on every cell.
      const c = await cellsOf(draw(caps, both(":19"))[4]!);
      expect(drawn(c).every((x) => x.bg === selection && x.bold), `${rung} c`).toBe(true);
      expect(markerOf(c, "+"), `${rung} c: + kept`).toBeDefined();

      // d — the head alone: focus's ground, bold.
      const d = await cellsOf(draw(caps, head(":19"))[4]!);
      expect(drawn(d).every((x) => x.bg === focusGround && x.bold), `${rung} d`).toBe(true);

      // e — a context line selected: the wash, and its muted gutter inked on it.
      const e = await cellsOf(draw(caps, extent("18:18"))[2]!);
      expect(drawn(e).every((x) => x.bg === selection), `${rung} e`).toBe(true);
      expect(e[0]!.fg, `${rung} e: the number in muted on the selection`).toBe(await ink("muted", "selection"));

      // f — split, the removal selected: the wash on its half, diffAdd on the other.
      const split = patchOf({ id: "p", layout: "split", hunks: [hunkOf([" ctx", "-old", "+new"])] });
      const f = await cellsOf(draw(caps, extent("19:"), split, 120)[3]!);
      expect(f.slice(0, 59).every((x) => x.bg === selection), `${rung} f: left half`).toBe(true);
      expect(f.slice(60, 119).every((x) => x.bg === diffAdd), `${rung} f: right half`).toBe(true);

      // g — the path and hunk headers do not move under any focus.
      for (const focus of [head(":19"), extent(":19"), both("18:18")]) {
        expect(draw(caps, focus).slice(0, 2), `${rung} g`).toEqual(draw(caps).slice(0, 2));
      }
    }

    // At 1-bit the three states are three frames — and row h.
    const mono = async (focus: Focus | undefined, row: number) => drawn(await cellsOf(draw(MONO_UNICODE_CAPS, focus)[row]!));
    const text = (cells: readonly Cell[]) => cells.filter((c) => c.ch !== " ");
    const h = await mono(head(":19"), 4);
    const x = await mono(extent(":19"), 4);
    const hx = await mono(both(":19"), 4);
    expect(text(h).every((c) => c.bold && !c.inverse), "1-bit: the head is bold").toBe(true);
    expect(x.every((c) => c.inverse) && text(x).some((c) => !c.bold), "1-bit: the extent is inverse, not all bold").toBe(true);
    expect(hx.every((c) => c.inverse && c.bold), "1-bit: the head in the extent is both").toBe(true);
    expect(text(h).map((c) => c.ch).join(""), "1-bit: + kept on the head").toContain("+");
    expect(text(x).map((c) => c.ch).join(""), "1-bit: + kept on the extent").toContain("+");

    // h — a focused context line: bold on every cell, and no dim left beside it.
    const ctx = await mono(head("18:18"), 2);
    expect(ctx.every((c) => c.bold && !c.dim), "1-bit h: bold replaces the dim").toBe(true);
    const ctxRest = await mono(undefined, 2);
    expect(ctxRest.some((c) => c.dim), "control: at rest the gutter is dim").toBe(true);

    // `measure` never sees focus (C09 I1).
    for (const focus of [undefined, head(":19"), extent(":19"), both(":19")]) {
      expect(draw(FULL_CAPS, focus)).toHaveLength(kit().measure(P, 60));
    }
  });
});
