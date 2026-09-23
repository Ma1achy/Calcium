import { describe, expect, it } from "vitest";

import type {
  ChildSurface,
  SurfaceActionEvent,
  SurfaceCloseOutcome,
  SurfaceInputFidelity,
} from "../../src/index.js";
import { SurfaceError } from "../../src/index.js";
import { ownerLine } from "../../src/shell/chrome.js";
import { buildGraph, buildSession } from "../support/session.js";

const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function surface(
  actions: SurfaceActionEvent[],
  fidelities: SurfaceInputFidelity[],
  closes: SurfaceCloseOutcome[],
): ChildSurface {
  return {
    schema: "calcium.child-surface/1",
    id: "game",
    keymap: [{ key: { name: "a" }, action: "move-left" }],
    render: (context) => {
      fidelities.push(context.inputFidelity);
      return [{ kind: "raw", id: "board", text: context.inputFidelity }];
    },
    onAction: (event) => void actions.push(event),
    onClose: (outcome) => void closes.push(outcome),
  };
}

describe("ChildSurface public contract", () => {
  it("opens, renders, and closes through the public TuiInstance boundary", async () => {
    const h = await buildSession();
    const handle = h.tui.openSurface({
      schema: "calcium.child-surface/1",
      id: "public-game",
      keymap: [],
      render: () => [{ kind: "raw", id: "board", text: "FOUR SURFACE" }],
      onAction: () => undefined,
    });

    expect(h.screen().rows.join("\n")).toContain("FOUR SURFACE");
    expect(await handle.close()).toEqual({ reason: "application" });
    await h.tui.stop("exit");
  });

  it("delivers deterministic legacy press/repeat/release events", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const actions: SurfaceActionEvent[] = [];
    const fidelities: SurfaceInputFidelity[] = [];
    const closes: SurfaceCloseOutcome[] = [];
    const handle = h.graph.surface.open(surface(actions, fidelities, closes));

    expect(handle.inputFidelity).toBe("legacy_terminal");
    expect(handle.elapsedMs).toBeGreaterThanOrEqual(0);
    // **The entry, and no layer** (C22 I110). This row asserted `overlays.top`
    // until M9 moved the child's blocks into the transcript; the claim it was
    // making — *the attach put the surface on screen* — is unchanged and only
    // its carrier moved.
    expect(h.graph.overlays.stack).toHaveLength(0);
    expect(h.graph.transcript.entries.at(-1)?.doc.command).toBe("child game");

    h.stdin.emit("a");
    h.stdin.emit("a");
    await tick();
    expect(actions.map((event) => event.phase)).toEqual(["press", "repeat"]);
    expect(actions.map((event) => event.ordinal)).toEqual([1, 2]);
    expect(actions.every((event) => event.fidelity === "legacy_terminal")).toBe(true);

    await handle.close();
    expect(actions.map((event) => event.phase)).toEqual(["press", "repeat", "release"]);
    expect(closes).toEqual([{ reason: "application" }]);
    // **And it is still there afterwards** (C22 I110). A detach that swept the
    // entry would be the pushed view's hole arriving by another name.
    expect(h.graph.transcript.entries.at(-1)?.doc.command).toBe("child game");
    h.graph.lifecycle.release();
  });

  it("uses native CSI-u phases without synthesising a second release", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const actions: SurfaceActionEvent[] = [];
    const fidelities: SurfaceInputFidelity[] = [];
    const handle = h.graph.surface.open(surface(actions, fidelities, []));

    h.stdin.emit("\u001b[97;1:1u");
    h.stdin.emit("\u001b[97;1:2u");
    h.stdin.emit("\u001b[97;1:3u");
    await tick();

    expect(handle.inputFidelity).toBe("native_enhanced_terminal");
    expect(actions.map((event) => event.phase)).toEqual(["press", "repeat", "release"]);
    expect(actions.every((event) => event.fidelity === "native_enhanced_terminal")).toBe(true);
    expect(fidelities).toContain("native_enhanced_terminal");
    await handle.close();
    expect(actions).toHaveLength(3);
    h.graph.lifecycle.release();
  });

  it("treats unphased CSI-u as reduced-fidelity input with a synthesized release", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const actions: SurfaceActionEvent[] = [];
    const fidelities: SurfaceInputFidelity[] = [];
    const handle = h.graph.surface.open(surface(actions, fidelities, []));

    h.stdin.emit("\u001b[97;1u");
    await tick();
    expect(handle.inputFidelity).toBe("legacy_terminal");
    expect(actions.map((event) => event.phase)).toEqual(["press"]);
    expect(actions[0]?.fidelity).toBe("legacy_terminal");

    await new Promise<void>((resolve) => setTimeout(resolve, 75));
    await tick();
    expect(actions.map((event) => event.phase)).toEqual(["press", "release"]);

    await handle.close();
    expect(actions.map((event) => event.phase)).toEqual(["press", "release"]);
    expect(actions.every((event) => event.fidelity === "legacy_terminal")).toBe(true);
    h.graph.lifecycle.release();
  });

  it("rejects a second surface and closes a throwing action with a typed fault", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const closes: SurfaceCloseOutcome[] = [];
    const handle = h.graph.surface.open({
      schema: "calcium.child-surface/1",
      id: "faulting",
      keymap: [{ key: { name: "a" }, action: "fail" }],
      render: () => [{ kind: "raw", id: "board", text: "ready" }],
      onAction: () => {
        throw new Error("decider disconnected");
      },
      onClose: (outcome) => void closes.push(outcome),
    });

    expect(() => h.graph.surface.open(surface([], [], []))).toThrowError(SurfaceError);
    h.stdin.emit("a");
    const outcome = await handle.closed;
    expect(outcome).toEqual({
      reason: "fault",
      fault: { stage: "action", message: "decider disconnected" },
    });
    expect(closes).toEqual([outcome]);
    expect(h.graph.transcript.entries.at(-1)?.doc.command).toBe("child faulting");
    h.graph.lifecycle.release();
  });

  it("session closure reports the session boundary", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const handle = h.graph.surface.open(surface([], [], []));
    const closed = h.graph.surface.close("session");
    expect(await closed).toEqual({ reason: "session" });
    expect(await handle.closed).toEqual({ reason: "session" });
    h.graph.lifecycle.release();
  });
});

