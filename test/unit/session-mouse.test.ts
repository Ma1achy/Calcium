// C16 §4a, I31 — the pointer reaches the states the keys reach, and no others.
//
// **Every row names *which* element**, never that one was focused: a hit test
// that lands inside the bounds and on the wrong row passes every containment
// assertion, and the two translations the walk found (the chrome rows, and a
// `scroll`'s content space) both produce exactly that — a correct-looking focus
// one row or one offset away from the pointer.
//
// **Two harnesses, as `session-navigation.test.ts`.** `buildGraph` stubs
// `render`, so the stored location is asserted there through the real router
// and the real viewport; `buildSession` paints, so the frame is read there —
// a click whose only witness is the store would pass with the highlight drawn
// on the wrong entry.
//
// Geometry, derived once and used throughout (`buildGraph` at 80 columns; the
// harness's frame puts a 20-row region at terminal row 1):
//
//   entry  row 0  `/rows` command line     (C14 I20 — chrome, part of the height)
//          row 1  table header
//          row 2  a      row 3  b      row 4  c
//
// so entry 1 occupies transcript rows 0–4 and entry 2 rows 5–9. **The frame
// bottom-aligns a short transcript** (`paint.ts`), so those rows sit against the
// prompt with `20 − totalRows` blank rows above them — `term()` below is that
// translation, and T4.62c is where it is read off a painted frame rather than
// computed. The control rows — a click on the header, on the command line, on
// the blank rows above — are what makes the derivation an assertion.
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition, FocusState } from "../../src/presentation/blocks/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { addr } from "../support/focus.js";

type Mouse = Extract<InputEvent, { kind: "mouse" }>;

/** A press at a terminal (row, col); `over` sets the fields a drag or a release differ in. */
const mouse = (row: number, col = 0, over: Partial<Mouse> = {}): InputEvent => ({
  kind: "mouse",
  row,
  col,
  button: "button0",
  press: true,
  shift: false,
  meta: false,
  ctrl: false,
  motion: false,
  ...over,
});

const META = {
  verb: "rows",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};

/** A three-row table with `suffix` on every id; `a` carries a `fill` when asked. */
const table = (suffix: string, action = false): Record<string, unknown> => ({
  kind: "table",
  id: `t${suffix}`,
  columns: [{ key: "name", label: "Name", align: "left", priority: 10, minWidth: 12, sortable: false }],
  rows: [
    {
      id: `a${suffix}`,
      cells: { name: { text: `alpha-${suffix}` } },
      ...(action ? { actions: [{ kind: "fill", label: `pick ${suffix}`, command: `pick ${suffix}` }] } : {}),
    },
    { id: `b${suffix}`, cells: { name: { text: `beta-${suffix}` } } },
    { id: `c${suffix}`, cells: { name: { text: `gamma-${suffix}` } } },
  ],
});

/** Five one-row children in a three-row box: two are always out of the box (C26 I3). */
const BOX = {
  kind: "scroll",
  id: "s",
  height: 3,
  children: [
    { kind: "raw", id: "n1", text: "ONE" },
    { kind: "raw", id: "n2", text: "TWO" },
    { kind: "raw", id: "n3", text: "THREE" },
    { kind: "raw", id: "n4", text: "FOUR" },
    { kind: "raw", id: "n5", text: "FIVE" },
  ],
};

const doc = (command: string, blocks: readonly unknown[]) => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
  meta: META,
});

const AT = (entryId: string, elementId: string, blockId: string, anchor: ReturnType<typeof addr> | null = null) => ({
  at: "liveBlock",
  entryId,
  element: addr(elementId, blockId),
  anchor,
  mode: "navigate",
});

/** The harness's frame: a 20-row region starting at terminal row 1 (`test/support/session.ts`). */
const REGION = { top: 1, height: 20 };

/**
 * A graph whose viewport is the region's height — `buildGraph` never renders, so
 * nothing resizes the viewport from its opening guess, and the two heights must
 * agree for the frame's alignment to mean anything.
 */
async function graphAt80() {
  const built = await buildGraph({}, { columns: 80, rows: 30 });
  built.graph.viewport.resize({ width: 80, height: REGION.height });
  /** Transcript row → terminal row, through the frame's bottom alignment. */
  const term = (transcriptRow: number): number => {
    const { totalRows } = built.graph.viewport.scroll;
    return REGION.top + Math.max(0, REGION.height - totalRows) + transcriptRow;
  };
  return { ...built, term };
}

