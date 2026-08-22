// C22 §6c, C22 I69 and C22 I70 · C04 §3d — a height discovered too late.
//
// **The frame that finds the need cannot fix it.** `measure` commits before
// anything is drawn, C14 has already indexed the number and the viewport has
// chosen its slice, so a renderer that gives way is discovered after the rows are
// fixed. The current frame completes single-pass at the committed height and the
// next one honours the floor — nothing re-enters the layout, and every frame is
// one pass exactly as it is today.
//
// **Both frames are read, because the second one is the subject.** No count shows
// it: the first frame is correct in every arithmetic sense and describes a box
// with nowhere to say what failed.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { Text } from "ink";

import { buildGraph, buildSession } from "../support/session.js";
import { doc } from "../support/blocks.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { TuiConfig } from "../../src/shell/types.js";
import type { BlockDefinition } from "../../src/presentation/blocks/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import type { BlockFault } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { block } from "../../src/data/viewmodel/index.js";
import { DARK_THEME, FULL_CAPS } from "../support/render.js";
import { BlockFaultLog, reserveNeeded } from "../../src/shell/block-faults.js";

const settle = async (): Promise<void> => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

const MANIFEST: NonNullable<TuiConfig["manifest"]> = {
  schema: "tui.manifest/1",
  binary: "prism",
  version: "1.0.0",
  tools: [{ name: "work", local: true, summary: "a verb", args: [], flags: [] }],
};

/**
 * **A one-row kind whose renderer throws**, which is the shape the whole
 * mechanism exists for: a `rule` measures one row, so a `rule` that gives way has
 * one row to say so in. Registered through `config.blocks`, the same path an app
 * uses, so nothing here is privileged.
 */
let RENDERS = 0;
const boom: BlockDefinition = {
  kind: "boom" as never,
  measure: () => 1,
  render: () => {
    RENDERS += 1;
    throw new Error("bad tone");
  },
} as never;

/** Measures one and draws three — F230's subject, and it never throws. */
const overdraws: BlockDefinition = {
  kind: "overdraws" as never,
  measure: () => 1,
  render: () =>
    createElement(
      "ink-box" as never,
      { style: { flexDirection: "column" } },
      createElement(Text, { key: "a" }, "OVER-1"),
      createElement(Text, { key: "b" }, "OVER-2"),
      createElement(Text, { key: "c" }, "OVER-3"),
    ),
} as never;

const SENTINEL = "SENTINEL-AFTER";

function handlers(kind: string): NonNullable<TuiConfig["localHandlers"]> {
  return {
    work: () => ({
      schema: "tui.view/1",
      command: "work",
      status: "ok",
      blocks: [
        { kind, id: "b" } as never,
        { kind: "notice", id: "n", tone: "info", text: SENTINEL } as never,
      ],
    }),
  };
}

async function session(kind: string, definition: BlockDefinition) {
  const stdin = fakeStdin();
  const built = await buildSession({
    manifest: MANIFEST,
    localHandlers: handlers(kind),
    blocks: [definition],
    stdin: stdin as never,
  } as never);
  await settle();
  stdin.emit("/work\r");
  await settle();
  await settle();
  return { ...built, stdin };
}

/** A frame's transcript rows, chrome included, blanks dropped. */
const shown = (text: readonly string[]): readonly string[] =>
  text.slice(text.indexOf("❯ /work"));