describe("C16 §5 — the captured child owns the keyboard (M9)", () => {
  /** A child binding exactly one key, so *bound* and *unbound* are both real here. */
  const child = (seen: string[]): ChildSurface => ({
    schema: "calcium.child-surface/1",
    id: "pty",
    keymap: [{ key: { name: "a" }, action: "left" }],
    render: () => [{ kind: "raw", id: "board", text: "CHILD" }],
    onAction: (event) => void seen.push(`${event.action}:${event.phase}`),
  });

  it("T1.106 (C16 I49, R-INT-007, R-BLK-838): the child takes every key, bound or not", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const before = h.graph.editor.text;

    // **The control first.** With nothing attached these three keys reach their
    // ordinary rungs — without it the row is passed by a router that drops
    // every key, which is the failure mode it is written against.
    h.stdin.emit("z");
    expect(h.graph.editor.text, "unattached: a letter types").toBe(`${before}z`);
    h.graph.editor.clear();
    expect(h.graph.router.target, "unattached: the prompt owns the keys").toBe("prompt");

    const seen: string[] = [];
    const handle = h.graph.surface.open(child(seen));
    expect(h.graph.router.target, "attached: the child does").toBe("child");

    // Bound: the child acts on it.
    h.stdin.emit("a");
    await tick();
    expect(seen, "the child's own binding").toEqual(["left:press"]);

    // **Unbound, and this is the half that was wrong at `pushedView`**: a key
    // the child binds nothing to is consumed at the `child` rung and reaches no
    // lower one. A letter that fell through would be the host typing into a
    // line the reader cannot see while a PTY holds the terminal.
    h.stdin.emit("z");
    await tick();
    expect(h.graph.editor.text, "nothing reached the editor").toBe("");
    expect(seen, "and the child was not told about a key it does not bind").toEqual([
      "left:press",
    ]);

    // **And a key the HOST binds globally, which is the half `z` cannot see.**
    // A letter reaching the `child` rung and finding no handler falls to the
    // global keymap, and `z` is in no global row — so the editor staying empty
    // is satisfied by the target change alone and says nothing about who
    // consumed it. `F1` is bound at `global` to `/help keys`, and it is a key a
    // full-screen child uses: without the consuming turn, pressing it inside a
    // PTY submits a host command the reader cannot see being typed. Measured —
    // the mutation deleting the wrapper survived this row until it read `F1`.
    const entriesBefore = h.graph.transcript.entries.length;
    h.stdin.emit("\u001bOP");
    await tick();
    expect(h.graph.transcript.entries.length, "the host did not submit /help keys").toBe(
      entriesBefore,
    );
    expect(seen, "nor did the child, which binds no F1").toEqual(["left:press"]);

    await handle.close();
    await h.graph.lifecycle.release();
  });

  it("T1.106b (C16 I49, R-BLK-908): ⌃] is the one key the child does not get", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();
    const seen: string[] = [];
    const handle = h.graph.surface.open(child(seen));
    expect(h.graph.router.target).toBe("child");

    // `0x1d` — the ASCII group separator, which is what `ctrl` does to `]`. It
    // is a byte every terminal sends without being persuaded, which is half the
    // design's argument for it as the base candidate; the other half is that
    // the decoder had no name for it until M9 and T2.13 is what said so.
    h.stdin.emit(String.fromCharCode(29));
    await tick();

    // Asserted from the child's side, on what it was handed: a detach that also
    // delivered the key is a child that acts on its way out.
    expect(seen, "the child never saw it").toEqual([]);
    expect(await handle.closed, "and ownership came back, by the reader's hand").toEqual({
      reason: "detach",
    });
    expect(h.graph.router.target, "the prompt has the keys again").toBe("prompt");
    await h.graph.lifecycle.release();
  });
});