/** Two entries of three rows each, through the real router and the real viewport. */
async function twoEntries(withActions = false) {
  const built = await graphAt80();
  const settled = built.graph.transcript.append(doc("/rows", [table("1", withActions)]) as never);
  const live = built.graph.transcript.append(doc("/rows", [table("2", withActions)]) as never);
  return { ...built, settled, live };
}

describe("C16 §4a — a click lands where the keys would", () => {
  it("T4.62 (C16 I31, C26 I21): a click at the settled entry's second row focuses that row, and the frame agrees", async () => {
    const { graph, settled, live, term } = await twoEntries();
    expect(graph.focus.current).toEqual({ at: "prompt" });

    // Ten transcript rows in a twenty-row region: ten blank rows above, and a
    // click on them is on nothing (row l).
    expect(graph.viewport.scroll.totalRows).toBe(10);
    expect(term(0), "the first transcript row is ten rows down the region").toBe(11);
    expect(graph.router.dispatch(mouse(REGION.top + 3, 2)), "a blank row above the transcript").toBe(false);
    expect(graph.focus.current).toEqual({ at: "prompt" });

    // Transcript row 3 is entry 1's `b` (chrome 0, header 1, a 2, b 3).
    expect(graph.router.dispatch(mouse(term(3), 2))).toBe(true);
    expect(graph.focus.current, "the settled entry, its second row — not the live entry, not its first").toEqual(
      AT(settled, "b1", "t1"),
    );
    expect(graph.focusedEntryId()).toBe(settled);
    expect(graph.focusedEntryId()).not.toBe(live);

    // The keys agree it is the same state: `↓` steps to `c1` inside the entry.
    graph.router.dispatch({ kind: "key", key: { name: "down", ctrl: false, meta: false, shift: false, sequence: "" } });
    expect(graph.focus.current).toEqual(AT(settled, "c1", "t1"));

    // A click on the live entry's third row moves the outer scope, as `tab` does.
    graph.router.dispatch(mouse(term(9), 2));
    expect(graph.focus.current).toEqual(AT(live, "c2", "t2"));
  });

  it("T4.62b (C16 I31, §4a row b): the chrome comes off first — the row above `b` is `a`, and the command line is nothing", async () => {
    const { graph, settled, term } = await twoEntries();

    graph.router.dispatch(mouse(term(2), 2));
    expect(graph.focus.current, "one row up is the first row").toEqual(AT(settled, "a1", "t1"));

    // **The row a version without the subtraction lands on.** Without it the
    // click at transcript row 2 would read as block row 2 — `b1` — and every
    // assertion about *a row being focused* would pass one row low.
    expect(
      graph.router.dispatch(mouse(term(0), 2)),
      "the command line is no element, and the event is unconsumed",
    ).toBe(false);
    expect(graph.focus.current, "and focus did not move").toEqual(AT(settled, "a1", "t1"));
    expect(graph.router.dispatch(mouse(term(1), 2)), "the header is no element either").toBe(false);
    expect(graph.focus.current).toEqual(AT(settled, "a1", "t1"));
  });

  it("T4.63 (C16 I31, §4a row c): from the prompt a click enters, and the column decides which chip", async () => {
    const { graph, term } = await graphAt80();
    const live = graph.transcript.append(
      doc("/pills", [
        {
          kind: "pills",
          id: "p",
          chips: [{ label: "alpha" }, { label: "bravo" }, { label: "charlie" }],
        },
      ]) as never,
    );
    // The chips' columns, from the same list the keyboard walks (C26 §5) — the
    // row asserts that the pointer's column selects among them, not where they are.
    const chips = graph.liveElements();
    expect(chips.map((c) => c.element.id)).toEqual(["chip-0", "chip-1", "chip-2"]);
    const second = chips[1]?.element.cols;
    if (second === undefined) throw new Error("no second chip");
    expect(second.from, "the fixture has two chips on one row with distinct columns").toBeGreaterThan(0);

    // Chrome 0, chips on block row 0 → transcript row 1.
    expect(graph.focus.current).toEqual({ at: "prompt" });
    graph.router.dispatch(mouse(term(1), second.from + 1));
    expect(graph.focus.current, "the second chip, not the first on the same row").toEqual(AT(live, "chip-1", "p"));

    graph.router.dispatch(mouse(term(1), 0));
    expect(graph.focus.current).toEqual(AT(live, "chip-0", "p"));

    // Past the last chip on the row: no element, unconsumed, focus stays.
    const last = chips[2]?.element.cols.to ?? 0;
    expect(graph.router.dispatch(mouse(term(1), last + 3))).toBe(false);
    expect(graph.focus.current).toEqual(AT(live, "chip-0", "p"));
  });

  it("T4.64 (C16 I31, §4a trace 7; C23 I18): click again activates — and on a settled entry reaches the refusal", async () => {
    const { graph, settled, live, term } = await twoEntries(true);

    // **A table with an action is two rows taller** — the action hint below the
    // body — so entry 2 starts at transcript row 7 and its `a2` is row 9. The
    // fixture is shown to have that shape before it is asserted against
    // (`test/support/README.md`).
    expect(graph.viewport.entryAtRow(7)).toEqual({ id: live, rowOffset: 0 });
    expect(graph.viewport.entryAtRow(6)).toEqual({ id: settled, rowOffset: 6 });
    const a2 = term(9);
    const a1 = term(2);

    // Live entry, row `a2`: focus, then activate — the `fill` lands in the prompt.
    graph.router.dispatch(mouse(a2, 2));
    expect(graph.focus.current).toEqual(AT(live, "a2", "t2"));
    expect(graph.editor.text).toBe("");
    graph.router.dispatch(mouse(a2, 2));
    expect(graph.editor.text, "the second click is ⏎").toBe("pick 2");
    // A third click is the same state test: it fills again, as `⏎ ⏎` does.
    graph.router.dispatch(mouse(a2, 2));
    expect(graph.editor.text).toBe("pick 2");
    expect(graph.focus.current, "activation does not move focus").toEqual(AT(live, "a2", "t2"));

    // Settled entry, row `a1`: the refusal, patched into *that* entry.
    graph.editor.setText("");
    const revBefore = (id: string): number => graph.transcript.entries.find((e) => e.id === id)?.rev ?? -1;
    const settledRev = revBefore(settled);
    const liveRev = revBefore(live);
    graph.router.dispatch(mouse(a1, 2));
    expect(graph.focus.current).toEqual(AT(settled, "a1", "t1"));
    graph.router.dispatch(mouse(a1, 2));
    expect(graph.editor.text, "the frozen entry's fill did not run").toBe("");
    expect(revBefore(settled), "the refusal was patched into the settled entry").toBeGreaterThan(settledRev);
    expect(revBefore(live), "and not into the live one").toBe(liveRev);
    const refused = graph.transcript.entries.find((e) => e.id === settled);
    expect(JSON.stringify(refused?.doc.blocks)).toMatch(/frozen entry/);
    expect(graph.focus.current, "focus survives the refusal").toEqual(AT(settled, "a1", "t1"));
  });

  it("T4.64b (C16 I31, §4a trace 3; C26 I14): in interaction the second click is the block's, and the framework fires nothing", async () => {
    const { graph, live, term } = await twoEntries(true);
    graph.router.dispatch(mouse(term(9), 2)); // `a2` — T4.64's geometry
    expect(graph.focus.current).toEqual(AT(live, "a2", "t2"));
    graph.focus.setMode("interact");
    expect(graph.router.target).toBe("interaction");

    expect(graph.router.dispatch(mouse(term(9), 2)), "unconsumed: no block pointer vocabulary exists").toBe(false);
    expect(graph.editor.text, "no fill").toBe("");
    expect(graph.focus.current.at === "liveBlock" && graph.focus.current.mode).toBe("interact");

    // A click on another element is a move, and a move leaves the mode (C26 I16).
    graph.router.dispatch(mouse(term(10), 2));
    expect(graph.focus.current).toEqual(AT(live, "b2", "t2"));
  });
});

