import { describe, expect, it } from "vitest";

import type {
  PushedSurface,
  SurfaceActionEvent,
  SurfaceCloseOutcome,
  SurfaceInputFidelity,
} from "../../src/index.js";
import { SurfaceError } from "../../src/index.js";
import { buildGraph, buildSession } from "../support/session.js";

const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

function surface(
  actions: SurfaceActionEvent[],
  fidelities: SurfaceInputFidelity[],
  closes: SurfaceCloseOutcome[],
): PushedSurface {
  return {
    schema: "calcium.pushed-surface/1",
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

describe("PushedSurface public contract", () => {
  it("opens, renders, and closes through the public TuiInstance boundary", async () => {
    const h = await buildSession();
    const handle = h.tui.openSurface({
      schema: "calcium.pushed-surface/1",
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
    expect(h.graph.overlays.top?.id).toBe("game");

    h.stdin.emit("a");
    h.stdin.emit("a");
    await tick();
    expect(actions.map((event) => event.phase)).toEqual(["press", "repeat"]);
    expect(actions.map((event) => event.ordinal)).toEqual([1, 2]);
    expect(actions.every((event) => event.fidelity === "legacy_terminal")).toBe(true);

    await handle.close();
    expect(actions.map((event) => event.phase)).toEqual(["press", "repeat", "release"]);
    expect(closes).toEqual([{ reason: "application" }]);
    expect(h.graph.overlays.top).toBeNull();
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
      schema: "calcium.pushed-surface/1",
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
    expect(h.graph.overlays.top).toBeNull();
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
