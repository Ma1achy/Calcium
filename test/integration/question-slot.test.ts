// C23 I74 — a replacing question takes the prompt's rows and nothing else
// (§7f, §101, C22 I80).
//
// **Read off the screen and asserted as the arithmetic.** *The question is
// drawn* is satisfied by a build that drew it over the transcript and by one
// that drew it twice, so what is asserted is where its rows are and what the
// other terms of the frame's identity did while it opened.
import { describe, expect, it } from "vitest";

import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [
    { name: "noise", local: true, summary: "six rows of transcript", args: [], flags: [] },
    { name: "ask", local: true, summary: "a question that never resolves", args: [], flags: [] },
  ],
};

const ROWS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT"];

const handlers: NonNullable<TuiConfig["localHandlers"]> = {
  noise: () =>
    ({
      schema: "tui.view/1",
      command: "noise",
      status: "ok",
      blocks: ROWS.map((t, i) => ({ kind: "raw", id: `r${String(i)}`, text: t })),
    }) as never,
  // **Never resolves**, so the question is up for every frame the row reads.
  // The awaiting handler is the state §101's table is about — an owner is
  // waiting, which is why the layer is not dismissable.
  ask: ((_argv: readonly string[], ctx: { ask: (o: unknown) => Promise<string> }) =>
    ctx.ask({
      question: "may I write to package.json?",
      choices: [
        { key: "a", label: "approve" },
        { key: "d", label: "deny", default: true },
      ],
    }).then(() => ({ schema: "tui.view/1", command: "ask", status: "ok", blocks: [] }))) as never,
};

describe("C23 §7f — the prompt's slot", () => {
  it("T4.70 (C23 I74, C22 I80, §7f): a replacing question takes the prompt's rows, and the identity holds", async () => {
    const stdin = fakeStdin();
    const size = { columns: 100, rows: 30 };
    const session = await buildSession(
      { manifest: MANIFEST, localHandlers: handlers, stdin: stdin as unknown as NodeJS.ReadStream },
      size,
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    };
    const rows = (): readonly string[] => session.screen().rows;

    await type("/noise\r");
    const before = rows();
    expect(before.join("\n"), "the transcript has content to be pushed about").toContain("FOXTROT");

    // **The rules are the frame's own landmarks** (C22 I80). There are two below
    // the region: the one above the prompt and the one above the footer, so the
    // prompt's rows are the band between them and their positions are the
    // arithmetic this row is about.
    const rules = (frame: readonly string[]): readonly number[] =>
      frame.flatMap((r, i) => (/^─+\s*$/u.test(r.trimEnd()) ? [i] : []));
    const promptBand = (frame: readonly string[]): readonly string[] => {
      const marks = rules(frame);
      const lower = marks.at(-1) ?? 0; // cells-ok — a row index
      const upper = marks.at(-2) ?? 0; // cells-ok — a row index
      return frame.slice(upper + 1, lower);
    };

    expect(promptBand(before).length, "one row of prompt before the question").toBe(1);
    expect(promptBand(before)[0], "and it is the editor's").toContain("❯");

    await type("/ask\r");
    const during = rows();
    const band = promptBand(during);

    // **The question is in the prompt's band**, which is the whole of *replace*.
    expect(band.join("\n"), "the question took the prompt's rows").toContain("package.json");
    expect(band.join("\n"), "with its choices, which are what a question is for").toContain("approve");
    // **And the editor is not drawn at all** (C23 I74). A build that put the
    // question above a still-live prompt passes every assertion above.
    expect(band.some((r) => r.includes("❯")), "the editor's line is gone").toBe(false);

    // **The identity, at both frames.** The screen is exactly `rows` tall and
    // the band grew, so the region gave up exactly what the question took —
    // which is the arithmetic C23 I74 preserves, and the opposite of what its first
    // wording claimed.
    expect(during.length, "the screen is the terminal").toBe(size.rows);
    expect(before.length, "at both frames").toBe(size.rows);
    expect(band.length, "the question is taller than the prompt it replaced").toBeGreaterThan(1);
    const regionOf = (frame: readonly string[]): number => (rules(frame).at(-2) ?? 0) - 1; // cells-ok — a row count
    expect(
      regionOf(during) + band.length,
      "the region gave up exactly the rows the question added",
    ).toBe(regionOf(before) + 1);

    // **Nothing was drawn over the transcript.** The rows above the region's
    // own rule are the transcript's, windowed — so the question must not appear
    // among them however tall it is.
    const above = during.slice(0, rules(during).at(-2) ?? 0);
    expect(above.join("\n"), "the question is not over the transcript").not.toContain("package.json");

    await session.tui.stop("exit");
  });
});