describe("C16 §4a — a drag is ⇧↓", () => {
  it("T4.65 (C16 I31, §4a traces 1 and 5; C26 I16): press, motion, motion selects three; another entry is not a head", async () => {
    const { graph, settled, live, term } = await twoEntries();

    graph.router.dispatch(mouse(term(2), 2)); // press on a1
    expect(graph.focus.current).toEqual(AT(settled, "a1", "t1"));

    graph.router.dispatch(mouse(term(3), 2, { motion: true })); // onto b1
    expect(graph.focus.current).toEqual(AT(settled, "b1", "t1", addr("a1", "t1")));

    graph.router.dispatch(mouse(term(4), 2, { motion: true })); // onto c1
    expect(graph.focus.current, "the anchor stays on the first extension — three selected").toEqual(
      AT(settled, "c1", "t1", addr("a1", "t1")),
    );

    // The release leaves nothing behind, and is unconsumed.
    expect(graph.router.dispatch(mouse(term(4), 2, { press: false }))).toBe(false);
    expect(graph.focus.current).toEqual(AT(settled, "c1", "t1", addr("a1", "t1")));

    // Motion onto the live entry's row: not a head for this anchor (trace 5).
    expect(graph.router.dispatch(mouse(term(7), 2, { motion: true }))).toBe(false);
    expect(graph.focus.current, "unchanged").toEqual(AT(settled, "c1", "t1", addr("a1", "t1")));
    expect(graph.focusedEntryId()).not.toBe(live);

    // Motion over the header — no element — leaves it too (trace 4), and a
    // motion back onto `b1` extends from the anchor still at `a1`.
    expect(graph.router.dispatch(mouse(term(1), 2, { motion: true }))).toBe(false);
    graph.router.dispatch(mouse(term(3), 2, { motion: true }));
    expect(graph.focus.current).toEqual(AT(settled, "b1", "t1", addr("a1", "t1")));

    // A plain click collapses the selection (row g).
    graph.router.dispatch(mouse(term(4), 2));
    expect(graph.focus.current).toEqual(AT(settled, "c1", "t1"));
  });

  it("T4.65b (C16 I31, §4a row 6): motion with focus at the prompt selects nothing", async () => {
    const { graph, term } = await twoEntries();
    expect(graph.router.dispatch(mouse(term(3), 2, { motion: true }))).toBe(false);
    expect(graph.focus.current).toEqual({ at: "prompt" });
  });
});

