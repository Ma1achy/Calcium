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
import type { ManifestDocument } from "../../src/data/manifest/index.js";

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

describe("C19 I30 — the menu is a ladder in every case (ruling 99)", () => {
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
    /** Wheel notches down over the box's first candidate row (C16 I74), as SGR bytes. */
    const wheelDown = async (notches: number): Promise<void> => {
      const row = boxTop() + 2;
      for (let i = 0; i < notches; i++) {
        stdin.emit(`\u001b[<65;10;${String(row)}M`);
        await settled();
      }
    };
    return { press, box, wheelDown };
  }
  /** The candidate a row names, or `null` for a row that is not one candidate. */
  const label = (row: string): string | null => /^\s*[›*]?\s*(\/z\d+-entry)(?:\s+a verb)?$/u.exec(row)?.[1] ?? null;
  const more = (box: readonly string[]): number => Number(/\+ (\d+) more/u.exec(box.at(-1) ?? "")?.[1] ?? "NaN");

  it("T3.30 (C19 I30, I23, ruling 99, F1496): sixty candidates with no detail draw one a row, the first marked, the box full and N the rest", async () => {
    // **The control first: the same source with a detail on every candidate.**
    const detailed = await sixty(true);
    const control = detailed.box();
    expect(control[0], "the menu's top rule").toMatch(/^[─-]{20,}$/u);
    expect(more(control), "the control was cut").toBeGreaterThan(0);
    expect(control.slice(1, -1).every((r) => r.endsWith("a verb")), "a hint on each row").toBe(true);

    // **The subject: no detail, and a ladder all the same.** Until ruling 99
    // this drew rows of pills, several candidates to a row and no `›`.
    const plain = await sixty(false);
    const box = plain.box();
    const rows = box.slice(1, -1);
    expect(box.length, "the control's box").toBe(control.length);
    expect(rows.map(label), "one candidate a row, and no hint").toEqual(
      rows.map((_, i) => `/z${String(i)}-entry`),
    );
    expect(rows[0], "the first is current at rest (C19 I29)").toMatch(/^\s*[›*]\s/u);
    expect(rows.map(label), "the control's labels in the control's rows").toEqual(control.slice(1, -1).map(label));
    expect(more(box), "N is sixty less the rows drawn").toBe(60 - rows.length);

    // **After ⇥ and enough ↓ to pass the first window**, the selection is drawn
    // and the box keeps its height.
    await plain.press("\t");
    for (let i = 0; i < rows.length + 3; i++) await plain.press("\u001b[B");
    const moved = plain.box();
    expect(moved.length, "the box keeps its height").toBe(box.length);
    expect(moved.slice(1, -1).map(label), "the selected candidate is on screen").toContain(
      `/z${String(rows.length + 3)}-entry`,
    );

    // **A wheel run far past the end clamps** (C16 I74), at rest so the wheel
    // owns the window: the last candidate is drawn and the box keeps its height.
    const wheeled = await sixty(false);
    await wheeled.wheelDown(40);
    const end = wheeled.box();
    const endRows = end.slice(1, -1).map(label);
    expect(endRows, "the wheel moved the window").not.toContain("/z0-entry");
    expect(endRows.at(-1), "and it stops at the last candidate").toBe("/z59-entry");
    expect(end.length, "the box keeps its height").toBe(box.length);
    expect(more(end), "N is sixty less the rows drawn").toBe(60 - endRows.length);
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

describe("C19 I31 — a line that goes away takes its menu and its hold (F1497, F1498)", () => {
  /** `Esc` alone: C16 holds a lone `Esc` for 50 ms, so the window has to elapse. */
  const escape = async (stdin: { emit(s: string): void }, clock: { advance(ms: number): void }): Promise<void> => {
    stdin.emit("\u001b");
    clock.advance(80);
    await new Promise((r) => setTimeout(r, 80));
  };

  it("T3.31 (C19 I31, I19, F1498): Esc, backspace to an empty line, and the retyped /c opens the menu", async () => {
    const { graph, stdin, clock } = await buildGraph();
    graph.lifecycle.acquire();
    type(stdin, "/c");
    expect(menuRows(graph), "the subject: the menu is up").toEqual(["/capabilities", "/clear", "/config"]);
    await escape(stdin, clock);
    expect(graph.overlays.top, "Esc dismissed it").toBeNull();

    type(stdin, "\u007f\u007f");
    expect(graph.editor.text, "the line is empty").toBe("");
    type(stdin, "/c");
    // **F1498**: the hold was taken at offset 0, and the new line's first token
    // starts there too, so it held and only a ghost showed.
    expect(menuRows(graph), "a new line, and the menu opens").toEqual(["/capabilities", "/clear", "/config"]);

    // **The control: where the line never went, the hold stands.**
    const held = await buildGraph();
    held.graph.lifecycle.acquire();
    type(held.stdin, "/c");
    await escape(held.stdin, held.clock);
    type(held.stdin, "\u007f");
    expect(held.graph.editor.text, "one backspace leaves the token").toBe("/");
    type(held.stdin, "c");
    expect(held.graph.overlays.top, "the same token, still held").toBeNull();
  });

  /** A session at 80 × 24 with `/help` submitted, so `↑` has a line to recall. */
  async function recalled(submitted: boolean) {
    const stdin = fakeStdin();
    const session = await buildSession({ stdin: stdin as never }, { columns: 80, rows: 24 });
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
    const key = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await settled();
    };
    if (submitted) await press("/help\r");
    const rows = (): readonly string[] => session.screen().rows.map((r) => r.trimEnd());
    const prompt = (): string => rows().find((l) => l.startsWith("❯")) ?? "";
    /** The menu's candidate rows: `/help`'s own output lists the verbs, so read the mark's rows and the rows under it. */
    const menu = (): readonly string[] => {
      const r = rows();
      const at = r.findIndex((l) => /^\s*› \//u.test(l));
      if (at < 0) return [];
      const end = r.findIndex((l, i) => i > at && /^[─-]{20,}/u.test(l));
      return r.slice(at, end).map((l) => l.replace(/^\s*›?\s*/u, "").split(/\s{2,}/u)[0] ?? "");
    };
    const escape = async (): Promise<void> => {
      stdin.emit("\u001b");
      session.clock.advance(80);
      await new Promise((r) => setTimeout(r, 80));
      await settled();
    };
    return { press, key, prompt, menu, escape };
  }
  const UP = "\u001b[A";
  const DOWN = "\u001b[B";

  it("T3.32 (C19 I31, I20, I22, F1497): a recall closes the menu at rest and ends the hold", async () => {
    const s = await recalled(true);
    await s.press("/c");
    expect(s.menu(), "the subject: the menu at rest over /c").toEqual(["/capabilities", "/clear", "/config"]);

    await s.key(UP);
    expect(s.prompt(), "↑ at rest is the prompt's (C19 I20)").toBe("❯ /help");
    // **F1497**: `/c`'s candidates stayed, over a line that no longer held `/c`.
    expect(s.menu(), "the menu went with the line").toEqual([]);

    await s.key(DOWN);
    expect(s.prompt(), "the draft comes back").toBe("❯ /c");
    expect(s.menu(), "and a recall rebuilds nothing (C19 I22)").toEqual([]);
    await s.key("\u007f");
    expect(s.menu().length, "an edit does").toBeGreaterThan(2);

    // **`↓` closes one too**: the walk's other direction, over a menu opened
    // by editing the recalled line.
    const d = await recalled(true);
    await d.press("/c");
    await d.key(UP);
    for (let i = 0; i < 3; i++) await d.key("\u007f");
    expect(d.menu(), "the edit opened a menu over /h").toEqual(["/help", "/history"]);
    await d.key(DOWN);
    expect(d.prompt(), "↓ brings the draft back").toBe("❯ /c");
    expect(d.menu(), "and the menu went with /h").toEqual([]);

    // **The hold ends on a recall.** `Esc` holds at offset 0, and `/help`'s
    // first token starts there too, so without this nothing would clear it.
    const h = await recalled(true);
    await h.press("/c");
    await h.escape();
    expect(h.menu(), "Esc dismissed it").toEqual([]);
    await h.key(UP);
    expect(h.prompt()).toBe("❯ /help");
    for (let i = 0; i < 3; i++) await h.key("\u007f");
    expect(h.prompt()).toBe("❯ /h");
    expect(h.menu(), "the menu opens over the recalled line's edit").toEqual(["/help", "/history"]);

    // **The control: nothing to recall, nothing replaced.** The line and the
    // menu stay as they were, so the close is the replacement's and not the key's.
    const none = await recalled(false);
    await none.press("/c");
    const before = none.menu();
    expect(before, "the menu is up").toEqual(["/capabilities", "/clear", "/config"]);
    await none.key(UP);
    expect(none.prompt(), "an empty history recalls nothing").toBe("❯ /c");
    expect(none.menu(), "and the menu stays").toEqual(before);
  });
});

describe("C19 I15 — a key behind an in-flight request (ruling 106, F1524)", () => {
  /** `ps`, with a closed `--status` and an open `--search`: the static set and a slot only a dynamic source answers. */
  const PS: ManifestDocument = {
    schema: "tui.manifest/1",
    binary: "prism",
    version: "1.0.0",
    tools: [
      {
        name: "ps",
        local: false,
        summary: "list processes",
        args: [],
        flags: [
          { name: "status", type: "enum", values: ["running", "failed", "queued"], summary: "filter by status" },
          { name: "search", type: "string", summary: "search" },
        ],
      },
    ],
  };

  /**
   * A session at 100 × 24, and a dynamic source the row answers when it chooses.
   *
   * **One `emit` is one read**, which is the whole subject: the router routes
   * every key in a read synchronously (C22 I24), and `request` resolves no
   * sooner than a microtask later, so a second key in the same read is handled
   * while the first key's request is still in flight — the order a PTY read of
   * `\t\r` produced 3 times in 3 (F1524).
   */
  async function behind({ held: holding = false } = {}) {
    const stdin = fakeStdin();
    let answer: (c: readonly { value: string }[]) => void = () => undefined;
    const held: CompletionSource = {
      id: "held",
      slots: ["flagValue"],
      dynamic: true,
      complete: () => new Promise((r) => void (answer = r)),
    };
    const session = await buildSession(
      // **Registered only where a row holds it.** It answers every
      // `flagValue`, `--status=` included, so registered everywhere it would
      // hold the static rows' requests open too.
      { stdin: stdin as never, manifest: PS, ...(holding ? { completionSources: [held] } : {}) },
      { columns: 100, rows: 24 },
    );
    const settled = async (): Promise<void> => {
      for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
      await new Promise((r) => setTimeout(r, 0));
    };
    await settled();
    const typed = async (text: string): Promise<void> => {
      for (const ch of text) {
        stdin.emit(ch);
        await settled();
      }
    };
    /** One read: every byte in it reaches the router before anything settles. */
    const read = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      await settled();
    };
    const rows = (): readonly string[] => session.screen().rows.map((r) => r.trimEnd());
    const prompt = (): string => rows().filter((l) => l.startsWith("❯")).at(-1) ?? "";
    /** A candidate row's label: the ladder's current mark, or a value indented under it, without its summary. */
    // **The panel's own rows, not every row that looks like one.** A body row is
    // blank under the hook since C22 I88 was amended, so `/help`'s listing began
    // with whitespace and a verb exactly as a candidate does. The panel is the
    // unbroken run directly above the prompt's rule, down to its own edge; an
    // entry ends in a blank row (C22 I85) and so is never part of it.
    const menu = (): readonly string[] => {
      const r = rows();
      const at = r.map((l, i) => (l.startsWith("❯") ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
      let top = at - 2;
      while (top >= 0 && (r[top] ?? "").trim() !== "" && !/^─/u.test(r[top] ?? "")) top -= 1;
      return r
        .slice(top + 1, Math.max(0, at - 1))
        .filter((l) => /^\s+(›\s+)?(running|failed|queued|alpha|beta|\/help|\/history)\b/u.test(l))
        .map((l) => l.trim().split(/\s{2,}/u)[0]!);
    };
    const owner = (): string => rows().find((l) => l.includes("⏎")) ?? "";
    const escape = async (): Promise<void> => {
      stdin.emit("\u001b");
      session.clock.advance(80);
      await new Promise((r) => setTimeout(r, 80));
      await settled();
    };
    const release = async (): Promise<void> => {
      answer([{ value: "alpha" }, { value: "beta" }]);
      await settled();
      await settled();
    };
    return { typed, read, rows, prompt, menu, owner, escape, release };
  }

  it("T3.33 (C19 I15, I20, ruling 106 a, b; F1524): ⇥⏎ in one batch over /ps --status= submits the line shown and leaves no menu over the empty prompt", async () => {
    // **The control first: the fixture reaches the arm under test.** `⇥` alone
    // opens the requested menu, selected, so a row that sees no menu below is
    // seeing the invalidation and not a `⇥` that never answered.
    const control = await behind();
    await control.typed("/ps --status=");
    expect(control.menu(), "the menu at rest over the three values").toHaveLength(3);
    expect(control.owner(), "at rest").toContain("⏎ run");
    await control.read("\t");
    expect(control.menu()[0], "⇥ selects the first").toMatch(/^› running/u);
    expect(control.owner(), "and owns ⏎").toContain("⏎ accept");

    const s = await behind();
    await s.typed("/ps --status=");
    await s.read("\t\r");
    // **Once the request settles** — `settled()` has run the continuation. At
    // a1284cb0 it opened `› running` over this empty prompt (F1524).
    expect(s.prompt(), "the prompt is empty").toBe("❯");
    expect(s.menu(), "no candidate row over it").toEqual([]);
    expect(s.owner(), "and the owner line is the bare prompt's").toContain("⏎ send");
    expect(s.owner(), "not the menu's").not.toContain("⏎ accept");
    // **The line submitted is the one shown** (ruling 106 a): the echo, and
    // history's newest entry, which `↑` recalls into the prompt.
    expect(s.rows().some((l) => l.trim() === "❯ /ps --status="), "the transcript echoes it exactly").toBe(true);
    await s.read("\u001b[A");
    expect(s.prompt(), "and history holds it exactly").toBe("❯ /ps --status=");
  });

  it("T3.34 (C19 I15, I13, I31, ruling 106 b; F1524): every other way the line goes away behind an in-flight ⇥ leaves no menu once it settles", async () => {
    // **Each arm is a different route through the shell** (C19 §8c's
    // classification table), and no two share the line that invalidates.
    const bs = await behind();
    await bs.typed("/ps --status=");
    await bs.read("\t\u007f");
    expect(bs.prompt(), "⌫: the edit happened").toBe("❯ /ps --status");
    expect(bs.menu(), "⌫: and --status='s values are not over it").toEqual([]);

    const kill = await behind();
    await kill.typed("/ps --status=");
    await kill.read("\t\u0015");
    expect(kill.prompt(), "⌃u: emptied").toBe("❯");
    expect(kill.menu(), "⌃u: no menu over the empty line").toEqual([]);

    const up = await behind();
    await up.typed("/help\r");
    await up.typed("/ps --status=");
    await up.read("\t\u001b[A");
    expect(up.prompt(), "↑: the recall").toBe("❯ /help");
    expect(up.menu(), "↑: no menu over the recalled line").toEqual([]);

    const ctrlc = await behind();
    await ctrlc.typed("/ps --status=");
    await ctrlc.read("\t\u0003");
    expect(ctrlc.prompt(), "⌃c over the panel: the line stays").toBe("❯ /ps --status=");
    expect(ctrlc.menu(), "⌃c closes the menu as esc does, and it stays closed").toEqual([]);

    // **Behind a source the row holds open**, so the dismissal and the clear
    // happen while the request is unmistakably in flight.
    const esc = await behind({ held: true });
    await esc.typed("/ps --status=");
    await esc.read("\t");
    await esc.escape();
    expect(esc.menu(), "esc: dismissed").toEqual([]);
    await esc.release();
    expect(esc.menu(), "esc: and the answer does not reopen it").toEqual([]);

    const clear = await behind({ held: true });
    await clear.typed("/ps --search=");
    await clear.read("\t");
    await clear.read("\u0003");
    expect(clear.prompt(), "⌃c at a prompt holding text: cleared").toBe("❯");
    await clear.release();
    expect(clear.menu(), "and the answer opens nothing over the empty line").toEqual([]);

    // **The control: the held source answering with nothing pressed** opens
    // the menu, so an empty menu above is the invalidation's and not a source
    // that never reached the screen.
    const control = await behind({ held: true });
    await control.typed("/ps --search=");
    await control.read("\t");
    await control.release();
    expect(control.menu()[0], "the source's answer, selected").toMatch(/^› alpha/u);
  });

  it("T3.35 (C19 I13, I15, ruling 106 b): a superseded result closes nothing the superseding keystroke opened", async () => {
    const s = await behind();
    await s.typed("/");
    await s.read("\th");
    expect(s.prompt()).toBe("❯ /h");
    // **At a1284cb0 this was empty**: `h` cancelled in the composition root and
    // opened `/help` and `/history`, and the superseded result — empty by C19
    // I13 — reached §5's *none* arm and closed them.
    expect(s.menu(), `the menu h opened, at rest:\n${s.rows().join("\n")}`).toEqual(["› /help", "/history"]);

    // The control: `⇥` alone opens the requested verb menu, so the result does
    // reach the continuation on this line.
    const control = await behind();
    await control.typed("/");
    await control.read("\t");
    expect(control.owner(), "⇥ alone: a selected menu").toContain("⏎ accept");
  });
});
