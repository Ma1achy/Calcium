// C19 §6a — the menu that opens without `Tab`, and C22 I51's route to it.
//
// **Driven as bytes through the decoder, never as calls on the effects.** The
// mechanism under test is a precedence between two router targets: with a layer
// on the stack `activeTarget` answers `overlay`, and a row calling
// `keys.afterEdit()` directly would pass on the day nothing dispatched to it —
// which is the state the shell was in before this file existed, measured rather
// than supposed.
import { describe, expect, it } from "vitest";

import { MENU_ID } from "../../src/interaction/completion/index.js";
import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import type { CompletionSource } from "../../src/interaction/completion/index.js";
import type { Graph } from "../../src/shell/construct.js";

/** One byte at a time: a run arriving together is a paste (C16 §7). */
function type(stdin: { emit(s: string): void }, text: string): void {
  for (const ch of text) stdin.emit(ch);
}

const menuRows = (graph: Graph): readonly string[] => {
  const layer = graph.overlays.top;
  if (layer === null || layer.id !== MENU_ID) return [];
  const table = layer.content.find((b) => b.kind === "table");
  if (table === undefined || table.kind !== "table") return [];
  return table.rows.map((r) => String(r.cells["value"]?.text ?? ""));
};

describe("C19 §6a — the menu opens as you type", () => {
  it("T3.20 (C19 I19): two static candidates open it, one closes it and the ghost carries it", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    // `/h` is `help` and `history`; `/he` is `help` alone. **The one-candidate
    // case is the control, not a courtesy** — a threshold of one draws the same
    // word twice, on the prompt and under it, and passes any row that asks only
    // whether the menu appeared.
    type(stdin, "/h");
    expect(
      graph.overlays.top?.id,
      "two candidates, and no Tab was pressed",
    ).toBe(MENU_ID);
    expect(menuRows(graph)).toEqual(["/help", "/history"]);

    type(stdin, "e");
    expect(graph.overlays.top, "one candidate is ghost text's case").toBeNull();
    expect(graph.editor.text, "and the buffer has only what was typed").toBe(
      "/he",
    );
  });

  it("T3.21 (C19 I22): backspace widens a typed menu rather than dismissing it", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/hi");
    expect(graph.overlays.top, "one candidate: no menu").toBeNull();

    stdin.emit("\u007f");
    // **The opposite answer to T3.12b, on the same key.** A requested menu is
    // dismissed by a keystroke that does not extend the prefix, because
    // widening it would mean running a dynamic source on a keystroke (C19 I3). A
    // typed menu costs a filter over an array, so it comes back.
    expect(graph.editor.text).toBe("/h");
    expect(menuRows(graph), "widened, not dismissed").toEqual([
      "/help",
      "/history",
    ]);
  });

  it("T2.1a (C19 I3): a keystroke runs no dynamic source", async () => {
    // **The boundary, asserted rather than assumed.** The obvious
    // implementation of §6a calls the engine's request path on every keystroke,
    // which runs the dynamic sources (C19 I3) — and every assertion about the candidate
    // set agrees with both. This one does not: the source throws if it is ever
    // reached, so a keystroke that consults it fails here and nowhere else.
    let calls = 0;
    const tripwire: CompletionSource = {
      id: "tripwire",
      slots: [
        "verb",
        "flagName",
        "flagValue",
        "positional",
        "path",
        "executable",
        "none",
      ],
      dynamic: true,
      complete: () => {
        calls += 1;
        throw new Error("a dynamic source ran on a keystroke");
      },
    };

    const { graph, stdin } = await buildGraph({
      completionSources: [tripwire],
    });
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(calls, "no keystroke reaches a dynamic source").toBe(0);
    expect(graph.overlays.top?.id, "and the static menu opened anyway").toBe(
      MENU_ID,
    );

    // The fixture responds to the thing under test: `Tab` does reach it, so a
    // zero above is a fact about the keystroke path rather than about the
    // source never being registered at all.
    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    expect(calls, "Tab still runs it — the control").toBe(1);
  });

  it("T3.22 (C19 I21): Tab over a typed menu runs the dynamic sources and updates the layer", async () => {
    // **Two things that both look like they happen anyway.** The keymap binds
    // `overlay`/`tab` to `menuNext`, so the implementation that does nothing
    // about this moves a highlight and never reaches a source again — the app's
    // own candidates unreachable the day the menu learns to open itself. And
    // `complete` finding the menu already up must `update` it: C15 throws on a
    // duplicate id, inside a promise continuation, where the failure is an
    // unhandled rejection rather than a red row.
    let calls = 0;
    const { graph, stdin } = await buildGraph({
      completionSources: [
        {
          id: "spy",
          slots: ["verb"],
          dynamic: true,
          complete: () => {
            calls += 1;
            return [];
          },
        },
      ],
    });
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(calls, "the typed menu opened without it").toBe(0);

    const pushes: string[] = [];
    graph.overlays.subscribe(
      (c) => void (c.kind === "push" && pushes.push(c.id)),
    );

    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));

    expect(calls, "Tab still means Tab").toBe(1);
    expect(pushes, "updated in place, never pushed a second time").toEqual([]);
    expect(menuRows(graph), "and the same set is still up").toEqual([
      "/help",
      "/history",
    ]);

    // **The recorder is shown to record.** An empty array is what a
    // subscription that never fires produces too, and the two are
    // indistinguishable without this: dismissing and typing again is a push,
    // and it has to arrive here or the assertion above proves nothing.
    graph.overlays.dismiss(MENU_ID);
    type(stdin, "x");
    type(stdin, "\u007f");
    expect(pushes, "the fixture responds to a real push").toEqual([MENU_ID]);
  });

  it("T3.23, T3.24 (C19 I19): Esc holds for the token, and Tab asks again", async () => {
    const { graph, stdin, clock } = await buildGraph();
    graph.lifecycle.acquire();

    // **`/` then `h`, and the first draft used `/h` then `i`.** That one was
    // vacuous and only the mutation pass could say so: `/hi` has a single
    // candidate, so the menu stays shut whether or not `Esc` suppressed
    // anything, and dropping the suppression entirely failed nothing. The
    // suppression is only observable where a menu *would* have opened.
    type(stdin, "/");
    expect(
      menuRows(graph).length,
      "every verb, and the menu is up",
    ).toBeGreaterThan(2);

    // The window has to elapse, and typing through it is a different key: C16
    // holds a lone `Esc` for 50 ms (§2) because `Esc` then `h` is `Alt-h`, so a
    // row that types straight through never sends `Esc` at all — and it fails
    // looking exactly like a suppression that did not work.
    stdin.emit("\u001b");
    clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));
    expect(graph.overlays.top, "Esc dismissed it").toBeNull();

    type(stdin, "h");
    expect(graph.editor.text, "the character still types").toBe("/h");
    expect(
      graph.overlays.top,
      "two candidates would open it, and the dismissal holds for the token",
    ).toBeNull();

    // T3.24 — an explicit request is the user asking again.
    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    expect(menuRows(graph), "Tab clears the hold").toEqual([
      "/help",
      "/history",
    ]);
  });

  it("T3.23 (C19 I19): submitting the line clears the hold", async () => {
    // The other half, and it is a different mechanism rather than a second
    // case: suppression is held per token, and the next line's first token
    // starts at the same offset the dismissed one did — so nothing about the
    // context would ever clear it. The submit path does.
    const { graph, stdin, clock } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/");
    expect(graph.overlays.top?.id).toBe(MENU_ID);

    stdin.emit("\u001b");
    clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));

    stdin.emit("\r");
    type(stdin, "/");
    expect(graph.overlays.top?.id, "a new line, and the menu opens again").toBe(
      MENU_ID,
    );
  });

  it("T3.12, T3.12b: a requested menu narrows in place, and backspace dismisses it", async () => {
    // **C19 §8's requested-menu keystroke cell, unreachable until now.** The
    // character never arrived: with the layer up `activeTarget` is `overlay`,
    // and nothing forwarded what that handler does not bind. Three specs
    // described narrowing and the code had no way to be asked.
    //
    // This is also the row the forward's mutation needed. Removing it left
    // every existing assertion green, because the *display* menu is served by
    // the precedence one line above and only a requested menu depends on the
    // forward itself.
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/");
    stdin.emit("\t");
    await new Promise((r) => setTimeout(r, 0));
    expect(menuRows(graph).length, "a menu the user asked for").toBeGreaterThan(
      2,
    );

    const changes: string[] = [];
    graph.overlays.subscribe((c) => void changes.push(c.kind));

    type(stdin, "h");
    expect(
      graph.editor.text,
      "the character reaches C17 through the layer",
    ).toBe("/h");
    expect(menuRows(graph), "narrowed in place").toEqual(["/help", "/history"]);
    // **No `push` and no `pop`, rather than a count of updates** (C15 T4.7b).
    // The count is two — the layer is updated, then again once C15 has placed
    // it and can say how many candidates were cut — and pinning it here would
    // pin the second pass rather than the claim, which is that the menu is
    // changed in place and never taken down and put back.
    expect(new Set(changes), "in place: no pop, no push").toEqual(
      new Set(["content"]),
    );

    type(stdin, "\u007f");
    expect(
      graph.overlays.top,
      "backspace dismisses it: filtering cannot widen, and widening is a source call",
    ).toBeNull();
  });
});

