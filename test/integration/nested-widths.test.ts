// C09 I126 through the shell — the box a key or a wheel moves is measured at the
// width the frame drew it at.
//
// **Each row puts the box where a second width exists**: behind a bar, in a
// card's body, inside another box. At the region's own width and with no bar,
// every one of these asks agreed with the frame by coincidence, which is why
// the fixtures that already existed (`session-mouse.test.ts`'s one-row `raw`
// children, which are one row at every width) could not see it.
//
// The notices are the lever: a notice `n` cells long is one row at `n` and
// wider, two below, so a child's height turns on exactly the column the shell
// and the frame disagreed about.
//
// `buildGraph` does not paint, so the frame's offset is read as the renderer
// reads it — the held value clamped at the renderer's own ceiling (C04 I48) —
// and the ceilings below are derived from the frame's widths, once, here.
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { addr } from "../support/focus.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { block } from "../../src/data/viewmodel/index.js";
import { tapeStart } from "../../src/presentation/blocks/kinds/tape.js";

type Mouse = Extract<InputEvent, { kind: "mouse" }>;

const press = (name: string): InputEvent => ({
  kind: "key",
  key: { name, ctrl: false, meta: false, shift: false, sequence: name },
});

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
  verb: "box",
  adapter: "passthrough",
  exitCode: 0,
  durationMs: 0,
  truncated: false,
  argv: [] as string[],
  stderr: "",
  transport: "local",
  origin: "user",
};

const doc = (command: string, blocks: readonly unknown[]) => ({ schema: "tui.view/1", command, status: "ok", blocks, meta: META });

/** A notice `n` cells long: one row at `n` and wider, two at `n − 1`. */
const note = (id: string, n: number): unknown => ({ kind: "notice", id, tone: "info", text: "x".repeat(n) });

/** A notice of 76 copies of `c` — one row at the region's 80, two at the body's 75 and at 74. */
const text = (c: string): unknown => ({ kind: "notice", id: c, tone: "info", text: c.repeat(76) });
/** A run of `c` long enough to be only that notice's, and short enough to sit inside one of its rows. */
const FILL = (c: string): string => c.repeat(40);

/** A settled call head, which makes the entry a card whose body sits a gutter in (C22 I83). */
const HEAD = { kind: "notice", id: "h", text: "head", state: "succeeded", tone: "ok", glyph: "work-unit" };

/** The harness's frame: a 20-row region at terminal row 1, 80 columns (`test/support/session.ts`). */
const REGION = { top: 1, height: 20, width: 80 };
/** The card body's width at 80: the gutter takes five (`entryLayout`). */
const BODY = 75;

const AT = (entryId: string, elementId: string, blockId: string) => ({
  at: "liveBlock",
  entryId,
  element: addr(elementId, blockId),
  anchor: null,
  mode: "navigate",
});

/** One entry and a tall filler under it, scrolled to the top — so a transcript row is `REGION.top + row`. */
async function withFiller(blocks: readonly unknown[]) {
  const { graph } = await buildGraph({}, { columns: REGION.width, rows: 30 });
  graph.viewport.resize({ width: REGION.width, height: REGION.height });
  const id = graph.transcript.append(doc("/box", blocks) as never);
  const lines = Array.from({ length: 60 }, (_, i) => `line ${String(i)}`).join("\n");
  graph.transcript.append(doc("/filler", [{ kind: "raw", id: "f", text: lines }]) as never);
  graph.viewport.scrollToTop();
  expect(graph.viewport.scroll.topRow).toBe(0);
  return { graph, id };
}

/**
 * One entry and nothing under it, so it is the live one and `↓` from the prompt
 * enters it (C16 I22). A short transcript is bottom-aligned (`paint.ts`), so
 * `term` translates a transcript row through the blank rows above it.
 */
async function alone(blocks: readonly unknown[]) {
  const { graph } = await buildGraph({}, { columns: REGION.width, rows: 30 });
  graph.viewport.resize({ width: REGION.width, height: REGION.height });
  const id = graph.transcript.append(doc("/box", blocks) as never);
  const term = (row: number): number =>
    REGION.top + Math.max(0, REGION.height - graph.viewport.scroll.totalRows) + row;
  return { graph, id, term };
}

