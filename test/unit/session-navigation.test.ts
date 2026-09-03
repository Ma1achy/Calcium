// C26 §4g — block-to-block focus: the ceiling lifts.
//
// **Every row here was unreachable before §4g**, and the first one says why in
// its own assertion: `focusFor` answered `null` for every entry but the live one,
// so a settled entry's highlight was not a thing a frame could show. The rows are
// indexed by §4g's two artefacts — the table's rows b, c and e and the trace's
// rows 2, 3 and 5 — rather than by key coverage.
//
// **Two harnesses, deliberately.** `buildGraph` stubs `render`, so it is where
// the stored location is asserted; `buildSession` paints, so it is where the
// frame is read. A row about *what is highlighted* that only read the store
// would pass with the render side of the ceiling intact, which is the state the
// tree was in.
import { describe, expect, it } from "vitest";

import { buildGraph, buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition, FocusState } from "../../src/presentation/blocks/index.js";
import type { InputEvent, Key } from "../../src/interaction/router/types.js";
import { addr } from "../support/focus.js";

const key = (k: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }): Key => ({
  name: k.name,
  ctrl: k.ctrl ?? false,
  meta: k.meta ?? false,
  shift: k.shift ?? false,
  sequence: k.name,
});
const press = (k: Parameters<typeof key>[0]): InputEvent => ({ kind: "key", key: key(k) });

/** The wire forms, for the painting harness (C16 I17). */
const DOWN = "[B";
const UP = "[A";
const SHIFT_TAB = "[Z";
const TAB = "\t";
const ENTER = "\r";

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

/** A two-row table with `suffix` on every id, so two entries never share a block id. */
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
  ],
});

const doc = (command: string, blocks: readonly unknown[]) => ({
  schema: "tui.view/1",
  command,
  status: "ok",
  blocks,
  meta: META,
});

/**
 * A kind that records what focus the render context carried, per block
 * (`render-cache.test.ts`'s rule: observed from inside the production render
 * path, through the extension point an app uses, never a spy on `focusFor`).
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

/** The last thing each probe saw — what the current frame drew (C26 I9). */
const lastFocus = (
  seen: readonly Readonly<{ id: string; focus: FocusState | null }>[],
  id: string,
): FocusState | null | "never rendered" => {
  const hit = [...seen].reverse().find((s) => s.id === id);
  return hit === undefined ? "never rendered" : hit.focus;
};

/**
 * A painting session with a local verb that produces one numbered entry per
 * call, and a keyboard.
 */
async function painting(withActions = false) {
  const stdin = fakeStdin();
  const w = watching();
  let n = 0;
  const built = await buildSession(
    {
      stdin: stdin as never,
      blocks: [w.definition],
      manifest: {
        schema: "tui.manifest/1",
        binary: "prism",
        version: "1.0.0",
        tools: [{ name: "rows", local: true, summary: "two rows", args: [], flags: [] }],
      },
      localHandlers: {
        rows: () => {
          n += 1;
          return {
            schema: "tui.view/1",
            status: "ok",
            blocks: [table(String(n), withActions), { kind: "probe", id: `q${String(n)}` }],
          };
        },
      },
    } as never,
    { columns: 80, rows: 24 },
  );
  const type = async (bytes: string): Promise<void> => {
    stdin.emit(bytes);
    await Promise.resolve();
    await Promise.resolve();
  };
  // Two entries: `1` settles when `2` is appended (C13 I2).
  await type("/rows\r");
  await Promise.resolve();
  await type("/rows\r");
  await Promise.resolve();
  return { ...built, type, seen: w.seen };
}