describe("C19 §6 — the menu's edges", () => {
  it("T3.25 (C19 I23, ruling 90): the first rendered row is a rule, and the last is a candidate", async () => {
    // **Read from the rows, not from the block list.** A block appended and
    // never placed satisfies a test that counts blocks — which is how the same
    // component came to declare a table with no flex column and render a page
    // of ellipses (I18). The frame that argued for this one is `/clear` sitting
    // directly on `❯ /c`, where a reader takes the two as a path.
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/h");
    const layer = graph.overlays.top;
    if (layer === null) throw new Error("the menu did not open");

    const rows = renderSequenceToLines(graph.blocks, layer.content, 80, {
      theme: graph.theme.current,
      capabilities: graph.capabilities,
      // eslint-disable-next-line no-control-regex
    }).map((l) => l.replace(/\u001b\[[0-9;]*m/g, ""));

    // **Both ends**, because the two seams close independently — the bottom one
    // shipped for a round with the top one open, and the menu still read as
    // continuous with the transcript above it. **The bottom one is the
    // prompt's since ruling 90** (F1475): C22 I81 draws a rule above the
    // prompt on every frame, and a rule of the menu's own stacked two. So the
    // menu's last row is a candidate, and the session's C19 T4.12 reads the rule
    // under it.
    const first = rows[0] ?? "";
    const last = rows[rows.length - 1] ?? "";
    expect(first, "a line above, against the transcript").toMatch(/^[─-]/);
    expect(first, "which carries no candidate").not.toContain("/help");
    expect(last, "and no rule of its own below").not.toMatch(/^[─-]/);
    expect(rows.slice(1).filter((r) => /^[─-]{6,}/u.test(r)), "no rule after the first").toEqual([]);
    expect(rows.slice(1).join("\n"), "the candidates are under it").toContain("/history");
  });

  it("T3.26 (C19 I23): the remainder counts rows, and the caller is what is asked", async () => {
    // **Through the shell, because the function was never the defect.** T4.5
    // hands `remainderOf` a row count and agrees with it; nothing asserted the
    // argument the caller supplies, and the caller supplied `content.length` —
    // the number of *boxes*, of which the table holding sixty candidates is
    // one. C15 truncates by clamping height, so the menu said fifty-nine were
    // missing where fifty are.
    const many = Array.from({ length: 60 }, (_, i) => ({
      value: `/entry-${String(i)}`,
      detail: "a verb",
    }));
    const { graph, stdin } = await buildGraph(
      {
        completionSources: [
          { id: "many", slots: ["verb"], dynamic: false, complete: () => many },
        ],
      },
      { columns: 100, rows: 16 },
    );
    graph.lifecycle.acquire();

    type(stdin, "/e");
    const layer = graph.overlays.top;
    if (layer === null) throw new Error("the menu did not open");

    const indicator = layer.content.find((b) => b.kind === "raw");
    expect(
      indicator,
      "the region cannot hold sixty rows, so it truncated",
    ).toBeDefined();

    // **Asserted against the block count's answer rather than recomputed.**
    // Working out the region here would reproduce the arithmetic under test,
    // and a row that agrees with its own copy of the sum is the shape §8b's
    // rows exist to avoid. What is claimed is what the defect was: sixty
    // candidates over a table block is one box, and one box shown of sixty
    // gives fifty-nine.
    const missing = Number(
      /\+ (\d+) more/.exec(String(indicator?.text ?? ""))?.[1] ?? "0",
    );
    expect(
      missing,
      "the block count's answer, which is what it used to say",
    ).not.toBe(59);
    expect(missing, "several rows of candidates are on screen").toBeLessThan(
      59,
    );
    expect(missing, "and most of sixty are not").toBeGreaterThan(0);
  });
});

describe("C19 I23 — the pills window fills its box (F1487)", () => {
  /** A session at 100 × 16 whose `/z` offers sixty candidates, with or without a detail. */
  async function sixty(detail: boolean) {
    const many = Array.from({ length: 60 }, (_, i) => ({
      value: `/z${String(i)}-entry`,
      ...(detail ? { detail: "a verb" } : {}),
    }));
    const stdin = fakeStdin();
    const session = await buildSession(
      {
        stdin: stdin as never,
        completionSources: [{ id: "many", slots: ["verb"], dynamic: false, complete: () => many }],
      },
      { columns: 100, rows: 16 },
    );
    const settled = async (): Promise<void> => {
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setTimeout(r, 0));
    };
    await settled();
    const press = async (bytes: string): Promise<void> => {
      for (const ch of bytes) {
        stdin.emit(ch);
        await settled();
      }
    };
    await press("/z");
    /** Where the menu's box starts on screen: its top rule. */
    const boxTop = (): number => {
      const rows = session.screen().rows.map((r) => r.trimEnd());
      const prompt = rows.findIndex((r) => r.startsWith("❯"));
      return rows.findIndex((r, i) => i < prompt - 1 && /^[─-]{20,}$/u.test(r) && i > 1);
    };
    /** The menu's box: its top rule down to the row above the prompt's rule. */
    const box = (): readonly string[] => {
      const rows = session.screen().rows.map((r) => r.trimEnd());
      const prompt = rows.findIndex((r) => r.startsWith("❯"));
      return rows.slice(boxTop(), prompt - 1);
    };
    /** Wheel notches down over the box's first row of chips (C16 I74), as SGR bytes. */
    const wheelDown = async (notches: number): Promise<void> => {
      const row = boxTop() + 2;
      for (let i = 0; i < notches; i++) {
        stdin.emit(`\u001b[<65;10;${String(row)}M`);
        await settled();
      }
    };
    return { press, box, wheelDown };
  }
  const chips = (row: string): readonly string[] => row.trim().split(/\s{2,}/u).map((c) => c.replace(/^[›*]\s*/u, ""));
  const more = (box: readonly string[]): number => Number(/\+ (\d+) more/u.exec(box.at(-1) ?? "")?.[1] ?? "NaN");

  it("T3.30 (C19 I23, F1487): through the shell, the pills box is full rows of pills, and the indicator counts the rest", async () => {
    // **The control first: the table form under the same cap.** One candidate
    // a row, and the box it fills is the height the pills box must reach.
    const table = await sixty(true);
    const tableBox = table.box();
    expect(tableBox[0], "the menu's top rule").toMatch(/^[─-]{20,}$/u);
    expect(more(tableBox), "the table was cut").toBeGreaterThan(0);

    const pills = await sixty(false);
    const box = pills.box();
    // **The subject**: the pills form, cut. Not the table, whose rows carry a detail.
    expect(box.slice(1, -1).every((r) => !r.includes("a verb")), "the pills form").toBe(true);
    expect(more(box), "and cut").toBeGreaterThan(0);
    // **The box is the table's height, and every row in it holds pills.** F1487
    // drew one row of chips in a box sized for several.
    expect(box.length, "the same cap").toBe(tableBox.length);
    const rows = box.slice(1, -1);
    expect(rows.length, "more than one row of chips").toBeGreaterThan(1);
    expect(rows.every((r) => chips(r).length > 1), "every row between the rule and the indicator holds chips").toBe(true);
    // **The count is the rest**: sixty less the chips drawn.
    const drawn = rows.flatMap(chips);
    expect(more(box), "N is sixty less the chips drawn").toBe(60 - drawn.length);

    // **After ⇥ and enough ↓ to pass the first window**, the selection is drawn
    // and the box keeps its height.
    await pills.press("\t");
    for (let i = 0; i < drawn.length + 3; i++) await pills.press("\u001b[B");
    const moved = pills.box();
    expect(moved.length, "the box keeps its height").toBe(box.length);
    expect(
      moved.slice(1, -1).flatMap(chips),
      "the selected chip is on screen",
    ).toContain(`/z${String(drawn.length + 3)}-entry`);

    // **A wheel run far past the end clamps** (C16 I74), at rest so the wheel
    // owns the window: the last candidate is drawn and the box keeps its height.
    const wheeled = await sixty(false);
    await wheeled.wheelDown(40);
    const end = wheeled.box();
    const endChips = end.slice(1, -1).flatMap(chips);
    expect(endChips, "the wheel moved the window").not.toContain("/z0-entry");
    expect(endChips, "and it stops at the last candidate").toContain("/z59-entry");
    expect(end.length, "the box keeps its height").toBe(box.length);
    expect(more(end), "N is sixty less the chips drawn").toBe(60 - endChips.length);
  });
});

