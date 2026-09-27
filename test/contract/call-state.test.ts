// A call's state, from the outcome it settles with to the tone and mark its head
// draws — C04 I141, C09 I45, C23 I81, R-BLK-214, R-BLK-220 (review batch 2, M4
// items 1–3).
//
// **One file for three specs' rows, because the defect lived between them.**
// `callState` classified an outcome, `rollUp` classified it again, `callHead`
// chose a tone apart from either, and `headMark` resolved a mark from the state
// alone. Each was consistent with itself; what shipped was a failed call drawn
// as a blue `●` beside its parent's `1 failed`.
import xterm from "@xterm/headless";
import { describe, expect, it } from "vitest";

import { CALL_HEAD_GLYPH, CALL_STATE_TONE, CALL_STATES, block, validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block, CallState, Notice } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { paint, tone } from "../../src/presentation/blocks/paint.js";
import { GLYPH_TOKENS, glyphCells, headMark } from "../../src/presentation/blocks/glyphs.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { b } from "../../src/shell/builders/index.js";
import { callHead, compose, rollUp, toolCallHeader } from "../../src/shell/documents.js";
import type { ToolCallSpec } from "../../src/shell/documents.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, visible } from "../support/render.js";

const registry = createBlockRegistry({ defaults: true });
const call = (spec: Partial<ToolCallSpec>): ToolCallSpec => ({ id: "c", name: "grep", args: "x", ...spec }) as ToolCallSpec;

type Cell = Readonly<{ ch: string; fg: number | null; fgMode: number }>;

/** The first `n` cells of a painted row, as a terminal reads them back. */
async function cellsOf(row: string, n: number): Promise<readonly Cell[]> {
  const term = new xterm.Terminal({ cols: 80, rows: 1, allowProposedApi: true });
  await new Promise<void>((done) => term.write(row, done));
  const line = term.buffer.active.getLine(0);
  const out: Cell[] = [];
  for (let i = 0; i < n; i += 1) {
    const c = line?.getCell(i);
    if (c === undefined) break;
    out.push({ ch: c.getChars() === "" ? " " : c.getChars(), fg: c.isFgDefault() ? null : c.getFgColor(), fgMode: c.getFgColorMode() });
  }
  term.dispose();
  return out;
}

/** The head row of a call in `state`, rendered, and its lead cell read back. */
async function headCell(state: CallState, caps: TerminalCapabilities): Promise<Cell> {
  const head = callHead(call({ state }), caps);
  const [row] = renderSequenceToLines(registry, [head], 60, { theme: DARK_THEME, capabilities: caps });
  const [cell] = await cellsOf(row ?? "", 1);
  return cell!;
}

/** The oracle: one cell painted in `name`'s tone at these capabilities, read back the same way. */
async function toneCell(name: Notice["tone"], caps: TerminalCapabilities): Promise<Cell> {
  const [cell] = await cellsOf(paint([{ text: "x", style: tone(name, DARK_THEME, caps) }]), 1);
  return cell!;
}

