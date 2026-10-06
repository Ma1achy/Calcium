// C22 I153, I154 — a submitted line keeps its chips (ruling 104 c, F1521).
//
// **Through a built session and the real input path**, because the record is
// written three components from where it is drawn: C17 locates the chips, C23
// writes them on the document, and C22 draws them and hands C26 their elements.
// A row calling `commandRows` alone would pass with the submission dropping
// them on the floor — which is the shape every piece of this was measured in at
// a83b1b30 (§6t.1).
//
// **Read in cells, not in bytes** (panels.test.ts's rule): the ground is a
// background on every cell of the label.
import { afterEach, describe, expect, it, vi } from "vitest";

import { groundSequence } from "../../src/presentation/blocks/paint.js";
import { createEditor, type LineEditor } from "../../src/interaction/editor/index.js";
import { buildSession } from "../support/session.js";
import type { TuiConfig } from "../../src/index.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { opening, settle } from "../support/frame-golden.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { styledScreenFrom } from "../support/styled-screen.js";

const SIZE = { columns: 100, rows: 30 };
const ESC = String.fromCharCode(27);
const SHIFT_TAB = `${ESC}[Z`;
const LABEL = " #1 pasted · 6L ";

const bgOf = (ref: "surface.bgDeep" | "surface.focusGround"): string =>
  styledScreenFrom([`${groundSequence(ref, DARK_THEME, FULL_CAPS)}x`], { columns: 1, rows: 1 })[0]![0]!.style.bg;
const DEEP = bgOf("surface.bgDeep");
const FOCUS = bgOf("surface.focusGround");

const pasteOf = (n: number): string => Array.from({ length: n }, (_, i) => `alpha ${String(i)}`).join("\n");

/**
 * **A local verb taking words**, so the submission settles in the transcript.
 * A shell line was the measured case at a83b1b30 (§6t.1), and a running child
 * attaches the keys (C16 I49), so `⇧⇥` would be the child's here.
 */
const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    {
      name: "note",
      local: true,
      summary: "note",
      args: [{ name: "words", type: "string", required: false, variadic: true, summary: "what to note" }],
      flags: [],
    },
  ],
};
const HANDLERS: NonNullable<TuiConfig["localHandlers"]> = {
  note: () => ({ schema: "tui.view/1", command: "note", status: "ok", blocks: [{ kind: "raw", id: "t", text: "noted" } as never] }),
};

async function session() {
  const stdin = fakeStdin();
  const s = await buildSession(
    { stdin: stdin as never, theme: opening("dark"), capabilities: FULL_CAPS, manifest: MANIFEST, localHandlers: HANDLERS },
    { ...SIZE },
  );
  await settle();
  const send = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    for (let i = 0; i < 4; i += 1) await settle();
  };
  const frame = () => ({ text: s.screen().rows, cells: styledScreenFrom(s.stdout.chunks, SIZE) });
  return { send, frame };
}

/** The grounds under `text` on the first row holding it, cell by cell. */
function groundsUnder(f: ReturnType<Awaited<ReturnType<typeof session>>["frame"]>, row: number, text: string): readonly string[] {
  const line = f.text[row] ?? "";
  const col = line.indexOf(text);
  return (f.cells[row] ?? []).slice(col, col + text.length).map((c) => c.style.bg);
}

afterEach(() => void vi.restoreAllMocks());

describe("C22 I153, I154 — the echo's chips are elements, and focus peeks them", () => {
  it("T4.123 (C22 I153, C22 I154, C23 I104, C26 I33, §6t.3 rows 1, 5): a six-line paste echoes as one row with its chip, and focusing the chip peeks and copies its content", async () => {
    expect(DEEP, "the theme resolves a well").not.toBe("");
    expect(FOCUS, "and a focus ground distinct from it").not.toBe(DEEP);
    const copied = vi.spyOn(Object.getPrototypeOf(createEditor()) as LineEditor, "copyText");

    const s = await session();
    await s.send("/note ");
    await s.send(`${ESC}[200~${pasteOf(6)}${ESC}[201~`);
    await s.send("\r");

    const after = s.frame();
    const echo = after.text.findIndex((r) => r.includes(`❯ /note ${LABEL}`));
    expect(echo, "the echo is the prompt's row").toBeGreaterThanOrEqual(0);
    // **No row is a line of the content**, which is what the six-row echo drew
    // (§6t.1). Not *no row holds `alpha 1`*: the card's head draws the
    // resolved argv — `note(alpha 0 alpha 1 …)`, what ran — on one row.
    expect(after.text.filter((r) => /^\s*alpha \d\s*$/u.test(r)), "and no row is a line of the content").toEqual([]);
    expect(after.text[echo + 1], "the card's head follows the echo directly").toMatch(/^\s*● note\(/u);
    expect(groundsUnder(after, echo, LABEL), "the chip sits in its well").toEqual(Array(LABEL.length).fill(DEEP));

    // `⇧⇥` to the transcript lands on the chip (§6t.3 row 5).
    await s.send(SHIFT_TAB);
    const focused = s.frame();
    const at = focused.text.findIndex((r) => r.includes(`❯ /note ${LABEL}`));
    expect(groundsUnder(focused, at, LABEL), "the focused chip takes the focus ground").toEqual(Array(LABEL.length).fill(FOCUS));
    for (let i = 0; i < 6; i += 1) {
      expect(focused.text.some((r) => r.includes(`alpha ${String(i)}`)), `the peek holds alpha ${String(i)}`).toBe(true);
    }

    await s.send("y");
    expect(copied.mock.calls.at(-1)?.[0], "y copies the content").toBe(pasteOf(6));
  });

  it("T4.123 control (C22 I153): a two-line paste is text — its echo holds alpha 1 and ⇧⇥ opens no peek", async () => {
    const s = await session();
    await s.send("/note ");
    await s.send(`${ESC}[200~${pasteOf(2)}${ESC}[201~`);
    await s.send("\r");
    const after = s.frame();
    expect(after.text.some((r) => /^\s*alpha 1\s*$/u.test(r)), "the echo draws the text's second line as a row").toBe(true);
    expect(after.text.some((r) => r.includes("#1 pasted")), "and no chip").toBe(false);
    const rowsBefore = after.text.filter((r) => r.includes("alpha 0")).length;
    await s.send(SHIFT_TAB);
    expect(s.frame().text.some((r) => r.includes("Detail")), "no peek").toBe(false);
    expect(s.frame().text.filter((r) => r.includes("alpha 0")).length, "nothing new draws the content").toBe(rowsBefore);
  });
});
