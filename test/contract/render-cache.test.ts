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
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";

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

  // **The fourth axis, and the audit that found it.** *A cache key is wrong
  // until you have listed everything the render reads.* Listed against
  // `visibleRows`: the registry (sealed), the blocks (`rev`), the width, the
  // window range, the theme, the focus — all keyed — and `capabilities`, which
  // is not. The file's own header refutes the argument that would have excused
  // it: *both are about height*, said of theme **and** capabilities, and only
  // theme was then added.
  //
  // The omission is safe, and for a fact the header did not state: the record is
  // built once at construction step 2 and nothing in `src/` reassigns it. That
  // is `ctx.tick`'s treatment one paragraph below — *the axis is absent and the
  // value is constant together, and threading either obliges the other* — and
  // these two rows are what stop it going quiet.
  it("T4.18c (I58): capabilities is an appearance axis, so its absence is load-bearing", async () => {
    const { graph } = await buildGraph();
    // **A `rule`, and the fixture was changed after it failed to respond.** The
    // first draft used the `notice` above and the two renderings were byte-identical:
    // it draws text and a tone, and neither moves with `unicode`. A fixture must be
    // shown to respond to the thing under test before it is asserted against
    // (`test/support/README.md`), and this is the third instance of that rule.
    // `rule` draws `g.horizontal` — `─` at full, `-` at ascii.
    const blocks = [{ kind: "rule" as const, id: "r", label: "one" }];
    const render = (capabilities: typeof graph.capabilities): readonly string[] =>
      renderSequenceToLines(graph.blocks, blocks, 80, {
        theme: graph.theme.current,
        capabilities,
        focus: null,
      });

    expect(
      render({ ...graph.capabilities, unicode: "ascii" }),
      "the same block draws differently under a different capability record",
    ).not.toEqual(render({ ...graph.capabilities, unicode: "full" }));
  });

  it("T4.18d (I58): and the record never moves, which is the whole of why the key may omit it", async () => {
    // **The premise asserted rather than described** (C26 §8b.8's shape). A
    // re-detect on resize, or a `/ascii` toggle, makes this row fail — and that
    // is the day the key needs the axis T4.18c says matters.
    const { graph, resize } = await buildGraph();
    const before = graph.capabilities;
    let resized = 0;
    graph.lifecycle.onResize(() => { resized += 1; });

    graph.theme.setTheme("light");
    resize({ columns: 120, rows: 40 });

    // **Both events asserted to have happened**, or the row is an identity
    // check across nothing — a `setTheme` that silently no-opped and a resize
    // the fake swallowed would leave it green and vacuous.
    expect(graph.theme.current.name, "the theme moved").toBe("prism/light");
    expect(resized, "and the resize was delivered").toBeGreaterThan(0);

    expect(graph.capabilities, "the same record, not an equal one").toBe(before);
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