describe("C23 I81 — one classifier for a call's state and its parent's rollup", () => {
  // **The three readers, asked together.** Each was consistent with itself, so a
  // row asking one of them could not see the defect: the head's state, the
  // parent's rollup verdict for the same child, and whether the duration slot
  // spins. `rollUp([child, anchor])` with a succeeded anchor makes the verdict
  // a part — `1 of 2 · 1 failed` — rather than a summed count.
  const verdict = (child: ToolCallSpec): string => {
    const parts = rollUp([child, call({ id: "a", outcome: "ok-ish" })]);
    return parts.slice(1).join(" · ") || (parts[0] === "2 of 2" ? "counted" : parts.join(" · "));
  };
  // **Spinning is the header moving with the tick**, asked as that — not as a
  // set of spinner characters, which an outcome could contain.
  const spins = (c: ToolCallSpec): boolean => toolCallHeader(c, FULL_CAPS, 0) !== toolCallHeader(c, FULL_CAPS, 1);

  it("T1.76 (C23 I81, I59, I62): exit N, each failure word, exit 0, a count and cancelled — the built head's state and tone and rollUp's parts, read together", () => {
    const rows: readonly (readonly [string, Partial<ToolCallSpec>, CallState, string])[] = [
      // [label, the child, its head's state, its parent's verdict]
      ["exit 1", { outcome: "exit 1" }, "failed", "1 failed"],
      ["exit 127", { outcome: "exit 127" }, "failed", "1 failed"],
      ["failed", { outcome: "failed" }, "failed", "1 failed"],
      ["denied", { outcome: "denied" }, "failed", "1 denied"],
      ["truncated", { outcome: "truncated" }, "failed", "1 truncated"],
      ["exit 0", { outcome: "exit 0" }, "succeeded", "counted"],
      ["a count", { outcome: "3 matches" }, "succeeded", "counted"],
      ["settled, no outcome", { settled: true }, "succeeded", "counted"],
      ["cancelled", { outcome: "cancelled" }, "cancelled", "1 cancelled"],
      // **The walk's four structural rows** — a stated state over an outcome
      // saying otherwise. Both fields are valid at rest; the readers resolved
      // them in different orders, and a classifier over the outcome alone
      // agrees with none of these.
      ["stated failed over a count", { state: "failed", outcome: "3 matches" }, "failed", "1 failed"],
      ["stated succeeded over failed", { state: "succeeded", outcome: "failed" }, "succeeded", "counted"],
      ["stated cancelled, no outcome", { state: "cancelled" }, "cancelled", "1 cancelled"],
    ];
    for (const [label, spec, state, parent] of rows) {
      const child = call(spec);
      const head = callHead(child, FULL_CAPS) as Notice;
      expect(head.state, `${label}: the head's state`).toBe(state);
      expect(head.tone, `${label}: the head's tone is the state's`).toBe(CALL_STATE_TONE[state]);
      expect(verdict(child), `${label}: the parent counts it as its head says`).toBe(parent);
      expect(spins(child), `${label}: a settled head does not spin`).toBe(false);
    }

    // **And the unsettled two**: running spins and is not counted; queued is
    // still — R-BLK-214 draws it hollow, muted, still (F1261) — and is not
    // counted either. A stated `running` over an outcome is still running.
    for (const [label, spec, state, spin] of [
      ["running", {}, "running", true],
      ["stated running over an outcome", { state: "running", outcome: "3 matches" }, "running", true],
      ["queued", { state: "queued" }, "queued", false],
    ] as const) {
      const child = call(spec);
      expect((callHead(child, FULL_CAPS) as Notice).state, `${label}: the head's state`).toBe(state);
      expect(rollUp([child]), `${label}: unsettled, so the parent has not counted it`).toEqual(["0 of 1"]);
      expect(spins(child), `${label}: ${spin ? "the spinner is running's" : "a queued head is still"}`).toBe(spin);
    }
  });
});

describe("C04 I141 — a notice's state names its tone and its glyph", () => {
  // A document carrying one call head, as plain data — the validator's input is
  // what a far side sends, not a constructed block.
  const docWith = (head: Record<string, unknown>): unknown => {
    const doc = JSON.parse(JSON.stringify(compose({ command: "grep x", blocks: [callHead(call({ outcome: "exit 1" }), FULL_CAPS)] }))) as {
      blocks: Record<string, unknown>[];
    };
    doc.blocks[0] = { ...doc.blocks[0], ...head };
    return doc;
  };
  const errors = (doc: unknown): string => {
    const v = validateDocument(doc);
    return v.ok ? "" : v.error.join("\n");
  };

  it("T2.136 (C04 I141): validateDocument refuses a state outside CallState and a tone or glyph disagreeing with the state, each naming the field", () => {
    // Every state with its own tone and glyph validates.
    for (const state of CALL_STATES) {
      expect(errors(docWith({ state, tone: CALL_STATE_TONE[state], glyph: CALL_HEAD_GLYPH[state] })), state).toBe("");
    }
    // **At validation, not at render** — `"bogus"` validated and threw inside
    // `headMark`, which is the failure this row exists to move.
    expect(errors(docWith({ state: "bogus" }))).toMatch(/"state" is outside its union \(C04 I141\)/u);
    // The shipped defect as a document: a failed head in `info`.
    expect(errors(docWith({ state: "failed", tone: "info", glyph: "running" }))).toMatch(/"tone" must be "error" for state "failed"/u);
    // A queued head drawn filled.
    expect(errors(docWith({ state: "queued", tone: "muted", glyph: "running" }))).toMatch(/"glyph" must be "queued" for state "queued"/u);
    // And without a state, a notice is an ordinary line and neither is checked.
    const plain = docWith({ tone: "info", glyph: "running" }) as { blocks: Record<string, unknown>[] };
    delete plain.blocks[0]!["state"];
    expect(errors(plain), "no state, no claim").toBe("");
  });

  it("T2.137 (C04 I141, C09 I45): b.notice with a state writes the state's tone and glyph and refuses a disagreeing tone; callHead writes both", () => {
    for (const state of CALL_STATES) {
      const built = b.notice(CALL_STATE_TONE[state], "grep x", undefined, { state });
      expect([built.tone, built.glyph], `b.notice, ${state}`).toEqual([CALL_STATE_TONE[state], CALL_HEAD_GLYPH[state]]);
      const head = callHead(call({ state }), FULL_CAPS) as Notice;
      expect([head.tone, head.glyph], `callHead, ${state}`).toEqual([CALL_STATE_TONE[state], CALL_HEAD_GLYPH[state]]);
    }
    // Refused, never corrected — at construction, by `block()` as by the builder.
    expect(() => b.notice("info", "grep x", undefined, { state: "failed" })).toThrow(/"tone" must be "error" for state "failed"/u);
    expect(() => block({ kind: "notice", id: "h", tone: "muted", glyph: "running", state: "queued", text: "x" } as Block)).toThrow(
      /"glyph" must be "queued"/u,
    );
  });
});

