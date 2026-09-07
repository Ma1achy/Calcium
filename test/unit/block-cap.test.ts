// C14 §4b — the cap on rows one block may occupy, and the marker that says what
// was cut (C14 I24, I25, I26; C09 §2b).
//
// **The measurement that ruled it** is in C14 §4b: paint is ~0.25 ms a row for
// every kind and linear with no knee, and the whole-block `measure` the roadmap
// named as the cost is 0.6 ms for a 50 000-row `table`. The rows here assert the
// **rows produced and the marker's text** — never the milliseconds — because the
// row count is the property the paint is linear in and the marker is what keeps
// the cut honest.
//
// **A cap of 10, so the frames can be read.** The default is 2 000 and one row
// asserts it; every interaction is the same at 10 and the frame fits on a page.
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import type { Block, TableRow, ViewDocument } from "../../src/data/viewmodel/index.js";
import {
  DEFAULT_MAX_BLOCK_ROWS,
  createBlockRegistry,
  type BlockDefinition,
  type BlockFault,
  type BlockRegistry,
} from "../../src/presentation/blocks/index.js";
import type { Windowed } from "../../src/presentation/blocks/types.js";
import { rows as rowsOf } from "../../src/presentation/blocks/paint.js";
import { tableDefinition } from "../../src/presentation/table/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { patchDefinition } from "../../src/presentation/patch/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { MARKER_ID } from "../../src/viewport/transcript/cap.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { validateConfig } from "../../src/shell/config.js";
import { ConfigError, type TuiConfig } from "../../src/shell/types.js";
import { defaultTheme } from "../../src/presentation/theme/index.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LOUD, visible } from "../support/render.js";
import { doc, hunkOf, patchOf } from "../support/blocks.js";

const W = 100;
const CAP = 10;
const ELLIPSIS = String.fromCodePoint(0x2026); // the mark `truncate` draws on a Unicode terminal (C04 §5)

/** A registry at `cap`, with the three kinds the framework registers itself (C09 §1). */
function kit(cap: number, onError: (fault: BlockFault) => void = LOUD): BlockRegistry {
  const r = createBlockRegistry({ maxBlockRows: cap, onError });
  r.register(tableDefinition as unknown as BlockDefinition);
  r.register(plotDefinition as unknown as BlockDefinition);
  r.register(patchDefinition as unknown as BlockDefinition);
  return r;
}

const lines = (r: BlockRegistry, b: Block, caps = FULL_CAPS): readonly string[] =>
  renderToLines(r, b, W, { theme: DARK_THEME, capabilities: caps, tick: 0 });

const shown = (r: BlockRegistry, b: Block): readonly string[] => lines(r, b).map(visible);

const line = (i: number): string => `line ${String(i)} — const value${String(i)} = compute(${String(i)});`;

const logs = (n: number, id = "l"): Block =>
  ({
    kind: "logs",
    id,
    lines: Array.from({ length: n }, (_, i) => ({
      ts: `12:00:${String(i % 60).padStart(2, "0")}`,
      level: i % 3 === 0 ? "error" : "info",
      message: line(i),
    })),
  }) as Block;

const raw = (n: number): Block => ({ kind: "raw", id: "r", text: Array.from({ length: n }, (_, i) => line(i)).join("\n") }) as Block;

const code = (n: number): Block =>
  ({ kind: "code", id: "c", language: "typescript", text: Array.from({ length: n }, (_, i) => line(i)).join("\n") }) as Block;

const keyValue = (n: number): Block =>
  ({ kind: "keyValue", id: "kv", rows: Array.from({ length: n }, (_, i) => ({ label: `key${String(i)}`, value: `v${String(i)}` })) }) as Block;

/** A table with a header; `expand` names rows carrying a two-row detail, so the unit is three rows (C09 I26). */
const table = (n: number, expand: readonly number[] = []): Block => {
  const set = new Set(expand);
  const rows: TableRow[] = Array.from({ length: n }, (_, i) => ({
    id: `r${String(i)}`,
    cells: { name: { text: `row-${String(i)}` }, v: { text: String((i * 7) % 23) } },
    ...(set.has(i)
      ? {
          expanded: true,
          detail: [
            {
              kind: "keyValue",
              id: `d${String(i)}`,
              rows: [
                { label: "detail", value: `of row ${String(i)}` },
                { label: "second", value: "so the unit is three rows" },
              ],
            },
          ],
        }
      : {}),
  })) as TableRow[];
  return {
    kind: "table",
    id: `t${String(n)}`,
    columns: [
      { key: "name", label: "Name", align: "left", priority: 1, minWidth: 8 },
      { key: "v", label: "V", align: "right", priority: 2, minWidth: 4 },
    ],
    rows,
  } as unknown as Block;
};