describe("C22 I51 — a menu that opens by itself does not stop typing", () => {
  it("T4.7b: a printable key reaches C17 with the menu open, and Enter submits", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "/h");
    expect(graph.overlays.top?.id, "the layer that takes the keys").toBe(
      MENU_ID,
    );
    expect(graph.router.target, "and C16 routes to it, correctly").toBe(
      // A panel, not a question — the menu relabels the prompt (C15 I27).
      "panel",
    );

    // **The defect this row exists for is a dropped character**, so the control
    // is the same key with nothing open: without it, an assertion that the
    // buffer changed is satisfied by a shell where the menu never opened.
    type(stdin, "i");
    expect(graph.editor.text, "typed through the layer above it").toBe("/hi");

    type(stdin, "s");
    expect(graph.editor.text).toBe("/his");

    stdin.emit("\r");
    // Enter belongs to the prompt while the menu holds no selection (C19 I20).
    // With the menu answering it, this would accept a candidate instead.
    expect(graph.editor.text, "the line was submitted, not completed").toBe("");
  });

  it("T4.7b (control): the same key with no layer open", async () => {
    const { graph, stdin } = await buildGraph();
    graph.lifecycle.acquire();

    type(stdin, "x");
    expect(graph.overlays.top, "nothing static matches, so no menu").toBeNull();
    expect(graph.editor.text, "and the character lands").toBe("x");
  });
});

describe("C19 I30, I31 — the ladder, and a line that goes away (ruling 99, F1497, F1498)", () => {
  it.todo(
    "T3.30 (C19 I30, I23, ruling 99, F1496): sixty candidates with no detail draw one a row, the first marked, the box full and N the rest — not deferred on a component: lands with lane b4-menu3's code commit",
  );
  it.todo(
    "T3.31 (C19 I31, I19, F1498): Esc, backspace to an empty line, and the retyped /c opens the menu — not deferred on a component: lands with lane b4-menu3's code commit",
  );
  it.todo(
    "T3.32 (C19 I31, I20, I22, F1497): a recall closes the menu at rest and ends the hold — not deferred on a component: lands with lane b4-menu3's code commit",
  );
});