describe("C09 I45 — the call head, rendered", () => {
  it("T2.187 (C09 I45, C04 I141, R-BLK-214, R-BLK-220): five states through callHead and the renderer at 24-, 8- and 4-bit read as a cell and an SGR; 1 bit and ASCII five marks", async () => {
    for (const depth of [24, 8, 4] as const) {
      const caps = { ...FULL_CAPS, colourDepth: depth } as TerminalCapabilities;
      const colours = new Map<string, CallState>();
      for (const state of CALL_STATES) {
        const cell = await headCell(state, caps);
        expect(cell.ch, `${String(depth)}-bit, ${state}: the mark`).toBe(state === "queued" ? "○" : "●");
        // **The tone, read off the terminal**, against one cell painted in the
        // state's tone at the same depth: the renderer's answer and the
        // resolver's, compared as a terminal holds them.
        const oracle = await toneCell(CALL_STATE_TONE[state], caps);
        expect([cell.fg, cell.fgMode], `${String(depth)}-bit, ${state}: the head is in ${CALL_STATE_TONE[state]}`).toEqual([oracle.fg, oracle.fgMode]);
        if (state !== "queued") {
          const key = `${String(cell.fgMode)}:${String(cell.fg)}`;
          expect(colours.get(key), `${String(depth)}-bit: ${state} shares its colour with ${String(colours.get(key))}`).toBeUndefined();
          colours.set(key, state);
        }
      }
      expect(colours.size, `${String(depth)}-bit: four filled states, four colours`).toBe(4);
    }
    // **Where tone is gone, the shape carries it**: five marks, no two alike,
    // none of them the coloured rung's pair.
    for (const [rung, caps, expected] of [
      ["1 bit", { ...FULL_CAPS, colourDepth: 1 }, ["○", "●", "✓", "✗", "⊘"]],
      ["ASCII", { ...ASCII_CAPS, colourDepth: 8 }, ["o", "*", "+", "x", "/"]],
    ] as const) {
      const marks = await Promise.all(CALL_STATES.map(async (s) => (await headCell(s, caps as TerminalCapabilities)).ch));
      expect(marks, `${rung}: the states draw ${marks.join(" ")}`).toEqual(expected);
      expect(new Set(marks).size, `${rung}: no two alike`).toBe(5);
    }
    // **The geometry never moves** (C09 I5), carried over from the row this
    // replaced: every candidate at every rung is one cell with no indent, which
    // is what lets `measure` stay capability-free while the character changes.
    for (const caps of [FULL_CAPS, { ...FULL_CAPS, colourDepth: 1 }, ASCII_CAPS] as TerminalCapabilities[]) {
      for (const st of CALL_STATES) expect(glyphCells(headMark(st, caps)), `${st} at ${String(caps.colourDepth)}-bit`).toBe(1);
    }
    expect(GLYPH_TOKENS as readonly string[], "`step` is retired as a slot, not renamed").not.toContain("step");
    // And the row reads as a head, not only a lead cell.
    expect(visible(renderSequenceToLines(registry, [callHead(call({ outcome: "exit 1" }), FULL_CAPS)], 60, { theme: DARK_THEME, capabilities: FULL_CAPS })[0] ?? "")).toMatch(/^● grep\(x\) · exit 1/u);
  });
});
