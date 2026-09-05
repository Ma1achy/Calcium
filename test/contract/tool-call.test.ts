// AGENT_TUI_DESIGN.md §9c — a tool call is a composition, and the frame corrects
// the drawing (C09 §4 `step`, C04 I97, I98).
//
// **The four frames the design was checked against are printed by T2.48**, at
// 80 and 40 columns, 24-bit and ASCII, so the correction in §9c is a capture
// and not a redrawing from intent.
import { describe, expect, it } from "vitest";

import { block, validateDocument } from "../../src/data/viewmodel/index.js";
import { cardBody, entryLayout } from "../../src/shell/entry-layout.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { GLYPH_TOKENS, glyphCells, glyphFor } from "../../src/presentation/blocks/glyphs.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { toolCallDoc, toolCallHeader } from "../../src/shell/documents.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, visible } from "../support/render.js";

const registry = createBlockRegistry({ defaults: true });
const META = { origin: "agent" } as const;
const out = (n: number): Block[] =>
  Array.from({ length: n }, (_u, i) => ({ kind: "raw", id: `o${String(i + 1)}`, text: `line ${String(i + 1)}` }));

const frame = (blocks: readonly Block[], width: number, ascii = false): readonly string[] =>
  renderSequenceToLines(registry, blocks, width, { theme: DARK_THEME, capabilities: ascii ? ASCII_CAPS : FULL_CAPS })
    .map((l) => visible(l).trimEnd());

describe("C09 §4 — the `step` glyph", () => {
  it("T2.45 (C09 I5): `step` is in the vocabulary, `⏺` under unicode and `@` under ASCII, one cell each", () => {
    expect(GLYPH_TOKENS).toContain("step");
    expect(glyphFor("step", FULL_CAPS)).toBe("⏺");
    expect(glyphFor("step", ASCII_CAPS)).toBe("@");
    expect(glyphCells("step")).toBe(1);
  });
});

describe("§9c — the header, the body, and the row the body already has", () => {
  it("C23 T1.50 (C23 I57, F821): entryLayout clears the body's first leading gap in the body run, keeps the rest, and the stored document keeps its blocks by identity", () => {
    const first = block({ kind: "notice", id: "a", tone: "muted", text: "first", gapBefore: true });
    const second = block({ kind: "notice", id: "b", tone: "muted", text: "second", gapBefore: true });
    const step = block({ kind: "notice", id: "h", tone: "info", glyph: "step", text: "ps · ok" });

    // The body run: the first block's gap is dropped, the second keeps its gap.
    const body = cardBody([first, second]);
    expect(body[0]?.gapBefore, "the first body block's gap is cleared").toBeUndefined();
    expect(body[0]?.id).toBe("a");
    expect(body[1]?.gapBefore, "the second keeps its gap").toBe(true);

    // **The stored document is untouched — clearing is per-frame, in the layout**
    // (F821): the card's blocks are the very objects handed in, so a live part
    // declared by identity survives. entryLayout's body run holds the cleared copy.
    const card = [step, first, second];
    const runs = entryLayout(card, 40);
    const bodyRun = runs.find((r) => r.indent > 0);
    expect(card[1], "the document keeps the original object").toBe(first);
    expect(first.gapBefore, "and the original still carries its gap").toBe(true);
    expect(bodyRun?.blocks[0]?.gapBefore, "only the run's copy has it cleared").toBeUndefined();

    // A body whose first block has no leading gap is returned by identity.
    const plain = block({ kind: "notice", id: "c", tone: "muted", text: "plain" });
    expect(cardBody([plain, second])[0], "no gap: the same object").toBe(plain);
  });

  it("T2.46: the header is `name(args) · elapsed · outcome`, and below one second no figure is drawn", () => {
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0" })).toBe(
      "run_command(npm test) · 4s · exit 0",
    );
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 400 })).toBe("run_command(npm test)");
    expect(toolCallHeader({ name: "search", args: '"cursorCell"' })).toBe('search("cursorCell")');
  });

  it("T2.47 (C04 I3, I6): every state composes a valid document, and `error` carries its own message", () => {
    const running = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_000, output: out(12), height: 3 }, META);
    const settled = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0", result: "118 passed, 2 todo" }, META);
    const folded = toolCallDoc("run_command", { name: "run_command", args: "npm test", output: out(392), height: 3, collapsed: true }, META);
    const failed = toolCallDoc("run_command", { name: "run_command", args: "npm test", outcome: "exit 1" }, META, "error");
    for (const doc of [running, settled, folded, failed]) expect(validateDocument(doc).ok, doc.command).toBe(true);
    expect(failed.error?.message).toBe("run_command(npm test) · exit 1");
    expect(running.blocks[0]?.kind === "notice" && running.blocks[0].glyph).toBe("step");
    expect(settled.blocks[1]?.kind === "notice" && settled.blocks[1].glyph).toBe("continuation");
    expect(running.blocks[1]?.kind === "scroll" && running.blocks[1].follow).toBe(true);
  });

  it("T2.48 (C04 I97, I98): the four frames — the body opens at its tail, the fold is the residue row", () => {
    const running = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_000, output: out(12), height: 3 }, META).blocks;
    const settled = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0", result: "118 passed, 2 todo" }, META).blocks;
    const folded = toolCallDoc("run_command", { name: "run_command", args: "npm test", output: out(392), height: 3, collapsed: true }, META).blocks;

    const captured: string[] = [];
    for (const [width, ascii] of [[80, false], [40, false], [80, true], [40, true]] as const) {
      const mark = ascii ? "@" : "⏺";
      const hook = ascii ? "`" : "⎿";
      const more = ascii ? "~" : "⋯";

      const r = frame(running, width, ascii);
      expect(r[0]).toBe(`${mark} run_command(npm test) · 4s`);
      expect(r.slice(1), "the streamed body shows its tail, the hidden rows above").toEqual([
        "line 10", "line 11", "line 12", `${more} 9 above, 0 below`,
      ]);

      const s = frame(settled, width, ascii);
      expect(s).toEqual([`${mark} run_command(npm test) · 4s · exit 0`, `  ${hook} 118 passed, 2 todo`]);

      const f = frame(folded, width, ascii);
      expect(f, "+N more is the residue row").toEqual([`${mark} run_command(npm test)`, `${more} 0 above, 392 below`]);

      captured.push(
        `--- ${String(width)} cols · ${ascii ? "ascii" : "24-bit"}`,
        "running:", ...r, "settled:", ...s, "folded:", ...f,
      );
    }
    console.log(`LANEB-FRAMES\n${captured.join("\n")}\nLANEB-FRAMES-END`);
  });
});

describe("C09 §4 — the head is fitted and is an element, owed at the spec commit", () => {
  it.todo(
    "T2.113 (C09 I46): a step notice whose text overflows measures 1 and renders 1 row at 80, 40 and 20 in both alphabets; with the argument span marked elide the argument ends in the marker and verb, duration and outcome are intact; the control under info wraps to two rows — not deferred on a component: the fitter lands with C2 of the call grammar",
  );
  it.todo(
    "T2.114 (C09 I47): elementsIn over a step notice with no action yields one element with copy equal to the text and no activate; with an action, activate is that action; an info notice with no action yields none — not deferred on a component: GLYPH_ELEMENT lands with C2 of the call grammar",
  );
});