describe("C26 §4g — the frame side of the ceiling", () => {
  it("T3.40 (C26 I21, I22): ⇧tab lands on the settled entry's first row and the frame highlights it", async () => {
    const s = await painting();

    // **The control, before the claim.** `↓` from the prompt enters the live
    // entry — the second one — and the frame says so: its probe saw a focus
    // and the settled entry's saw none. Without this the row below could pass
    // on a frame that never drew focus anywhere.
    await s.type(DOWN);
    expect(lastFocus(s.seen(), "q2"), "the live entry holds focus").toEqual({ blockId: "t2", rowId: "a2" });
    expect(lastFocus(s.seen(), "q1"), "and the settled one does not").toBeNull();
    expect(s.screen().text.join("\n")).toContain("alpha-1");

    // **The row this file exists for.** Before §4g `focusFor` compared against
    // `liveId`, so whatever the store held the settled entry drew no highlight.
    await s.type(SHIFT_TAB);
    expect(lastFocus(s.seen(), "q1"), "the settled entry's first row is focused, on screen").toEqual({
      blockId: "t1",
      rowId: "a1",
    });
    expect(lastFocus(s.seen(), "q2"), "and the live entry has let go").toBeNull();

    // `↓` steps inside the settled entry (C26 I19 — the sequence is the entry's).
    await s.type(DOWN);
    expect(lastFocus(s.seen(), "q1")).toEqual({ blockId: "t1", rowId: "b1" });

    // **`↑` at its head stops** (§4g row b): only the live entry's head
    // neighbours the prompt. Two presses — one to the head, one at it.
    await s.type(UP);
    await s.type(UP);
    expect(lastFocus(s.seen(), "q1"), "still on the first row, not at the prompt").toEqual({
      blockId: "t1",
      rowId: "a1",
    });

    // `tab` walks back to the live entry; a second `tab` has nowhere to go.
    await s.type(TAB);
    expect(lastFocus(s.seen(), "q2")).toEqual({ blockId: "t2", rowId: "a2" });
    await s.type(TAB);
    expect(lastFocus(s.seen(), "q2"), "the newest entry is the end").toEqual({ blockId: "t2", rowId: "a2" });

    // And `↑` at the **live** entry's head leaves, as C16 I22 always said.
    await s.type(UP);
    expect(lastFocus(s.seen(), "q2"), "the prompt is the live head's neighbour").toBeNull();
    expect(lastFocus(s.seen(), "q1")).toBeNull();
  });

  it("T3.41 (C26 §4g row e, C23 I18): ⏎ on a settled row reaches the refusal, patched into that entry", async () => {
    const s = await painting(true);
    await s.type(DOWN);
    await s.type(SHIFT_TAB);
    expect(lastFocus(s.seen(), "q1")).toEqual({ blockId: "t1", rowId: "a1" });

    await s.type(ENTER);
    const text = s.screen().text.join("\n");
    // **The refusal is the first thing a keyboard has ever reached here.** It
    // names the frozen entry's recorded command (C23 I18) and lands in the
    // entry that was acted on, so focus stays where it was.
    expect(text, "refused as frozen").toMatch(/is from a frozen entry/);
    expect(text, "and it says what to run instead").toContain("/rows");
    expect(lastFocus(s.seen(), "q1"), "focus survives the refusal").toEqual({ blockId: "t1", rowId: "a1" });
    // **The origin was the focused entry, not the live one**: with `liveId` as
    // the origin the action would have fired against the live entry's document
    // and been refused by nothing — `pick 1` would be in the prompt.
    expect(text, "the fill did not run").not.toMatch(/❯.*pick 1/);
  });
});