describe("C16 §5 — the reservation is refusable (M9)", () => {
  it("T1.107 (C16 I49, R-BLK-908): a surface binding the host escape is refused, by name", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();

    // **The control first**, so the refusal below is not satisfied by a host
    // that refuses every surface: the same shape with an ordinary chord
    // attaches, and the `child` rung has its subject.
    const ok = h.graph.surface.open({
      schema: "calcium.child-surface/1",
      id: "reachable",
      keymap: [{ key: { name: "q" }, action: "quit" }],
      render: () => [],
      onAction: () => undefined,
    });
    expect(h.graph.router.target).toBe("child");
    await ok.close();

    // *May never leave capture without a visible, reachable host escape.* An
    // application binding `⌃]` is not shadowing the escape — the host's handler
    // runs in front of the child's — it is declaring a key it will never be
    // given, and silently never receiving one is worse than being told now.
    let thrown: unknown;
    try {
      h.graph.surface.open({
        schema: "calcium.child-surface/1",
        id: "greedy",
        keymap: [{ key: { name: "]", ctrl: true }, action: "quit" }],
        render: () => [],
        onAction: () => undefined,
      });
    } catch (cause) {
      thrown = cause;
    }
    expect(thrown, "refused").toBeInstanceOf(SurfaceError);
    expect((thrown as SurfaceError).code).toBe("reserved_chord");
    // **Named**, because the application's own remedy is to choose another
    // chord and it cannot without being told which one it collided with.
    expect((thrown as SurfaceError).message).toContain("c+]");
    expect(h.graph.router.target, "and nothing attached").toBe("prompt");

    await h.graph.lifecycle.release();
  });
});

