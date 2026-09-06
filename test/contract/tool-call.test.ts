// AGENT_TUI_DESIGN.md §9c — a tool call is a composition, and the frame corrects
// the drawing (C09 §4 `step`, C04 I97, I98).
//
// **The four frames the design was checked against are printed by T2.48**, at
// 80 and 40 columns, 24-bit and ASCII, so the correction in §9c is a capture
// and not a redrawing from intent.
import { describe, expect, it } from "vitest";

import { block, validateDocument } from "../../src/data/viewmodel/index.js";
import { cardBody, entryLayout } from "../../src/shell/entry-layout.js";
import type { Action, Block, TextSpan } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { GLYPH_TOKENS, glyphCells, glyphFor } from "../../src/presentation/blocks/glyphs.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { toolCallDoc, toolCallHeader } from "../../src/shell/documents.js";
import { spinnerFrames } from "../../src/presentation/blocks/glyphs.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";

const registry = createBlockRegistry({ defaults: true });
const META = { origin: "agent" } as const;
const out = (n: number): Block[] =>
  Array.from({ length: n }, (_u, i) => ({ kind: "raw", id: `o${String(i + 1)}`, text: `line ${String(i + 1)}` }));

const frame = (blocks: readonly Block[], width: number, ascii = false): readonly string[] =>
  renderSequenceToLines(registry, blocks, width, { theme: DARK_THEME, capabilities: ascii ? ASCII_CAPS : FULL_CAPS })
    .map((l) => visible(l).trimEnd());

describe("C09 §4 — the `step` glyph", () => {
  it("T2.45 (C09 I5, I45): `step` is in the vocabulary, `⬤` under unicode and `*` under ASCII, one cell each and neither an emoji base", () => {
    expect(GLYPH_TOKENS).toContain("step");
    expect(glyphFor("step", FULL_CAPS)).toBe("⬤");
    expect(glyphFor("step", { ...FULL_CAPS, ambiguousWidth: "wide" }), "Neutral: no tier at wide").toBe("⬤");
    expect(glyphFor("step", ASCII_CAPS)).toBe("*");
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

  it("T2.46 (C23 I58): the header is `name(args) · duration · outcome`; running, the spinner owns the duration slot, alone below one second", () => {
    const spin = spinnerFrames(FULL_CAPS);
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0" }, FULL_CAPS)).toBe(
      "run_command(npm test) · 4s · exit 0",
    );
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 400 }, FULL_CAPS), "dispatched: the spinner alone, no figure").toBe(
      `run_command(npm test) · ${spin[0] ?? ""}`,
    );
    expect(toolCallHeader({ name: "search", args: '"cursorCell"' }, FULL_CAPS)).toBe(`search("cursorCell") · ${spin[0] ?? ""}`);
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 4_200 }, FULL_CAPS, 4), "running: the frame is the tick, the figure beside it").toBe(
      `run_command(npm test) · ${spin[4 % spin.length] ?? ""} 4s`,
    );
    expect(toolCallHeader({ name: "run_command", args: "npm test", waiting: true }, FULL_CAPS), "waiting: the spinner and the word, never a figure").toBe(
      `run_command(npm test) · ${spin[0] ?? ""} waiting`,
    );
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 4_200, settled: true }, FULL_CAPS), "settled with no count: the duration alone, tone carries success").toBe(
      "run_command(npm test) · 4s",
    );
    // F828: the separator is a GlyphSet slot resolved against the arm — `-` at ASCII.
    const ascii = spinnerFrames(ASCII_CAPS);
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0" }, ASCII_CAPS)).toBe(
      "run_command(npm test) - 4s - exit 0",
    );
    expect(toolCallHeader({ name: "run_command", args: "npm test", elapsedMs: 400 }, ASCII_CAPS)).toBe(`run_command(npm test) - ${ascii[0] ?? ""}`);
  });

  it("T2.47 (C04 I3, I6): every state composes a valid document, and `error` carries its own message", () => {
    const running = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_000, output: out(12), height: 3 }, META, FULL_CAPS);
    const settled = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0", result: "118 passed, 2 todo" }, META, FULL_CAPS);
    const folded = toolCallDoc("run_command", { name: "run_command", args: "npm test", output: out(392), height: 3, collapsed: true }, META, FULL_CAPS);
    const failed = toolCallDoc("run_command", { name: "run_command", args: "npm test", outcome: "exit 1" }, META, FULL_CAPS, "error");
    for (const doc of [running, settled, folded, failed]) expect(validateDocument(doc).ok, doc.command).toBe(true);
    expect(failed.error?.message).toBe("run_command(npm test) · exit 1");
    expect(running.blocks[0]?.kind === "notice" && running.blocks[0].glyph).toBe("step");
    expect(settled.blocks[1]?.kind === "notice" && settled.blocks[1].glyph).toBe("continuation");
    expect(running.blocks[1]?.kind === "scroll" && running.blocks[1].follow).toBe(true);
  });

  it("T2.48 (C04 I97, I98): the four frames — the body opens at its tail, the fold is the residue row", () => {
    const captured: string[] = [];
    for (const [width, ascii] of [[80, false], [40, false], [80, true], [40, true]] as const) {
      const caps = ascii ? ASCII_CAPS : FULL_CAPS;
      // The composer takes the arm (F828): the separator and the spinner resolve against it.
      const running = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_000, output: out(12), height: 3 }, META, caps).blocks;
      const settled = toolCallDoc("run_command", { name: "run_command", args: "npm test", elapsedMs: 4_200, outcome: "exit 0", result: "118 passed, 2 todo" }, META, caps).blocks;
      const folded = toolCallDoc("run_command", { name: "run_command", args: "npm test", output: out(392), height: 3, collapsed: true }, META, caps).blocks;
      const mark = ascii ? "*" : "⬤";
      const hook = ascii ? "`" : "⎿";
      const more = ascii ? "~" : "⋯";
      const sep = ascii ? "-" : "·";
      const spin = spinnerFrames(caps)[0] ?? "";

      const r = frame(running, width, ascii);
      expect(r[0], "running: the spinner in the duration slot (C23 I58)").toBe(`${mark} run_command(npm test) ${sep} ${spin} 4s`);
      expect(r.slice(1), "the streamed body shows its tail, the hidden rows above").toEqual([
        "line 10", "line 11", "line 12", `${more} 9 above, 0 below`,
      ]);

      const s = frame(settled, width, ascii);
      expect(s).toEqual([`${mark} run_command(npm test) ${sep} 4s ${sep} exit 0`, `  ${hook} 118 passed, 2 todo`]);

      const f = frame(folded, width, ascii);
      expect(f, "+N more is the residue row (C04 I104)").toEqual([`${mark} run_command(npm test) ${sep} ${spin}`, `${more} +392 more`]);

      captured.push(
        `--- ${String(width)} cols · ${ascii ? "ascii" : "24-bit"}`,
        "running:", ...r, "settled:", ...s, "folded:", ...f,
      );
    }
    console.log(`LANEB-FRAMES\n${captured.join("\n")}\nLANEB-FRAMES-END`);
  });
});