describe("C09 I126 — the shell asks a box's questions at the box's width", () => {
  it("T4.60 (C09 I126, C16 I31, C04 I48): behind a bar — a click on a child's second row is that child, and the wheel stops where the frame's ceiling is", async () => {
    // Three 80-cell notices in a box of two at 80: the bar takes column 79, so
    // each notice is two rows — content 6, the frame's ceiling 4. At 80 they are
    // one row each, content 3, ceiling 1.
    const BOX = { kind: "scroll", id: "s", height: 2, children: [note("a", 80), note("b", 80), note("c", 80)] };
    const CEILING = 4;
    const { graph, id } = await withFiller([BOX]);
    const offset = (): number => Math.min(graph.scrollOffsets.get(id, "s"), CEILING);

    // Entry row 0 is the command line; the box's rows are 1–2, terminal 2–3.
    graph.router.dispatch(mouse(2, 2));
    expect(graph.focus.current, "the first box row is a's first").toEqual(AT(id, "a", "s"));
    graph.router.dispatch(mouse(3, 2));
    expect(graph.focus.current, "the second box row is a's second, not b").toEqual(AT(id, "a", "s"));

    // One wheel step is three rows, which is short of the frame's ceiling — so
    // the box stops at 3. Against a ceiling of 1 the step is past the end, the
    // store writes the tail, and the frame jumps to 4.
    expect(graph.router.dispatch(mouse(2, 2, { button: "wheelDown" })), "consumed").toBe(true);
    expect(offset(), "three rows down, not the tail").toBe(3);
    expect(graph.viewport.scroll.topRow, "the transcript did not move").toBe(0);
  });

  it("T4.61 (C09 I126, C22 I83, C26 I24, C04 I48): in a card's body — ↓ pulls the next child into the box, and a page moves it by its drawn height, read off the frame", async () => {
    // **A real session, because the pull is the read loop's** (C26 I24): it runs
    // after the keys a stdin chunk carried, and `buildGraph`'s router dispatch
    // never reaches it. 81 columns is a region of 80, and the local route's
    // card puts the body at 75 (C22 I83).
    //
    // Three 76-cell notices at 75: two rows each, so a box of two overflows and
    // its bar takes a column — still two rows each at 74. Content 6, ceiling 4,
    // height 3 with the residue row. At the region's 80 each is one row:
    // content 3, ceiling 1 — the numbers the shell used to clamp against.
    const BOX = { kind: "scroll", id: "s", height: 2, children: [text("a"), text("b"), text("c")] };
    const stdin = fakeStdin();
    const session = await buildSession(
      {
        stdin: stdin as never,
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "box", local: true, summary: "a box in a card", args: [], flags: [] }],
        },
        localHandlers: { box: () => ({ schema: "tui.view/1", command: "box", status: "ok", blocks: [BOX] }) as never },
      },
      { columns: REGION.width + 1, rows: 30 },
    );
    const type = async (bytes: string): Promise<void> => {
      stdin.emit(bytes);
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    };
    const frame = (): string => session.screen().rows.join("\n");
    const DOWN = "\u001b[B";
    const UP = "\u001b[A";
    const PAGE_DOWN = "\u001b[6~";

    await type("/box\r");
    await type(DOWN); // the card's head (C09 I47)
    await type(DOWN); // a
    expect(frame(), "the box opens on a").toContain("0 above, 4 below");
    expect(frame()).toContain(FILL("a"));

    // ↓ to b: its rows are 2–3 of the box's content, outside a window of 0–1,
    // so the pull moves the box by the minimum — to 2. At 80, b is row 1 and
    // already inside, and nothing moved while focus sat on a row nobody could see.
    await type(DOWN);
    expect(frame(), "b pulled into the box").toContain("2 above, 2 below");
    expect(frame()).toContain(FILL("b"));
    expect(frame()).not.toContain(FILL("a"));

    // Back to a, which pulls the box to the top; then a page — the box's height
    // less one, from the height measured at the body's width, which is 2 — to
    // offset 2, short of the ceiling of 4. Against a ceiling of 1 the page was
    // past the end, the store wrote the tail, and the frame jumped to c.
    await type(UP);
    expect(frame(), "a pulled back").toContain("0 above, 4 below");
    await type(PAGE_DOWN);
    expect(frame(), "one page of two rows, not the tail").toContain("2 above, 2 below");
    expect(frame()).toContain(FILL("b"));
    expect(frame()).not.toContain(FILL("c"));
    await session.tui.stop("exit");
  });

  it("T4.62 (C09 I126, C16 I48, R-SEL-012): three boxes deep in a card's body — the wheel on the middle box's own child moves the middle box", async () => {
    // outer (8) ⊃ middle (4) ⊃ [a — 76 cells — and deep (2) of three rows].
    // At the body's 75, a is two rows; the middle's content is 2 + 3 = 5 over a
    // window of 4, so it takes a bar and draws at 74, where a is still two rows:
    // a at middle rows 0–1, deep at 2–4. At 80, a is one row, and deep starts at
    // row 1 — so a wheel on a's second row descended into deep.
    const DEEP = {
      kind: "scroll",
      id: "deep",
      height: 2,
      children: [
        { kind: "raw", id: "d1", text: "D ONE" },
        { kind: "raw", id: "d2", text: "D TWO" },
        { kind: "raw", id: "d3", text: "D THREE" },
      ],
    };
    const MIDDLE = { kind: "scroll", id: "middle", height: 4, children: [note("a", 76), DEEP] };
    const OUTER = { kind: "scroll", id: "outer", height: 8, children: [MIDDLE] };
    const { graph, id, term: row } = await alone([HEAD, OUTER]);

    // Where the frame puts the outer box's first content row, read off the
    // entry's own element walk rather than counted here: the command line is
    // the entry's chrome, one row above its blocks (C14 I20).
    graph.router.dispatch(press("down"));
    graph.router.dispatch(press("down"));
    expect(graph.focus.current, "the outer box's one child is the middle box").toEqual(AT(id, "middle", "outer"));
    const outerTop = focusedRowsFrom(graph);
    const term = (contentRow: number): number => row(1 + outerTop + contentRow);

    const MIDDLE_CEILING = 1; // content 5 in a window of 4
    const DEEP_CEILING = 1; // three rows in a window of 2
    const middle = (): number => Math.min(graph.scrollOffsets.get(id, "middle"), MIDDLE_CEILING);
    const deep = (): number => Math.min(graph.scrollOffsets.get(id, "deep"), DEEP_CEILING);

    // Middle row 1 is a's second row.
    expect(graph.router.dispatch(mouse(term(1), 8, { button: "wheelDown" })), "consumed").toBe(true);
    expect([middle(), deep()], "the middle box moved and deep did not").toEqual([MIDDLE_CEILING, 0]);

    // **The control**: middle row 2 is deep's first row once the middle has
    // moved by one — content row 3, deep's second — so the wheel is deep's.
    expect(graph.router.dispatch(mouse(term(2), 8, { button: "wheelDown" })), "consumed").toBe(true);
    expect([middle(), deep()], "this time deep, and only it").toEqual([MIDDLE_CEILING, DEEP_CEILING]);
  });

  it("T4.63 (C09 I126, C26 I25, C04 I125): a tape in a card's body persists the start the frame draws at the body's width", async () => {
    // Eight members of eight cells with the last current: at 80 the run fits,
    // at the body's 75 it does not, so the window has to start past the first.
    const members = Array.from({ length: 8 }, (_, i) => ({ id: `m${String(i)}`, label: `member-${String(i)}` }));
    const TAPE = { kind: "tape", id: "t", members, current: "m7" };
    const { graph, id } = await withFiller([HEAD, TAPE]);
    const shaped = block(TAPE as never) as never;

    // The premise, both halves: the two widths put the window in two places.
    expect(tapeStart(shaped, REGION.width, graph.capabilities, 0), "at 80 the run fits").toBe(0);
    const drawn = tapeStart(shaped, BODY, graph.capabilities, 0);
    expect(drawn, "at 75 it does not").toBeGreaterThan(0);

    expect(graph.scrollOffsets.get(id, "t"), "the start the frame draws").toBe(drawn);
  });
});

/** The focused element's first row, in entry-block rows (C26 §5) — where the outer box's content starts. */
function focusedRowsFrom(graph: Awaited<ReturnType<typeof buildGraph>>["graph"]): number {
  const at = graph.focus.current;
  if (at.at !== "liveBlock" || at.element === null) throw new Error("focus is not in a block");
  const el = at.element;
  const placed = graph
    .focusedElements()
    .find((p) => p.blockId === el.blockId && p.element.id === el.elementId);
  if (placed === undefined) throw new Error("the focused element is not placed");
  return placed.element.rows.from;
}
