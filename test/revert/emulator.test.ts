// C27 — terminal emulator (docs/components/C27_terminal_emulator.md §9), tier 6.
//
// Each row names the change that makes it fail. They are assertions about the
// rows above: what the mutation pass checks mechanically, stated so a reader can
// see which row dies for which defect.
import { describe, expect, it } from "vitest";

import { createEmulator } from "../../src/data/emulator/emulator.js";
import { containText, lineOf, type LineLike } from "../../src/data/emulator/snapshot.js";
import { tickIntervalOf } from "../../src/presentation/blocks/animation.js";
import { terminalDefinition } from "../../src/presentation/blocks/kinds/terminal.js";
import type { MeasureFn } from "../../src/data/viewmodel/index.js";
import { degradeColour } from "../../src/presentation/theme/colormap.js";
import { b } from "../../src/shell/builders/index.js";
import { MONO_CAPS, measurable, visible } from "../support/render.js";

/** The child measurer a container would use; this kind never calls it. */
const noChildren: MeasureFn = () => 0;

/** A hand-built buffer line, so the walk can be driven without the dependency. */
const lineFrom = (
  cellSpecs: readonly Readonly<{ chars: string; width?: number; fg?: number; bold?: boolean }>[],
): LineLike => ({
  length: cellSpecs.length,
  getCell: (x) => {
    const spec = cellSpecs[x];
    if (spec === undefined) return undefined;
    return {
      getChars: () => spec.chars,
      getWidth: () => spec.width ?? 1,
      getFgColor: () => spec.fg ?? 0,
      getBgColor: () => 0,
      isFgRGB: () => false,
      isBgRGB: () => false,
      isFgPalette: () => spec.fg !== undefined,
      isBgPalette: () => false,
      isFgDefault: () => spec.fg === undefined,
      isBgDefault: () => true,
      isBold: () => (spec.bold === true ? 1 : 0),
      isDim: () => 0,
      isItalic: () => 0,
      isUnderline: () => 0,
      isInverse: () => 0,
      isStrikethrough: () => 0,
    };
  },
});

describe("C27 terminal emulator — tier 6", () => {
  it("T6.1 (C27 I2): removing the replacement → T2.4 admits a control", () => {
    // The row this protects: the gate is the only thing between a child's bytes
    // and a renderer that does not strip.
    expect(containText("a\u001b[31mb")).not.toContain("\u001b");
    expect(containText(`a${String.fromCharCode(0xd800)}b`)).toBe("a?b");
  });

  it("T6.3 (C27 I5): emitting a run for default-styled cells → T1.2 counts four runs, not three", () => {
    const line = lineOf(lineFrom([{ chars: "a" }, { chars: "b", fg: 2 }, { chars: "c" }]));
    expect(line.runs).toEqual([{ from: 1, to: 2, fg: { kind: "ansi16", index: 2 } }]);
  });

  it("T6.4 (C27 I6): including a wide cluster's filler → T1.4's no-empty-character assertion fails", () => {
    const line = lineOf(lineFrom([{ chars: "漢", width: 2 }, { chars: "", width: 0 }, { chars: "x" }]));
    expect(line.text).toBe("漢x");
  });

  it("T6.5 (C27 I7): counting dropped from line feeds → T1.6 reads 30, not 7", async () => {
    const term = createEmulator({ cols: 20, rows: 4, scrollback: 20 });
    for (let i = 1; i <= 30; i += 1) await term.write(`line ${String(i)}\r\n`);
    // The relation, restated where a feed-counting implementation would differ:
    // 30 feeds, 24 rows kept, 7 gone — never 30, and never 6.
    expect(term.dropped).toBe(7);
    term.dispose();
  });

  it("T6.6 (C27 I4): returning rows lines in lines mode → T1.1 has four lines for one write", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await term.write("one");
    expect(term.snapshot("t").lines).toHaveLength(1);
    term.dispose();
  });

  it("T6.7 (C27 I8): storing the title on the block → T2.3's deep-equal fails", async () => {
    const term = createEmulator({ cols: 20, rows: 4 });
    await term.write("\u001b]0;renamed\u0007x");
    expect(Object.keys(term.snapshot("t"))).toEqual(["kind", "id", "cols", "screen", "lines", "cursor"]);
    term.dispose();
  });

  it("T6.8 (C27 I12): snapshot after dispose returning the last value → T3.7 fails", async () => {
    const term = createEmulator({ cols: 10, rows: 2 });
    await term.write("x");
    term.dispose();
    expect(() => term.snapshot("t")).toThrow();
  });

  it("T6.10 (C27 I10): applying the cap before the reflow → T1.7 loses a line", async () => {
    const term = createEmulator({ cols: 40, rows: 4, scrollback: 8 });
    await term.write(`${"y".repeat(120)}\r\n`);
    const before = term.snapshot("t").lines.map((l) => l.text).join("");
    term.resize(20, 4);
    expect(term.snapshot("t").lines.map((l) => l.text).join("")).toBe(before);
    term.dispose();
  });
});