const patch = (n: number, collapsedBefore?: number): Block =>
  patchOf({
    id: "p",
    hunks: [
      hunkOf(
        Array.from({ length: n }, (_, i) => `${i % 4 === 0 ? "+" : " "}${line(i)}`),
        collapsedBefore === undefined ? {} : { collapsedBefore },
      ),
    ],
  });

const marker = (shownRows: number, total: number, mark = ELLIPSIS): string =>
  `${mark} ${shownRows.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} rows`;

/**
 * An app's own kind that declares `window` (C14 I26, T6.23) — one line per row,
 * the shape `logs` has — and a sibling that does not. **The pair is the row**:
 * a registry consulting a list of kinds gets the first wrong and the second right.
 */
// `Block` is a closed union, so the app's kind is read through a cast — the
// shape an app-defined `BlockDefinition` takes in the tree (`as unknown as`).
type Lane = Readonly<{ kind: "lanek" | "lanek-atomic"; id: string; lines: readonly string[] }>;
const asLane = (b: Block): Lane => b as unknown as Lane;
const laneDefinition = (kind: "lanek" | "lanek-atomic", windowed: boolean): BlockDefinition => ({
  kind,
  measure: (b) => Math.max(1, asLane(b).lines.length), // cells-ok — a line count, not a width
  render: (b) => rowsOf(asLane(b).lines),
  ...(windowed
    ? {
        window: (b: Block, _w: number, from: number, to: number): Windowed => ({
          block: { ...asLane(b), lines: asLane(b).lines.slice(from, to) } as unknown as Block,
          skipRows: 0,
          dropRows: 0,
        }),
      }
    : {}),
});
const lane = (kind: "lanek" | "lanek-atomic", n: number): Block =>
  ({ kind, id: kind, lines: Array.from({ length: n }, (_, i) => `${kind} ${String(i)}`) }) as unknown as Block;

