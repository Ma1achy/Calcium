// C22 §6u.4 — the search through a built session (C22 I157, C20 I31, I32; §046).
//
// **Through a session, because the defect was across two components.** The layer
// asserted on its own read right, and the prompt's line, its caret and the
// frame's row count are three more readers of one value (C22 I157).
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 0));
};

type Rung = "colour" | "ascii";
const ENV: Record<Rung, Record<string, string>> = {
  colour: { TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
  ascii: { TERM: "xterm-256color", LANG: "C" },
};

async function searching(rung: Rung, query: string) {
  const stdin = fakeStdin();
  const built = await buildSession({ stdin: stdin as never, env: ENV[rung] }, { columns: 80, rows: 24 });
  await settle();
  const type = async (text: string): Promise<void> => {
    for (const ch of text) {
      stdin.emit(ch);
      await settle();
    }
  };
  for (const line of ["/help", "/history", "/clear"]) {
    await type(line);
    stdin.emit("\r");
    await settle();
  }
  const from = built.stdout.chunks.length;
  stdin.emit(String.fromCharCode(18));
  await settle();
  await type(query);
  const rows = (): string[] => built.screen().rows.map((r) => r.trimEnd());
  const painted = (): string => built.stdout.chunks.slice(from).join("");
  const escape = async (): Promise<void> => {
    stdin.emit("\u001b");
    built.clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));
    await settle();
  };
  return { ...built, stdin, type, rows, painted, escape };
}

/** The last cursor placement and whether the cursor ends the frame shown, from the bytes written. */
function caretAfter(painted: string): { visible: boolean; row: number; col: number } {
  const places = [...painted.matchAll(/\u001b\[(\d+);(\d+)H/g)];
  const last = places.at(-1);
  const toggles = [...painted.matchAll(/\u001b\[\?25([hl])/g)];
  return {
    visible: toggles.at(-1)?.[1] === "h",
    row: Number(last?.[1] ?? 0),
    col: Number(last?.[2] ?? 0),
  };
}

const BACKGROUND = /\u001b\[[0-9;]*48;/;

describe("C22 I157 — the prompt shows the query", () => {
  it("T4.125 (C22 I157, C20 I31, §6u.4 trace rows 1-3): the header counts, the list marks the hit, the prompt line is the query, the footer names the search's keys", async () => {
    const s = await searching("colour", "h");
    const rows = s.rows();
    const at = rows.findIndex((r) => r.startsWith("── reverse search"));
    expect(at, "the header is the layer's edge").toBeGreaterThan(0);
    expect(rows[at], "N of M over the matches").toMatch(/^── reverse search {2}1 of 2 ─+$/);
    expect(rows.slice(at + 1, at + 3), "the hit marked, then the older match").toEqual(["  › /history", "    /help"]);
    expect(rows[at + 3], "the prompt's rule, below the list").toBe("─".repeat(80));
    expect(rows[at + 4], "the query is the prompt's own line").toBe("❯ h");
    expect(rows[at + 6]?.startsWith("/help"), "the prompt's row count is one, so the footer is where it was").toBe(true);
    expect(rows.at(-1), "the keys the search binds, named from the keymap").toBe("find  ⌃R older  ⏎ accept  esc cancel");

    // **The caret is the prompt's, at the end of the query** (C22 I157) — read off the
    // wire, because the frame text cannot say where the cursor is or that it shows.
    expect(caretAfter(s.painted()), "shown, 1-based, after `❯ h` on the prompt row").toEqual({
      visible: true,
      row: at + 5,
      col: "❯ h".length + 1,
    });

    await s.type("z");
    expect(s.rows().find((r) => r.startsWith("── reverse search")), "a typo: no match, hit retained").toMatch(/^── reverse search {2}no match ─+$/);
    const typo = s.rows();
    const from = typo.findIndex((r) => r.startsWith("── reverse search"));
    expect(typo[from + 1], "the retained hit stays, alone: it has no older matches of `hz`").toBe("  › /history");
    expect(typo[from + 2], "the prompt's rule follows it").toBe("─".repeat(80));
    expect(typo[from + 3], "and the query shows the typo").toBe("❯ hz");
  });

  it("T4.125 (C22 I157, C20 I32, trace row 5): `⏎` puts the hit in the prompt and runs nothing; `esc` gives the line back", async () => {
    const accepted = await searching("colour", "h");
    accepted.stdin.emit("\r");
    await settle();
    const rows = accepted.rows();
    expect(rows.some((r) => r.includes("reverse search")), "the search is gone").toBe(false);
    expect(rows.find((r) => r.startsWith("❯ ")), "the hit is in the prompt, to be edited").toBe("❯ /history");
    expect(rows.filter((r) => r.includes("/history")).length, "and nothing ran: no echo of it in the transcript").toBe(1);
    expect(rows.at(-1), "the footer is the prompt's again").toContain("⏎ send");

    const cancelled = await searching("colour", "h");
    await cancelled.escape();
    const after = cancelled.rows();
    expect(after.some((r) => r.includes("reverse search")), "esc closes the panel with the state").toBe(false);
    expect(after.find((r) => r.startsWith("❯")), "and the prompt is as it was: empty").toBe("❯");
  });

  it("T4.125 (C22 I157, §6u.4): at ASCII the figure degrades, and the ground is the colour rung's only", async () => {
    const colour = await searching("colour", "h");
    const ascii = await searching("ascii", "h");
    expect(BACKGROUND.test(colour.painted()), "at colour the current row has a ground").toBe(true);
    const rows = ascii.rows();
    const at = rows.findIndex((r) => r.startsWith("-- reverse search"));
    expect(at, "the header, with the rule's ASCII form").toBeGreaterThan(0);
    expect(rows.slice(at + 1, at + 3), "the mark degrades to its ASCII slot").toEqual(["  * /history", "    /help"]);
    expect(rows[at + 4], "and the prompt's glyph with it").toBe("$ h");
    expect(rows.at(-1), "and the chords are spelled").toBe("find  C-r older  Enter accept  Esc cancel");

    // **1-bit is not a session rung here** (`TERM=dumb` has no alternate screen,
    // and the harness has no other way to ask for it), so what the list does at
    // 1-bit is C11's `current` row — the same table C19's menu draws, which C11
    // I33 and C19's rows read there — and this file names no mark and no ground.
  });
});

describe("C22 I157 — a search another layer has taken the top from", () => {
  it("T4.126 (C22 I157): the prompt shows the query only while the search is on top", async () => {
    const built = await buildGraph({}, { columns: 80, rows: 24 });
    built.graph.lifecycle.acquire();
    const { graph } = built;
    expect(graph.searchShown(), "no search, no derived line").toBeNull();

    built.stdin.emit(String.fromCharCode(18));
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    built.stdin.emit("h");
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(graph.searchShown(), "on top: the query, caret at its end").toEqual({ text: "h", cursor: 1, selection: null });

    graph.overlays.push({
      id: "later",
      kind: "overlay",
      placement: { kind: "centred" },
      content: [{ kind: "raw", id: "later-row", text: "later" }],
      blocking: false,
      dismissal: "escape",
      width: 20,
    });
    expect(graph.searchShown(), "under another layer the prompt is the reader's own").toBeNull();
  });
});

