// C22 I143, I144 — the chip preview's own keys, through a built graph (review
// batch 4, shell lane, §6q).
//
// **Bytes in, the graph read out.** The chords are decoded from the wire forms
// a terminal sends (`CSI 1;4B` is `⌥⇧↓`, `ESC o` is `⌥o`), because the defect
// this lane found was between the decoder and the preview: C16's page-scroll
// intercept read `⌥⇧↓` as `⌥↓`, and a row that dispatched a constructed event
// could not have seen it.
import { describe, expect, it, vi } from "vitest";

import { buildGraph, fakeFs } from "../support/session.js";

const ESC = String.fromCharCode(27);
const SCROLL_DOWN = `${ESC}[1;4B`;
const SCROLL_UP = `${ESC}[1;4A`;
const OPEN = `${ESC}o`;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r));
};

const pasteOf = (n: number, word: string): string =>
  Array.from({ length: n }, (_, i) => `${word} ${String(i)}`).join("\n");

describe("C22 I143, I144 — the chip preview's keys, through the graph", () => {
  it("T4.116 (C22 I143, C22 I51, ruling 53): the scroll chords move the box and not the caret, and enter sends the chip's content", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();
    stdin.emit(`${ESC}[200~${pasteOf(40, "line")}${ESC}[201~`);
    await settle();
    const offset = () => graph.layerView("chip-preview").offsets["chip-preview-box"] ?? 0;
    const cursor = graph.editor.cursor;
    const topRow = graph.viewport.scroll.topRow;
    expect(graph.overlays.top?.id, "the preview is up").toBe("chip-preview");

    stdin.emit(SCROLL_DOWN);
    stdin.emit(SCROLL_DOWN);
    await settle();
    expect(offset(), "two rows down").toBe(2);
    expect(graph.editor.cursor, "the caret did not move").toBe(cursor);
    expect(graph.viewport.scroll.topRow, "and the transcript did not page (C16 I40's intercept is ⌥↑/⌥↓ alone)").toBe(topRow);
    stdin.emit(SCROLL_UP);
    await settle();
    expect(offset(), "and one back").toBe(1);

    // **`⏎` is the prompt's** (ruling 53): the line is sent with the chip
    // resolved to its content, and the preview goes with the chip.
    const submitted: string[] = [];
    const submit = vi.spyOn(graph.pipeline, "submit").mockImplementation((line: string) => {
      submitted.push(line);
    });
    stdin.emit("\r");
    await settle();
    submit.mockRestore();
    expect(submitted, "one submission, with the content").toEqual([pasteOf(40, "line")]);
  });

  it("T4.117 (C22 I144, C23 §4, C17 I35): the open chord lends the terminal once and re-mints the chip; with a verb holding the guard it runs nothing and says so", async () => {
    // **No editor first**: the chord says so, and the terminal is never lent.
    {
      const bare = await buildGraph();
      bare.graph.lifecycle.acquire();
      bare.stdin.emit(`${ESC}[200~${pasteOf(6, "row")}${ESC}[201~`);
      await settle();
      const lent = vi.spyOn(bare.graph.lifecycle, "suspend");
      bare.stdin.emit(OPEN);
      await settle();
      expect(lent, "nothing was suspended").not.toHaveBeenCalled();
      const said = bare.graph.transcript.entries.at(-1)?.doc.blocks[0];
      expect(said?.kind === "notice" ? [said.tone, said.text] : null).toEqual([
        "warn",
        "no editor — set $VISUAL or $EDITOR",
      ]);
    }

    const fs = fakeFs();
    const { graph, stdin } = await buildGraph({ fs, env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", EDITOR: "vi" } });
    graph.lifecycle.acquire();
    stdin.emit(`${ESC}[200~${pasteOf(6, "row")}${ESC}[201~`);
    await settle();
    const before = graph.editor.chipAt();
    expect(before?.lines, "a six-line chip").toBe(6);

    // The loan: suspend, the child, resume — the child deletes a line.
    const order: string[] = [];
    const suspend = vi.spyOn(graph.lifecycle, "suspend").mockImplementation(() => void order.push("suspend"));
    const resume = vi.spyOn(graph.lifecycle, "resume").mockImplementation(() => void order.push("resume"));
    const handoff = vi.spyOn(graph.runner, "handoff").mockImplementation(async (argv) => {
      order.push("handoff");
      const path = argv[4] ?? "";
      await fs.writeFile(path, (await fs.readFile(path)).replace("row 3\n", ""));
      return { code: 0, signal: null };
    });
    const appended = graph.transcript.entries.length;

    stdin.emit(OPEN);
    await settle();
    expect(order, "the handoff sequence, once").toEqual(["suspend", "handoff", "resume"]);
    expect(handoff.mock.calls[0]?.[0].slice(0, 4)).toEqual(["sh", "-c", 'vi "$1"', "sh"]);
    const after = graph.editor.chipAt();
    expect([after?.ordinal, after?.lines, after?.content], "re-minted in place, one line fewer").toEqual([
      before?.ordinal,
      5,
      pasteOf(6, "row").replace("row 3\n", ""),
    ]);
    expect(graph.transcript.entries.length, "a paste that came back appends nothing").toBe(appended);
    graph.editor.undo();
    expect(graph.editor.chipAt()?.lines, "one undo unit brings the six lines back").toBe(6);

    suspend.mockRestore();
    resume.mockRestore();
    handoff.mockRestore();

    // **With a verb holding the guard**, nothing is lent and the refusal is on
    // the transcript, naming the verb. A local verb whose handler has not
    // returned holds it, and the prompt keeps taking keys meanwhile.
    let finish: () => void = () => undefined;
    const busy = await buildGraph({
      fs,
      env: { TERM: "xterm-256color", LANG: "en_GB.UTF-8", EDITOR: "vi" },
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "slow", local: true, summary: "slow", args: [], flags: [] }],
      },
      localHandlers: {
        slow: () =>
          new Promise((resolve) => {
            finish = () => resolve({ schema: "tui.view/1", status: "ok", blocks: [] });
          }),
      },
    } as never);
    busy.graph.lifecycle.acquire();
    busy.graph.pipeline.submit("/slow");
    await settle();
    expect(busy.graph.pipeline.inFlight, "the guard is held").toBe("local");
    busy.stdin.emit(`${ESC}[200~${pasteOf(6, "row")}${ESC}[201~`);
    await settle();
    const lent = vi.spyOn(busy.graph.lifecycle, "suspend");
    busy.stdin.emit(OPEN);
    await settle();
    expect(lent, "nothing was suspended").not.toHaveBeenCalled();
    const said = busy.graph.transcript.entries.at(-1)?.doc.blocks[0];
    expect(said?.kind === "notice" ? [said.tone, said.text] : null).toEqual([
      "warn",
      "slow is still running, and ⌥o waits for it",
    ]);
    finish();
  });

});
