// C22 §6c — the render cache's two C13 arms, and why a render count cannot see
// them.
//
// **This row exists because the first version of it was inert.** It was written
// against a session, asserting that a cleared entry is not rendered again — and
// removing the `clear` arm entirely left it green, because an evicted or cleared
// entry is gone from the transcript and `visibleRows` never asks for it. The
// claim is about **memory**, and a render count cannot express memory.
//
// So the subject is `size`, on C14's precedent: `Viewport.stats` exposes
// `cacheSize` for exactly this reason, and C14 T2.3b asserts `size ≤
// entries.length` against it. A cache whose bound is *by construction* still
// needs the construction to be observable, or the claim is a comment.
//
// Against the real graph, so the **subscription in `construct.ts` is what is
// under test** rather than the class's own methods — a test that calls the
// mechanism misses the wiring.
import { describe, expect, it } from "vitest";

import { buildGraph } from "../support/session.js";

const doc = (id: string) => ({
  schema: "tui.view/1" as const,
  command: `/${id}`,
  status: "ok" as const,
  blocks: [{ kind: "notice" as const, id: `n-${id}`, tone: "info" as const, text: id }],
  meta: {
    verb: id,
    adapter: "test",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: [id],
    stderr: "",
    transport: "local" as const,
    origin: "user" as const,
  },
});

describe("C22 §6c — the cache's C13 arms", () => {
  // **The `evict` arm is not drivable at this seam, and that is the finding
  // rather than a gap to paper over.** C13's cap is 100,000 blocks (C13 I17) and
  // `construct.ts` passes no cap at all — `createTranscriptStore` accepts one and
  // the only option threaded through is `retainPayloads`. So reaching an
  // eviction through the real graph would take 100,001 appends, and there is no
  // configuration that makes it cheaper.
  //
  // What is covered here is the **subscription**, through `clear`, which runs
  // the same callback in the same wiring; what is not covered is the `evict`
  // branch inside it. `delete` itself is exercised below at the class level.
  // Naming the half that is untested rather than letting a passing file imply
  // both — a citation reads as coverage.
  it("T4.18a (I58): the class deletes one slot and leaves its neighbours", async () => {
    const { graph } = await buildGraph();
    const a = graph.transcript.append(doc("one"));
    const b = graph.transcript.append(doc("two"));
    graph.rendered.set(a, 0, 80, "", "t", ["a"]);
    graph.rendered.set(b, 0, 80, "", "t", ["b"]);
    expect(graph.rendered.size, "two slots held").toBe(2);

    graph.rendered.delete(a);

    expect(graph.rendered.size, "one gone").toBe(1);
    expect(graph.rendered.get(a, 0, 80, "", "t"), "the deleted one").toBeUndefined();
    expect(graph.rendered.get(b, 0, 80, "", "t"), "and its neighbour stayed").toEqual(["b"]);
  });

  it("T4.18b (I58): clear drops every slot", async () => {
    const { graph } = await buildGraph();
    const id = graph.transcript.append(doc("one"));
    graph.rendered.set(id, 0, 80, "", "t", ["row"]);
    expect(graph.rendered.size, "one slot held").toBe(1);

    graph.transcript.clear();

    expect(graph.rendered.size, "and none after /clear").toBe(0);
  });
});