describe("C26 §4g — the stored location", () => {
  it("T3.42 (C26 §4g trace 2): a notice appended over the live entry leaves focus on its row", async () => {
    const { graph } = await buildGraph();
    const first = graph.transcript.append(doc("/rows", [table("1")]) as never);
    graph.router.dispatch(press({ name: "down" }));
    graph.router.dispatch(press({ name: "down" }));
    expect(graph.focus.current).toEqual({
      at: "liveBlock",
      entryId: first,
      element: addr("b1", "t1"),
      anchor: null,
      mode: "navigate",
    });

    // A notice — no command ran, so C16 I2's reset does not fire — becomes the
    // live entry and the table is settled under focus.
    const notice = graph.transcript.append(
      doc("", [{ kind: "notice", id: "n", tone: "warn", text: "history will not persist" }]) as never,
    );
    expect(graph.transcript.liveId).toBe(notice);

    // **Before §4g this was a dead state**: `liveElements()` answered `[]` for
    // the notice, nothing was highlighted, `↓` did nothing and `↑` left.
    expect(graph.focusedEntryId(), "focus is still in the table's entry").toBe(first);
    expect(graph.focusedElements().map((e) => e.element.id)).toEqual(["a1", "b1"]);
    graph.router.dispatch(press({ name: "up" }));
    expect(graph.focus.current.at === "liveBlock" && graph.focus.current.element, "↑ still steps").toEqual(
      addr("a1", "t1"),
    );
    graph.router.dispatch(press({ name: "up" }));
    expect(graph.focus.current.at, "and at a settled head it stops rather than leaving").toBe("liveBlock");
  });

  it("T3.43 (C26 I22, §4g trace 3): a stored entry that no longer exists resolves to the live entry", async () => {
    // **Constructed rather than driven.** C13's cap is 100,000 blocks and
    // `construct.ts` threads no smaller one (render-cache T4.18a's note), so
    // the state eviction leaves — a stored id absent from `entries` — is built
    // directly. It is the state, not a proxy for it.
    const { graph } = await buildGraph();
    graph.transcript.append(doc("/rows", [table("1")]) as never);
    const live = graph.transcript.append(doc("/rows", [table("2")]) as never);
    graph.focus.enterLiveBlock("evicted", addr("b9", "t9"));

    expect(graph.focusedEntryId(), "the live entry, because nothing else survives the eviction").toBe(live);
    expect(graph.focusedElements().map((e) => e.element.id)).toEqual(["a2", "b2"]);

    // **Both sides land in the same place.** `↓` from the fallen position
    // steps from the live entry's first element — C26 I10's fall-forward — and
    // the store is repaired by that keystroke.
    graph.router.dispatch(press({ name: "down" }));
    expect(graph.focus.current).toEqual({
      at: "liveBlock",
      entryId: live,
      element: addr("b2", "t2"),
      anchor: null,
      mode: "navigate",
    });
  });

  it("T3.44 (C26 I21, §4g trace 5): ⇧tab skips an entry with no elements and stops at the oldest", async () => {
    const { graph } = await buildGraph();
    const oldest = graph.transcript.append(doc("/rows", [table("0")]) as never);
    graph.transcript.append(doc("", [{ kind: "notice", id: "n", tone: "muted", text: "nothing here" }]) as never);
    const live = graph.transcript.append(doc("/rows", [table("2")]) as never);

    graph.router.dispatch(press({ name: "down" }));
    graph.router.dispatch(press({ name: "tab", shift: true }));
    expect(graph.focus.current, "over the notice, onto the table two entries up").toEqual({
      at: "liveBlock",
      entryId: oldest,
      element: addr("a0", "t0"),
      anchor: null,
      mode: "navigate",
    });

    graph.router.dispatch(press({ name: "tab", shift: true }));
    expect(graph.focusedEntryId(), "the oldest entry is the end").toBe(oldest);

    // **A move collapses a selection and lands in navigation** (§4g trace 6,
    // C26 I20): extend first, so the anchor is real and the drop is observable.
    graph.router.dispatch(press({ name: "down", shift: true }));
    expect(graph.focus.current.at === "liveBlock" && graph.focus.current.anchor, "a selection is open").not.toBeNull();
    graph.router.dispatch(press({ name: "tab" }));
    expect(graph.focus.current).toEqual({
      at: "liveBlock",
      entryId: live,
      element: addr("a2", "t2"),
      anchor: null,
      mode: "navigate",
    });
  });

  it("T3.45 (C26 I2, §4g row d): interaction is reachable in the live entry only", async () => {
    const { graph } = await buildGraph();
    const settled = graph.transcript.append(doc("/rows", [table("1")]) as never);
    graph.transcript.append(doc("/rows", [table("2")]) as never);

    graph.focus.enterLiveBlock(settled, addr("a1", "t1"));
    graph.focus.setMode("interact");
    expect(graph.router.target, "a settled entry has nothing to interact with — D4 withdrew its keys").toBe(
      "liveBlock",
    );

    graph.router.dispatch(press({ name: "tab" }));
    graph.focus.setMode("interact");
    expect(graph.router.target, "the live entry is where the mode lives").toBe("interaction");
  });
});