describe("C16 §4a — the wheel scrolls the box under it, or else the transcript", () => {
  /**
   * A `scroll` entry first and a tall filler last, scrolled to the top: the box
   * sits at region rows 1–3 (chrome 0, residue 4) and the filler is below it.
   * Both counters are asserted after every step, because a version that moved
   * both passes either half alone.
   */
  async function boxAndFiller() {
    const { graph } = await graphAt80();
    const boxed = graph.transcript.append(doc("/box", [BOX]) as never);
    const lines = Array.from({ length: 60 }, (_, i) => `line ${String(i)}`).join("\n");
    graph.transcript.append(doc("/filler", [{ kind: "raw", id: "f", text: lines }]) as never);
    graph.viewport.scrollToTop();
    expect(graph.viewport.scroll.topRow).toBe(0);
    expect(graph.viewport.scroll.totalRows).toBeGreaterThan(graph.viewport.scroll.viewportHeight);
    return { graph, boxed };
  }

  it("T4.66 (C16 I31, §4a trace 6; C04 I48): a wheel in the box moves the box; over prose it moves the transcript", async () => {
    const { graph, boxed } = await boxAndFiller();
    const offset = (): number => graph.scrollOffsets.get(boxed, "s");
    const top = (): number => graph.viewport.scroll.topRow;
    expect([offset(), top()]).toEqual([0, 0]);

    // Terminal row 3 is box row 1 (region row 2, block row 1).
    expect(graph.router.dispatch(mouse(3, 2, { button: "wheelDown" }))).toBe(true);
    expect([offset(), top()], "the box moved by the wheel step and the transcript did not").toEqual([3, 0]);
    expect(graph.focus.current, "focus does not move (C26 I18)").toEqual({ at: "prompt" });

    // Over the filler's prose (terminal row 12): the transcript moves, the box does not.
    expect(graph.router.dispatch(mouse(12, 2, { button: "wheelDown" }))).toBe(true);
    expect([offset(), top()]).toEqual([3, 3]);

    // The residue row (terminal row 5) is not the box: the transcript again.
    graph.viewport.scrollToTop();
    expect(graph.router.dispatch(mouse(5, 2, { button: "wheelDown" }))).toBe(true);
    expect([offset(), top()]).toEqual([3, 3]);

    // A horizontal wheel over the box does nothing at all (row j).
    graph.viewport.scrollToTop();
    expect(graph.router.dispatch(mouse(3, 2, { button: "wheelLeft" }))).toBe(false);
    expect([offset(), top()]).toEqual([3, 0]);
  });

  it("T4.66b (C16 I31, §4a row c; C26 I3): inside a scrolled box the pointer is at boxRow + offset", async () => {
    const { graph, boxed } = await boxAndFiller();

    // The control: unscrolled, the first box row is the first child.
    graph.router.dispatch(mouse(2, 2));
    expect(graph.focus.current).toEqual(AT(boxed, "n1", "s"));

    // Scrolled by two — the state, constructed — the same click is the third.
    // A hit by `rows` alone answers `n1` here: inside the bounds, and wrong by
    // exactly the offset.
    graph.scrollOffsets.nudge(boxed, "s", 2);
    graph.router.dispatch(mouse(2, 2));
    expect(graph.focus.current, "the child under the pointer, not the one at content row 0").toEqual(
      AT(boxed, "n3", "s"),
    );
    graph.router.dispatch(mouse(4, 2));
    expect(graph.focus.current, "the box's last row shows the fifth child").toEqual(AT(boxed, "n5", "s"));

    // The residue row is no element of the box's; focus stays.
    expect(graph.router.dispatch(mouse(5, 2))).toBe(false);
    expect(graph.focus.current).toEqual(AT(boxed, "n5", "s"));
  });
});