describe("C09 §4 — the head is fitted and is an element", () => {
  const LONG = "run_command(pytest tests/unit/test_something_rather_long.py --maxfail=1 -k not_slow) · 4s · exit 0";
  const ARGS = { from: LONG.indexOf("(") + 1, to: LONG.indexOf(")") };
  const head = (spans?: readonly TextSpan[], action?: Action): Block =>
    block({ kind: "notice", id: "h", tone: "info", glyph: "step", text: LONG, ...(spans === undefined ? {} : { spans }), ...(action === undefined ? {} : { action }) });
  const rows = (b: Block, width: number, ascii = false): readonly string[] => frame([b], width, ascii);

  it("T2.113 (C09 I46): a step notice is one row at 80, 40 and 20 in both alphabets; the elide run gives way first and the control wraps", () => {
    for (const ascii of [false, true]) {
      const marker = ascii ? "~" : "…";
      for (const width of [80, 40, 20]) {
        const plain = head();
        expect(registry.measure(plain, width), `measure at ${String(width)}`).toBe(1);
        expect(rows(plain, width, ascii), `rendered rows at ${String(width)}`).toHaveLength(1);
        expect(cells(visible(rows(plain, width, ascii)[0] ?? ""), "narrow"), "and it fits").toBeLessThanOrEqual(width);

        const marked = rows(head([{ ...ARGS, elide: true }]), width, ascii)[0] ?? "";
        expect(marked.startsWith(`${ascii ? "*" : "⬤"} run_command(`), `the verb is intact at ${String(width)}`).toBe(true);
        expect(cells(visible(marked), "narrow"), `and the marked row fits at ${String(width)}`).toBeLessThanOrEqual(width);
        if (width >= 40) {
          // The row can hold verb, marker, duration and outcome: the argument
          // alone gives way, and everything outside it is intact.
          expect(marked.endsWith(") · 4s · exit 0"), `duration and outcome are intact at ${String(width)}`).toBe(true);
          if (width < 80) expect(marked, `the argument ends in the marker at ${String(width)}`).toContain(`${marker}) · 4s · exit 0`);
        } else {
          // Twenty cells cannot hold `⬤ run_command(…) · 4s · exit 0` (29), so
          // the whole row is cut last — after the argument is down to its marker.
          expect(marked, "the argument is its marker before the row is cut").toContain(`(${marker}`);
        }
      }
    }
    // **The control**: the same text under `info` wraps, so the row is about
    // the token and not about the width.
    const control = block({ kind: "notice", id: "c", tone: "info", glyph: "info", text: LONG });
    expect(registry.measure(control, 40)).toBeGreaterThan(1);
    expect(rows(control, 40)).toHaveLength(registry.measure(control, 40));
  });

  it("T2.114 (C09 I47): a step notice is one element with or without an action; an info notice without one is none", () => {
    const bare = registry.elementsIn([head()], 80);
    expect(bare).toHaveLength(1);
    expect(bare[0]?.element.copy).toBe(LONG);
    expect(bare[0]?.element.activate, "no action, no activate — and still a place to stand").toBeUndefined();
    expect(bare[0]?.element.rows).toEqual({ from: 0, to: 1 });

    const action: Action = { kind: "expand", label: "expand", target: "body" };
    const acting = registry.elementsIn([head(undefined, action)], 80);
    expect(acting).toHaveLength(1);
    expect(acting[0]?.element.activate).toEqual(action);

    const info = block({ kind: "notice", id: "i", tone: "info", glyph: "info", text: LONG });
    expect(registry.elementsIn([info], 80), "the gate that keeps a status line out of the ring").toEqual([]);
  });
});