describe("C14 §4b — one block occupies at most `maxBlockRows` rows plus a marker", () => {
  it("T1.19 (C14 I24): six kinds over a cap of 10 draw ten rows and the marker, through one code path", () => {
    const r = kit(CAP);
    const free = kit(100_000);
    const cases: readonly [string, Block][] = [
      ["logs", logs(25)],
      ["raw", raw(25)],
      ["code", code(25)],
      ["keyValue", keyValue(25)],
      ["table", table(25)],
      ["patch", patch(25)],
    ];

    for (const [kind, b] of cases) {
      const total = free.measure(b, W);
      expect(total, `${kind}: the fixture is over the cap`).toBeGreaterThan(CAP);

      const height = r.measure(b, W);
      const drawn = shown(r, b);
      const shownRows = height - 1;
      expect(drawn.length, `${kind}: C09 I1 through the registry — the frame is the measured height`).toBe(height);
      expect(shownRows, `${kind}: the cap, rounded up to the unit the kind's window keeps`).toBeGreaterThanOrEqual(CAP);
      expect(drawn[height - 1]?.trimEnd(), `${kind}: the marker row names the rows above it and the rows the block had`).toBe(marker(shownRows, total));
      // **The rows above the marker are the uncapped block's first rows**, byte
      // for byte — the cap is the kind's own window at `[0, cap)` (C09 §2b).
      expect(lines(r, b).slice(0, shownRows), `${kind}: the first ${String(shownRows)} rows of the whole block`).toEqual(lines(free, b).slice(0, shownRows));
    }

    // **ASCII takes `truncate`'s own mark** (C04 §5), not a second literal.
    const ascii = lines(r, logs(25), ASCII_CAPS).map(visible);
    expect(ascii[CAP]?.trimEnd()).toBe(marker(CAP, 25, "~"));
  });

  it("T1.19 (C14 I24): a block exactly at the cap has no marker and is handed back by reference", () => {
    const r = kit(CAP);
    const b = logs(CAP);
    expect(r.measure(b, W)).toBe(CAP);
    expect(shown(r, b).some((row) => row.includes(" of "))).toBe(false);
    // The same reference, so nothing downstream can tell the cap exists.
    expect(r.windowSequence([b], W, 0, CAP).blocks[0]).toBe(b);
    // **And the caller's reference for an unknown kind too** — not `#resolve`'s
    // `raw` conversion of it (C09 I10), which is what the capped form is built
    // from and what a kept-whole piece must not become.
    const mystery = { kind: "mystery", id: "m", payload: 1 } as unknown as Block;
    expect(r.measure(mystery, W)).toBe(1);
    expect(r.windowSequence([mystery], W, 0, 1).blocks[0]).toBe(mystery);
    // One over is the whole difference: no third state between "whole" and "capped".
    expect(r.measure(logs(CAP + 1), W)).toBe(CAP + 1);
    expect(shown(r, logs(CAP + 1))[CAP]?.trimEnd()).toBe(marker(CAP, CAP + 1));
  });

  it("T1.19 (C14 I26): atomic kinds are outside the cap, a panel's child is capped inside it, and an app's kind is capped the day it declares `window`", () => {
    const r = kit(CAP);
    const free = kit(100_000);

    // `plot` — its height is its own (C12 C09 I1) and no window exists to cap through.
    const plot = block({ kind: "plot", id: "plot", form: "line", height: 25, series: [{ values: [1, 4, 2, 8, 5], label: "rps" }], axes: true });
    expect(r.measure(plot, W)).toBe(free.measure(plot, W));
    expect(shown(r, plot)).toEqual(shown(free, plot));

    // A `panel` is not capped — its height is its children's — and the child is,
    // through the child seam (C09 I7): the marker is inside the border.
    const panel = block({ kind: "panel", id: "panel", title: "Logs", children: [logs(25, "inner")] });
    const small = block({ kind: "panel", id: "panel", title: "Logs", children: [logs(CAP, "inner")] });
    expect(r.measure(panel, W), "the panel of a capped child is the panel of a ten-line child plus the marker").toBe(free.measure(small, W) + 1);
    const inside = shown(r, panel);
    expect(inside.some((row) => row.includes(marker(CAP, 25))), "the marker is drawn inside the panel").toBe(true);

    // **The predicate is `window`, not a list** (T6.23). Two kinds the registry
    // has never heard of: the one declaring `window` is capped, the other is not.
    r.register(laneDefinition("lanek", true));
    r.register(laneDefinition("lanek-atomic", false));
    expect(r.measure(lane("lanek", 25), W)).toBe(CAP + 1);
    expect(shown(r, lane("lanek", 25))[CAP]?.trimEnd()).toBe(marker(CAP, 25));
    expect(r.measure(lane("lanek-atomic", 25), W)).toBe(25);
    expect(shown(r, lane("lanek-atomic", 25)).some((row) => row.includes(" of "))).toBe(false);
  });

  it("T1.19 (C14 I24): the default is 2 000, and `createBlockRegistry()` applies it unasked", () => {
    expect(DEFAULT_MAX_BLOCK_ROWS).toBe(2_000);
    const r = createBlockRegistry({ onError: LOUD });
    expect(r.measure(logs(2_000), W)).toBe(2_000);
    expect(r.measure(logs(2_001), W)).toBe(2_001);
    const drawn = shown(r, logs(2_500));
    expect(drawn.length).toBe(2_001);
    expect(drawn[2_000]?.trimEnd()).toBe(`${ELLIPSIS} 2,000 of 2,500 rows`);
  });

  it("T1.20 (C14 I24, I25): the marker is a row the window sees — read as frames", () => {
    const r = kit(CAP);
    const b = logs(25);
    const whole = lines(r, b); // the capped rendering: ten lines and the marker
    const free = lines(kit(100_000), b);

    // A window reaching the marker: line 9, then the marker.
    const reach = r.windowSequence([b], W, 9, 11);
    const reachPiece = reach.blocks[0] as Block;
    expect(reach.skipRows).toBe(0);
    expect(r.measure(reachPiece, W)).toBe(2);
    expect(lines(r, reachPiece)).toEqual([free[9], whole[10]]);
    expect(visible(lines(r, reachPiece)[1] ?? "").trimEnd()).toBe(marker(CAP, 25));

    // A window over the marker alone: the last content row is paid as slack.
    const alone = r.windowSequence([b], W, 10, 11);
    const alonePiece = alone.blocks[0] as Block;
    expect(alone.skipRows, "one content row charged to skipRows, because no window returns zero rows").toBe(1);
    expect(r.measure(alonePiece, W)).toBe(2);
    expect(lines(r, alonePiece).slice(alone.skipRows)).toEqual([whole[10]]);

    // A window below the marker: no marker, and the uncapped block's rows 3–6.
    const mid = r.windowSequence([b], W, 3, 7);
    const midPiece = mid.blocks[0] as Block;
    expect(mid.skipRows).toBe(0);
    expect(r.measure(midPiece, W)).toBe(4);
    expect(lines(r, midPiece)).toEqual(free.slice(3, 7));
    expect((midPiece as { capped?: unknown }).capped, "`capped` is stripped from a piece that stops short").toBeUndefined();
  });

  it("T2.13 (C14 I25, C09 I26): over every window of a capped `logs` and a capped `table`, the rows kept are the capped rendering's rows at those offsets", () => {
    const r = kit(CAP);
    for (const b of [logs(25), table(25, [8])]) {
      const height = r.measure(b, W);
      const whole = lines(r, b);
      expect(whole.length).toBe(height);
      let windows = 0;
      for (let from = 0; from < height; from += 1) {
        for (let to = from + 1; to <= height; to += 1) {
          const win = r.windowSequence([b], W, from, to);
          const piece = win.blocks[0] as Block;
          const kept = lines(r, piece);
          // C09 I1 for the piece, then the frame: containment is not correctness.
          expect(kept.length, `${b.kind} [${String(from)}, ${String(to)}): C09 I1`).toBe(r.measure(piece, W));
          expect(kept.slice(win.skipRows, win.skipRows + (to - from)), `${b.kind} [${String(from)}, ${String(to)})`).toEqual(whole.slice(from, to));
          windows += 1;
        }
      }
      expect(windows).toBe((height * (height + 1)) / 2);
    }
    // `logs` has units of one row, so the identity is exact with the marker counted.
    const b = logs(25);
    for (let from = 0; from < 11; from += 1) {
      for (let to = from + 1; to <= 11; to += 1) {
        const win = r.windowSequence([b], W, from, to);
        expect(r.measure(win.blocks[0] as Block, W) - win.skipRows).toBe(to - from);
      }
    }
  });

  it("T2.14 (C14 I24): `0`, a negative, a fraction and `NaN` are refused at construction and at `createTui`", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => createBlockRegistry({ maxBlockRows: bad }), String(bad)).toThrow(/maxBlockRows must be a positive integer/);
      const config = { name: "x", binary: "x", manifest: "manifest.json", theme: defaultTheme, maxBlockRows: bad } as TuiConfig;
      expect(() => validateConfig(config), String(bad)).toThrow(ConfigError);
      expect(() => validateConfig(config), String(bad)).toThrow(/`maxBlockRows` must be a positive integer/);
    }
    expect(() => createBlockRegistry({ maxBlockRows: 1 })).not.toThrow();
    expect(() => validateConfig({ name: "x", binary: "x", manifest: "m.json", theme: defaultTheme } as TuiConfig)).not.toThrow();
  });

  it("T3.20 (C14 I24, C09 I26): an expanded row at the boundary is kept whole and the marker names the rows on screen, not the cap", () => {
    const r = kit(CAP);
    // header + rows 0–7 is nine rows; row 8 is a three-row unit that crosses the cap.
    const b = table(25, [8]);
    const total = kit(100_000).measure(b, W); // 1 + 24 + 3
    expect(total).toBe(28);
    const drawn = shown(r, b);
    expect(r.measure(b, W)).toBe(13);
    expect(drawn[12]?.trimEnd()).toBe(marker(12, 28));
    // The detail is drawn whole above the marker — read the frame.
    expect(drawn[9]).toContain("row-8");
    expect(drawn[10]).toContain("of row 8");
    expect(drawn[11]).toContain("so the unit is three rows");
  });

  it("T3.21 (C14 I24, C09 I33): the floor applies after the cap, and a floored block over the cap is kept whole with its marker", () => {
    const r = kit(CAP);
    const tall = { ...logs(25), minHeight: 20 } as Block;
    const low = { ...logs(25), minHeight: 5 } as Block;
    expect(r.measure(tall, W)).toBe(20);
    expect(r.measure(low, W)).toBe(11);
    for (const b of [tall, low]) {
      const win = r.windowSequence([b], W, 0, 5);
      const piece = win.blocks[0] as Block;
      expect(win.skipRows).toBe(0);
      expect(r.measure(piece, W), "kept whole — a floored block is not windowed (C04 I68)").toBe(r.measure(b, W));
      const drawn = shown(r, piece);
      expect(drawn[CAP]?.trimEnd()).toBe(marker(CAP, 25));
      expect(drawn.length).toBe(r.measure(b, W));
    }
  });

  it("T3.22 (C14 I24, C13 I14): two caps, two markers — D40's notice above and the row cap's beneath the block", () => {
    const r = kit(CAP);
    // **D40's marker costs a block of its own** (C13 §5), so an overflow of one
    // evicts two: two disposable entries ahead of the capped one, and the cap
    // yields exactly them.
    const store = createTranscriptStore({ cap: 4 });
    store.append(doc({ blocks: [block({ kind: "raw", id: "a", text: "first" })] }));
    store.append(doc({ blocks: [block({ kind: "raw", id: "a2", text: "second" })] }));
    store.append(doc({ blocks: [logs(25)] }));
    store.append(doc({ blocks: [block({ kind: "raw", id: "c", text: "fourth" })] }));
    store.append(doc({ blocks: [block({ kind: "raw", id: "d", text: "fifth" })] }));

    const entries = store.entries;
    expect(entries[0]?.id, "D40's marker is the first entry").toBe(MARKER_ID);
    expect(entries.map((e) => e.doc.blocks[0]?.id), "the capped block survives").toEqual([`${MARKER_ID}:notice`, "l", "c", "d"]);
    const frame = entries.flatMap((e) => e.doc.blocks.flatMap((b) => shown(r, b)));
    expect(frame[0]).toContain("2 earlier blocks dropped at the session cap");
    expect(frame.some((row) => row.trimEnd().endsWith(marker(CAP, 25))), "the row cap's marker, beneath the capped block").toBe(true);
    expect(frame.filter((row) => row.includes("dropped at the session cap")).length, "one D40 notice, never capped").toBe(1); // cells-ok — a row count
  });

  it("T3.23 (C14 I24, C25 I18): a `patch` over the cap is a valid patch, `collapsedBefore` and headers inside `shown`, and `capped` survives `windowRows` building a fresh block", () => {
    const r = kit(CAP);
    const b = patch(25, 12);
    const total = kit(100_000).measure(b, W); // path, collapsed marker, hunk header, 25 lines
    expect(total).toBe(28);
    const win = r.windowSequence([b], W, 0, 11);
    const piece = win.blocks[0] as Block & { hunks?: unknown[] };
    expect(piece.kind).toBe("patch");
    expect(Array.isArray(piece.hunks)).toBe(true);
    const drawn = shown(r, piece);
    expect(drawn.length).toBe(11);
    expect(drawn[0]).toContain("serving/volatility-estimator.yaml");
    expect(drawn.some((row) => row.includes("12 ")), "the collapsed region's marker is a row of the capped patch").toBe(true);
    expect(drawn[10]?.trimEnd()).toBe(marker(CAP, 28));
  });

  it("T3.24 (C14 I24, C09 I11): a measurer that throws on a block over the cap is contained exactly as before — one fault per call, no second report", () => {
    const faults: BlockFault[] = [];
    const r = kit(CAP, (f) => faults.push(f));
    r.register({
      kind: "boom",
      measure: () => {
        throw new Error("no");
      },
      render: () => rowsOf(["never"]),
      window: (b: Block): Windowed => ({ block: b, skipRows: 0, dropRows: 0 }),
    } as BlockDefinition);
    const b = { kind: "boom", id: "b" } as unknown as Block;
    expect(r.measure(b, W)).toBe(1);
    expect(faults.map((f) => f.member)).toEqual(["measure"]);
    const win = r.windowSequence([b], W, 0, 1);
    expect(win.blocks[0]).toBe(b);
    expect(faults.length, "windowSequence reports the measurer once, through `measure`").toBe(2); // cells-ok — a fault count
    const drawn = lines(r, b);
    expect(drawn.length).toBe(1);
    expect(visible(drawn[0] ?? "")).toContain("boom failed to measure");
  });

  it("T4.11 (C14 I24, with C13 and C09): the viewport's foot selects the marker row and the frame's last block row reads it", () => {
    const r = kit(CAP);
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: W, height: 5, measureSequence: (blocks, w) => r.measureSequence(blocks, w) });
    const entry = store.append(doc({ blocks: [logs(25)] }) as ViewDocument);
    expect(viewport.scroll.totalRows, "chrome-free here, so the entry is its capped block").toBe(11);

    viewport.scrollToBottom();
    const range = viewport.visible();
    const ve = range.entries[0];
    expect(ve?.id).toBe(entry);
    expect(ve?.skipRows).toBe(6);
    expect(ve?.takeRows).toBe(5);

    // `session.ts`'s path: window the entry's blocks to the visible rows, render, slice.
    const blocks = store.entries.find((e) => e.id === entry)?.doc.blocks ?? [];
    const win = r.windowSequence(blocks, W, ve?.skipRows ?? 0, (ve?.skipRows ?? 0) + (ve?.takeRows ?? 0));
    const drawn = win.blocks.flatMap((b) => shown(r, b)).slice(win.skipRows, win.skipRows + (ve?.takeRows ?? 0));
    expect(drawn.length).toBe(5);
    expect(drawn[4]?.trimEnd()).toBe(marker(CAP, 25));
    expect(drawn[3]).toContain(line(9));
  });
});