describe("C22 §13a — the child surface is an entry (M9)", () => {
  /** Two renders apart, so *replaced in place* is a claim the row can read. */
  const counting = (n: () => number): ChildSurface => ({
    schema: "calcium.child-surface/1",
    id: "pty",
    keymap: [{ key: { name: "a" }, action: "left" }],
    render: () => [{ kind: "raw", id: "board", text: `FRAME ${String(n())}` }],
    onAction: () => undefined,
  });

  const panelOf = (h: Awaited<ReturnType<typeof buildGraph>>): Record<string, unknown> => {
    const entry = h.graph.transcript.entries.at(-1);
    return (entry?.doc.blocks[0] ?? {}) as Record<string, unknown>;
  };

  it("T4.94 (C22 I110, R-BLK-645, R-BLK-314): the attach appends an entry, pushes no layer, and the entry outlives the detach", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();

    // **The control.** A command that settled before the attach is in the
    // record; without it *the transcript stays* is satisfied by a transcript
    // that was empty all along, and the row would pass against a pushed view.
    h.graph.transcript.append({
      schema: "tui.view/1",
      command: "/before",
      status: "ok",
      blocks: [{ kind: "raw", id: "b", text: "BEFORE" }],
      meta: {
        verb: "before",
        adapter: "passthrough",
        exitCode: 0,
        durationMs: 0,
        truncated: false,
        argv: [],
        stderr: "",
        transport: "local",
        origin: "user",
      },
    } as never);
    const before = h.graph.transcript.entries.length;

    let frame = 0;
    const handle = h.graph.surface.open(counting(() => frame));
    expect(h.graph.overlays.stack, "no layer, at the attach").toHaveLength(0);
    expect(h.graph.transcript.entries.length, "one entry more").toBe(before + 1);
    const id = h.graph.transcript.entries.at(-1)?.id;
    expect(panelOf(h).footer, "the border carries the legend").toContain("host escape");

    // **Two invalidations, and the same entry each time** (C22 I110's *replaces its
    // document*). An append per render would grow the transcript by one a frame,
    // which is the other way this could have been built and is the one the row
    // exists to refuse.
    frame = 1;
    handle.invalidate();
    frame = 2;
    handle.invalidate();
    expect(h.graph.transcript.entries.length, "still one entry").toBe(before + 1);
    expect(h.graph.transcript.entries.at(-1)?.id, "and the same one").toBe(id);
    expect(h.graph.overlays.stack, "and still no layer").toHaveLength(0);
    expect(JSON.stringify(panelOf(h)), "holding the newest render").toContain("FRAME 2");

    // **The control for the control** (R-BLK-314): the entry that settled before
    // the attach is still reachable underneath, which is what *the transcript
    // stays* buys and what a fill layer took away.
    expect(h.graph.transcript.entries.some((e) => e.doc.command === "/before")).toBe(true);

    await handle.close();
    expect(h.graph.transcript.entries.at(-1)?.id, "the entry outlives the detach").toBe(id);
    expect(JSON.stringify(panelOf(h)), "holding the last blocks rendered").toContain("FRAME 2");
    await h.graph.lifecycle.release();
  });

  it("T4.94b (C22 I110, C16 I49): both on-screen carriers name the escape — the footer's owner line and the entry's border", async () => {
    const h = await buildGraph();
    h.graph.lifecycle.acquire();

    // The control: with nothing attached neither carrier says so.
    expect(h.graph.router.rung, "unattached").not.toBe("child");
    expect(
      ownerLine(h.graph.router.rung, h.graph.capabilities).map((c) => c.label),
      "and the footer names another owner, or none",
    ).not.toContain("attached");

    let frame = 0;
    const handle = h.graph.surface.open(counting(() => frame));
    expect(h.graph.router.target, "the keyboard half").toBe("child");
    expect(h.graph.router.rung).toBe("child");

    // **Carrier one — the footer**, which is what a reader at the prompt sees.
    const labels = ownerLine(h.graph.router.rung, h.graph.capabilities).map((c) => c.label);
    expect(labels).toContain("attached");
    expect(labels.join(" · "), "and the one key that still works").toContain("] host escape");

    // **Carrier two — the border**, which is what a reader who has scrolled
    // sees. Either alone leaves someone with no way out, which is why C22 I110
    // calls neither optional.
    expect(String(panelOf(h).footer)).toContain("] host escape");

    await handle.close();
    await h.graph.lifecycle.release();
  });
});