describe("C22 I69 — the next frame honours the floor", () => {
  it("T4.49 (C22 I69, C04 I67, C04 I68): one row, then three, and the block after it survives both", async () => {
    const { screen, stdin } = await session("boom", boom);

    const first = shown(screen().text);
    expect(first.join("\n"), "the failure is stated").toContain("failed to render");
    expect(
      first.filter((r) => r.includes("failed to render") || r.includes(SENTINEL)).length,
      "and the block after it is on the frame",
    ).toBe(2);
    // **One row, because that is what a `rule` measured** — the frame that
    // discovered the throw could not have drawn more without cutting the notice.
    expect(first.some((r) => r.includes("─") || r.includes("│")), "no border yet").toBe(false);

    // One more frame. Nothing else changed.
    stdin.emit("x");
    await settle();
    await settle();

    const second = shown(screen().text);
    expect(second.some((r) => r.includes("│")), "the second frame has the box").toBe(true);
    expect(second.join("\n"), "and still says what failed").toContain("failed to render");
    expect(second.some((r) => r.includes(SENTINEL)), "and still holds the block below").toBe(true);
  });

  it("T4.50 (C22 I69): the floor is raised once, and the session goes quiet", async () => {
    // **Termination, read from the outside.** `rev` is the mechanism and the
    // frame is the observable: a shell that reserved on every frame would commit
    // on every frame, and a fixture holding nothing that animates would still
    // never stop drawing. That is what the defect looks like — working, and
    // looking like nothing is wrong — so the assertion is that time passing
    // writes nothing.
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { stdout } = await buildSession({
        manifest: MANIFEST,
        localHandlers: handlers("boom"),
        blocks: [boom],
        stdin: stdin as never,
      } as never);
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      stdin.emit("/work\r");
      for (let i = 0; i < 6; i += 1) {
        await vi.advanceTimersByTimeAsync(50);
        await settle();
      }

      const settled = stdout.chunks.length;
      for (let i = 0; i < 10; i += 1) {
        await vi.advanceTimersByTimeAsync(100);
        await settle();
      }
      expect(
        stdout.chunks.length - settled,
        "nothing animates here, so a quiet session writes nothing",
      ).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("T4.53 (C22 I69): the frame is single-pass", async () => {
    // **Counted through a registered definition, on the real dispatch path.**
    // A spy on an internal function is what `measurable({ tick })` was, and it
    // agreed with the wiring being broken for the life of the project — so the
    // count comes from the same `render` the registry calls in a session.
    //
    // Two renders across two frames: the frame that discovers the throw, and the
    // frame that honours the floor. A layout that re-entered to fix the height
    // inside the first frame would make it three, and the picture would be
    // identical.
    RENDERS = 0;
    const { stdin } = await session("boom", boom);
    const afterFirst = RENDERS;
    expect(afterFirst, "one render on the frame that found the fault").toBe(1);

    stdin.emit("x");
    await settle();
    await settle();
    expect(RENDERS, "and one on the frame that honoured it").toBe(2);

    // And then nothing: the entry is cached and the floor is held.
    stdin.emit("y");
    await settle();
    await settle();
    expect(RENDERS, "a settled entry is served from cache").toBe(2);
  });
});

describe("C22 I70 — a frame that cannot hold what it was given complains", () => {
  it("T4.54 (C22 I70, F230): the over-draw is reported, the next block survives, nothing throws", async () => {
    const { screen, tui, stdout } = await session("overdraws", overdraws);

    const rows = shown(screen().text);
    expect(rows.length, "a frame was drawn at all").toBeGreaterThan(0);

    // **Who sees it, asked rather than assumed.** The sink is a pull, drained at
    // §8 step 3 onto the restored primary screen — a diagnostic painted onto the
    // alternate screen is discarded with it. So the reader is the one stopping
    // the session, and that is the path this reads.
    const before = stdout.chunks.length;
    await tui.stop("exit");
    const said = stdout.chunks.slice(before).join("");
    expect(said, "the trim says what it reconciled").toContain("C09 I1");
    // Four against two: the over-drawing block's three rows and the notice's one,
    // against the one row it measured and the notice's one. **The sequence, not
    // the block** — which is the level the trim reconciles at, and the level the
    // block below is lost from.
    expect(said).toContain("drew 4 rows where measure committed 2");
    expect(said, "and it names the entry, since ids repeat across them").toContain("entry ");
  });
});

describe("C22 I69 — two blocks failing in one entry", () => {
  it("T4.56 (C22 I69): both get their floor, and it takes a frame each", async () => {
    // **The cell the trace's two rows make together, and neither reaches alone.**
    // Row 2 rules *tolerate, do not coalesce*: two blocks, two patches, two `rev`
    // bumps. Row 4 discards a request whose `rev` moved. Put together, the first
    // patch moves `rev` and the second request — recorded in the same frame — is
    // discarded by its own guard.
    //
    // **It converges anyway, and that is the measurement rather than the
    // reasoning.** The fault re-fires on every frame until the floor is set, and
    // the patch commits, so the next frame records the second block afresh at the
    // new `rev` and floors it. N failing blocks in one entry cost N frames, with
    // **no input** — which is the half that had to be checked, because a
    // convergence that needs a keystroke is not one.
    vi.useFakeTimers();
    try {
      const stdin = fakeStdin();
      const { screen } = await buildSession({
        manifest: MANIFEST,
        localHandlers: {
          work: () => ({
            schema: "tui.view/1",
            command: "work",
            status: "ok",
            blocks: [
              { kind: "boom", id: "b1" } as never,
              { kind: "boom", id: "b2" } as never,
              { kind: "notice", id: "n", tone: "info", text: SENTINEL } as never,
            ],
          }),
        },
        blocks: [boom],
        stdin: stdin as never,
      } as never);
      await vi.advanceTimersByTimeAsync(0);
      await settle();
      stdin.emit("/work\r");
      // Time only. Nothing is typed after the command.
      for (let i = 0; i < 8; i += 1) {
        await vi.advanceTimersByTimeAsync(50);
        await settle();
      }

      const rows = shown(screen().text);
      expect(rows.filter((r) => r.includes("┌")).length, "both boxes are drawn").toBe(2);
      expect(rows.some((r) => r.includes(SENTINEL)), "and the block below survives").toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C04 I68 — a block failing once is not permanently tall", () => {
  it("T4.52 (C04 I68, C22 I69): a far-side patch clears the floor and the height comes back", async () => {
    // **Through the store and the registry that a session uses**, because the
    // claim spans both: the floor is C04's field, the height is C09's answer,
    // and *not permanently tall* is only true if the second follows the first.
    const { graph } = await buildGraph();
    const table = {
      kind: "table",
      id: "t",
      columns: [{ key: "a", label: "A" }],
      rows: [{ id: "r1", cells: { a: { text: "one" } } }],
    } as unknown as Block;

    const id = graph.transcript.append(
      doc({ blocks: [table], command: "work" }),
      { streaming: true },
    );
    const own = graph.blocks.measure(table, 40);

    expect(
      graph.transcript.patch(id, { op: "reserve", blockId: "t", rows: 9 }, "shell").ok,
    ).toBe(true);
    const floored = graph.transcript.entries.find((e) => e.id === id)?.doc.blocks[0];
    expect(graph.blocks.measure(floored as Block, 40), "the floor is honoured").toBe(9);

    // The far side rebuilds the block. Nothing watches a condition and nothing
    // has to: the floor was about content that has gone.
    expect(graph.transcript.patch(id, { op: "replace", blockId: "t", block: table }).ok).toBe(true);
    const fresh = graph.transcript.entries.find((e) => e.id === id)?.doc.blocks[0];
    expect(graph.blocks.measure(fresh as Block, 40), "and its own height is back").toBe(own);
  });
});

describe("C22 I69 — the guards, where they can be constructed", () => {
  // A literal, because the constant it used to name is gone: the shell is handed
  // the number by the fault now rather than importing one it could not compute.
  const req = { entryId: "e1", rev: 4, blockId: "b", rows: 3 };

  it("T4.55 (C22 I69): a request whose entry moved is discarded", () => {
    // **The row the sequence trace produced and no classification could.** A
    // far-side patch between the frame and the request leaves the id addressing
    // a block the far side has just built — so the shell would floor a block
    // that never threw.
    expect(reserveNeeded({ rev: 4 }, {}, req), "the ordinary case").toBe(true);
    expect(reserveNeeded({ rev: 5 }, {}, req), "the entry moved").toBe(false);
    expect(reserveNeeded(undefined, {}, req), "the entry has gone").toBe(false);
    expect(reserveNeeded({ rev: 4 }, undefined, req), "the block has gone").toBe(false);
  });

  it("T4.51 (C22 I69): a floor already held asks for nothing", () => {
    // **Termination, and the whole of it.** A field cannot repeat, so no rule
    // forbids a second request — the second frame finds it set. Asserted at
    // exactly the boundary, because `>=` and `>` differ only here.
    expect(reserveNeeded({ rev: 4 }, { minHeight: 2 }, req)).toBe(true);
    expect(reserveNeeded({ rev: 4 }, { minHeight: 3 }, req)).toBe(false);
    expect(reserveNeeded({ rev: 4 }, { minHeight: 4 }, req)).toBe(false);
  });
});

describe("C09 I34 — the number the fault carries", () => {
  // **The shell stopped importing a constant it had no way to compute.** The
  // rows a containment needs are a function of the message *and* the width, and
  // only the containment holds both: the drain runs after the frame has
  // returned, deliberately, and by then the width is gone (C22 I69).
  const faultsFrom = (message: string, width: number): readonly BlockFault[] => {
    const seen: BlockFault[] = [];
    const r = createBlockRegistry({ defaults: true, onError: (f) => void seen.push(f) });
    r.register({
      kind: "plot",
      measure: () => 1,
      render: () => {
        throw new Error(message);
      },
    } as unknown as BlockDefinition);
    r.seal();
    renderToLines(r, block({ kind: "plot", id: "p" } as Block), width, {
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      tick: 0,
    });
    return seen;
  };

  it("T4.57 (C09 I34, C22 I69): the rows asked for follow the message and the width", () => {
    const short = "ENOENT";
    const long = "Cannot read properties of undefined (reading 'series') while drawing the axis";
    // **Both axes, because one alone is satisfied by a constant.** A fault that
    // always said 4 passes a message-only row at the width where 4 is right, and
    // a width-only row on a message that happens not to wrap.
    expect(faultsFrom(short, 80)[0]?.rows, "one line, so border + tag + one").toBe(4);
    expect(faultsFrom(long, 80)[0]?.rows, "the same message wraps further").toBeGreaterThan(4);
    expect(
      faultsFrom(long, 40)[0]?.rows,
      "and narrower asks for more, which is the whole rule",
    ).toBeGreaterThan(faultsFrom(long, 80)[0]?.rows ?? 0);
  });

  it("T4.58 (C09 I34, C22 I69): two faults on one block keep the larger request", () => {
    // A `measure` fault says `${kind} failed to measure` and a `render` fault
    // carries the exception — different messages, different numbers. Last-write
    // wins would let the short one shorten the box the reader needs, and two
    // faults on one block are still one request and one `rev` bump.
    const log = new BlockFaultLog();
    log.within("e1", 1, () => {
      log.report({ kind: "plot", id: "p", member: "render", error: new Error("x"), rows: 9 });
      log.report({ kind: "plot", id: "p", member: "measure", error: new Error("y"), rows: 4 });
    });
    const out = log.drain();
    expect(out, "one block, one request").toHaveLength(1);
    expect(out[0]?.rows, "and the larger of the two").toBe(9);
  });
});
