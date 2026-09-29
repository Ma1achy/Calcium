// Review instruments — the shrunk reproducers from the fuzzing pass on PR 61
// (item 5, FZ-2 … FZ-10), pinned as rows. FZ-8, FZ-11 and FZ-12 are not here: written
// through renderSequenceToLines they pass, so they reproduce only through a bare registry. Every row here was RED at c7158c22
// when written: each names an open finding, and turns green when its fix lands.
// The oracles are the fuzzer's: well-formed events, chunking invariance,
// measure === render, row width ≤ width, no control byte in a frame.
import { describe, expect, it } from "vitest";

import type { Block } from "../../src/data/viewmodel/index.js";
import { createDecoder } from "../../src/interaction/router/decode.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { cells } from "../../src/presentation/text.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";

const ESC = "\u001b";
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const SGR = /\x1b\[[0-9;:]*m/gu;
const LONE_SURROGATE = /(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u;

const decoder = (keyboardProtocol: "kitty" | "none" = "none") =>
  createDecoder({ capabilities: { bracketedPaste: true, mouse: true, keyboardProtocol }, now: () => 0 });
const names = (events: readonly unknown[]): string[] =>
  events.map((e) => {
    const k = (e as { key?: { name?: string }; name?: string }).key ?? (e as { name?: string });
    return typeof k.name === "string" ? k.name : "";
  });

const registry = createBlockRegistry({ defaults: true });
const WIDE = { ...FULL_CAPS, ambiguousWidth: "wide" as const };
const painted = (b: Block, width: number, caps = FULL_CAPS): readonly string[] =>
  renderSequenceToLines(registry, [b], width, { theme: DARK_THEME, capabilities: caps, focus: null, scrollOffsets: {} });
const plain = (rows: readonly string[]): string[] => rows.map((r) => r.replace(SGR, ""));

describe("review — decoder reproducers (PR 61 item 5)", () => {
  it("FZ-2: an SGR mouse report with a missing parameter has finite coordinates", () => {
    const events = decoder().push(bytes(`${ESC}[<0;5M`));
    expect(events).toHaveLength(1);
    const m = events[0] as { kind: string; row: number; col: number };
    expect(m.kind).toBe("mouse");
    expect(Number.isInteger(m.row) && m.row >= 0, `row ${String(m.row)}`).toBe(true);
    expect(Number.isInteger(m.col) && m.col >= 0, `col ${String(m.col)}`).toBe(true);
  });

  it("FZ-3: an astral character typed as a key is one key, not two lone surrogates", () => {
    const events = decoder().push(bytes("😀"));
    expect(events, JSON.stringify(events)).toHaveLength(1);
    for (const n of names(events)) expect(LONE_SURROGATE.test(n), JSON.stringify(n)).toBe(false);
  });

  it("FZ-4: a CSI u code point in the surrogate range does not become a key name", () => {
    for (const n of names(decoder("kitty").push(bytes(`${ESC}[55296u`)))) {
      expect(LONE_SURROGATE.test(n), JSON.stringify(n)).toBe(false);
    }
  });

  it("FZ-5: a terminated OSC longer than 256 bytes decodes the same in one chunk and byte by byte", () => {
    const s = bytes(`${ESC}]52;c;${"A".repeat(300)}\u0007`);
    const one = decoder().push(s).length;
    const d = decoder();
    let bytewise = 0;
    for (const b of s) bytewise += d.push(new Uint8Array([b])).length;
    expect({ one, bytewise }).toEqual({ one, bytewise: one });
  });
});

describe("review — measure and render reproducers (PR 61 item 5)", () => {
  it("FZ-9: a scroll box without a windowed child renders exactly what it measures", () => {
    const s = { kind: "scroll", id: "s", height: 1, children: [{ kind: "notice", id: "n", tone: "info", text: "ab" }] } as unknown as Block;
    for (const w of [1, 2, 4]) {
      expect(painted(s, w).length, `width ${String(w)}`).toBe(registry.measure(s, w));
    }
  });

  it("FZ-10 / T-1: under ambiguousWidth wide, no kind draws a row wider than its width", () => {
    const cases: readonly [string, Block, number][] = [
      ["panel", { kind: "panel", id: "p", title: "", children: [{ kind: "raw", id: "a", text: "hello world" }] } as unknown as Block, 4],
      ["split", { kind: "split", id: "s", height: 2, children: [{ kind: "raw", id: "l", text: "abcdef" }, { kind: "raw", id: "r", text: "ghijkl" }] } as unknown as Block, 6],
      ["notice", { kind: "notice", id: "n", tone: "info", text: "β" } as unknown as Block, 1],
      ["scroll", { kind: "scroll", id: "c", height: 1, children: [{ kind: "raw", id: "a", text: "abcdef\nghijkl\nmno" }] } as unknown as Block, 3],
    ];
    for (const [kind, b, w] of cases) {
      for (const row of plain(painted(b, w, WIDE))) {
        expect(cells(row, "wide"), `${kind} ${JSON.stringify(row)} at ${String(w)}`).toBeLessThanOrEqual(w);
      }
    }
  });
});