describe("C04 — the terminal kind, spec-first rows", () => {
  it.todo("T6.96 (C04 I110): dropping the control check from the gate → T1.31 admits an escape and T4.56's frame gains a real one — not deferred on a component: lands with the Terminal validator");
  it.todo("T6.97 (C04 I111): admitting adjacent equal-styled runs → T1.32's last row passes and two snapshots of one screen stop comparing equal — not deferred on a component: lands with the Terminal validator");
  it.todo("T6.98 (C04 I113): allowing dropped: 0 → T1.33 admits it and the marker row draws zero lines dropped — not deferred on a component: lands with the Terminal validator");
});

describe("C09 · C10 — the terminal block and a literal colour", () => {
  it("T6.99 (C09 I55): a wrapped measure → T1.29's long row measures more than one", () => {
    // The row that dies: a 200-character line at width 80 is one row, and a
    // wrapping measure makes it three — a tail that reflows on content.
    expect(terminalDefinition.measure(b.terminal(80, [{ text: "x".repeat(200) }]), 80, noChildren)).toBe(1);
  });

  it("T6.100 (C09 I56): a stripping renderer → T3.73's text loses characters", () => {
    const painted = measurable({}).renderToLines(b.terminal(20, [{ text: "a?b" }]), 20);
    expect(visible(painted[0] ?? "")).toContain("a?b");
  });

  it("T6.101 (C09 I57): animating the kind → T2.122's cadence stops being null", () => {
    expect(tickIntervalOf(b.terminal(20, [{ text: "x" }]))).toBeNull();
  });

  it("T6.95 (C10 I38): an ansi16 round trip → the child's red becomes ours", () => {
    // A hex round trip would map index 1 (#800000) onto its nearest, which is
    // itself — so the row that catches the defect is a colour whose nearest is a
    // different index: 8 (#808080) resolves to 7 (#c0c0c0) if it goes through.
    expect(degradeColour({ kind: "ansi16", index: 8 }, { colourDepth: 4 })).toEqual({
      kind: "ansi16",
      index: 8,
    });
  });

  it("T6.96 (C10 I38): dropping the attributes at 1-bit → an inverse cursor vanishes", () => {
    const block = b.terminal(20, [{ text: "abc" }], { cursor: { line: 0, col: 1 } });
    const line = measurable({ capabilities: MONO_CAPS }).renderToLines(block, 20)[0] ?? "";
    expect(line).toMatch(/\u001b\[(?:[0-9;]*;)?7(?:;[0-9;]*)?m/u);
  });
});

describe("C21 — the PTY port, spec-first rows", () => {
  it.todo("T6.15 (C21 I16): falling back to spawnShell when no factory is injected → T1.11's throw becomes a handle and a caller that asked for a terminal gets a pipe with no cause — not deferred on a component: lands with spawnPty");
  it.todo("T6.16 (C21 I15): importing node-pty in runner.ts → T2.8's scan fails and the package becomes a runtime dependency by accident — not deferred on a component: lands with the PtyFactory port");
});

describe("C23 — the shell route as a live screen, spec-first rows", () => {
  it.todo("T6.93 (C23 I64): snapshotting per chunk → T1.51 counts 100 patches and a 2,000-line value enters the store per write — not deferred on a component: lands with the route's snapshot seam");
  it.todo("T6.17 (C21 I18): hasPty hard-coded true → T1.13's no-factory arm fails and the route chooses the PTY arm on a runner that cannot spawn one — not deferred on a component: lands with hasPty");
  it.todo("T6.94 (C23 I65): resizing the emulator first → T4.64's call order fails and one frame is drawn from the old grid — not deferred on a component: lands with the route's resize");
  it.todo("T6.95 (C23 I66): dropping the cancel registration → T3.62 fails, which is the defect F844 records as shipped — not deferred on a component: lands with the route's cancel");
  it.todo("T6.96 (C23 I67): keeping the cursor on settle → T2.47 fails and a settled block draws a cursor nobody is writing at — not deferred on a component: lands with the route's settle");
  it.todo("T6.98 (C23 I64): dropping the readout registration → T1.53's tail arm fails and a child's last lines wait for a chunk that never comes — not deferred on a component: lands with the route's snapshot seam");
  it.todo("T6.97 (C23 I63): falling back to the pipe arm when spawnPty throws → T3.63 fails and a configuration error becomes a child that quietly lost its colours — not deferred on a component: lands with the route's arm choice");
});