describe("C16 §4a — chrome, the release and the other buttons", () => {
  it("T4.67 (C16 I31, §4a trace 8): a click on the prompt row returns to the prompt; a release or a second button moves nothing", async () => {
    const { graph, settled, term } = await twoEntries();
    graph.router.dispatch(mouse(term(3), 2));
    expect(graph.focus.current).toEqual(AT(settled, "b1", "t1"));

    // A release over another element, then a middle button, then a shift-click.
    expect(graph.router.dispatch(mouse(term(2), 2, { press: false }))).toBe(false);
    expect(graph.router.dispatch(mouse(term(2), 2, { button: "button1" }))).toBe(false);
    expect(graph.router.dispatch(mouse(term(2), 2, { shift: true }))).toBe(false);
    expect(graph.focus.current, "none of the three is a gesture in the table").toEqual(AT(settled, "b1", "t1"));

    // The harness's region is rows 1–20; row 21 is the prompt, which is chrome.
    expect(graph.router.dispatch(mouse(21, 2))).toBe(true);
    expect(graph.focus.current).toEqual({ at: "prompt" });
  });
});

/**
 * A kind that records what focus the render context carried, per block — the
 * frame's own account of what is highlighted (`session-navigation.test.ts`).
 */
function watching(): {
  definition: BlockDefinition;
  seen: () => readonly Readonly<{ id: string; focus: FocusState | null }>[];
} {
  const seen: { id: string; focus: FocusState | null }[] = [];
  return {
    seen: () => seen,
    definition: {
      kind: "probe",
      measure: () => 1,
      render: (b, ctx) => {
        seen.push({ id: b.id, focus: ctx.focus });
        return inkRows(["probe"]);
      },
    },
  };
}

const lastFocus = (
  seen: readonly Readonly<{ id: string; focus: FocusState | null }>[],
  id: string,
): FocusState | null | "never rendered" => {
  const hit = [...seen].reverse().find((s) => s.id === id);
  return hit === undefined ? "never rendered" : hit.focus;
};

/** SGR 1006, as the terminal sends it: 1-based column and row. */
const sgrClick = (row0: number, col0: number): string => `[<0;${String(col0 + 1)};${String(row0 + 1)}M`;

describe("C16 §4a — the frame side", () => {
  it("T4.62c (C16 I31): the click's highlight is on the settled entry's second row, read from the painted frame", async () => {
    const stdin = fakeStdin();
    const w = watching();
    let n = 0;
    const s = await buildSession(
      {
        stdin: stdin as never,
        blocks: [w.definition],
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "rows", local: true, summary: "three rows", args: [], flags: [] }],
        },
        localHandlers: {
          rows: () => {
            n += 1;
            return {
              schema: "tui.view/1",
              status: "ok",
              blocks: [table(String(n)), { kind: "probe", id: `q${String(n)}` }],
            };
          },
        },
      } as never,
      { columns: 80, rows: 24 },
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };
    await type("/rows\r");
    await Promise.resolve();
    await type("/rows\r");
    await Promise.resolve();

    // **Where the rows are, read from the frame before anything is clicked.**
    // The geometry is asserted, not assumed: `beta-1` is the row the click
    // below lands on, and the derivation (header 0, chrome, header, a, b) is
    // checked against what the terminal shows.
    const text = s.screen().text;
    const betaRow = text.findIndex((line) => line.includes("beta-1"));
    expect(betaRow, "the settled entry's second row is on screen").toBeGreaterThan(0);
    expect(text[betaRow - 1], "with the first row above it").toContain("alpha-1");
    expect(lastFocus(w.seen(), "q1"), "nothing is highlighted before the click").toBeNull();
    expect(lastFocus(w.seen(), "q2")).toBeNull();

    await type(sgrClick(betaRow, 3));
    expect(lastFocus(w.seen(), "q1"), "the settled entry's second row, on screen").toEqual({
      blockId: "t1",
      rowId: "b1",
    });
    expect(lastFocus(w.seen(), "q2"), "and the live entry drew no highlight").toBeNull();

    // The row above, in the same frame's coordinates, is the first row.
    await type(sgrClick(betaRow - 1, 3));
    expect(lastFocus(w.seen(), "q1")).toEqual({ blockId: "t1", rowId: "a1" });
  });
});
