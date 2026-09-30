// C23 I98, I99 — the app route's cancel, and what arrives after it (ruling 97,
// F1490, §8a A6.8).
//
// **Every row drives the pipeline's own route** — `submit`, `cancel`, the
// subscription rung, an approval's signal — and the far side is a promise or a
// stream the row holds and releases, so the order *cancel, then answer* is the
// row's to choose. `pipelineHarness`'s transport ignores the invocation's signal,
// which is why nothing before this file could put an answer after a cancel: the
// harness's held invocation never answered at all.
import { describe, expect, it } from "vitest";

import { pipelineHarness, settled } from "../support/execution.js";
import { result } from "../support/transport.js";
import { b } from "../../src/shell/builders/index.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";

type Harness = ReturnType<typeof pipelineHarness>;

/** A stream the row feeds by hand; `end` is the far side's last word, and `fail` throws from the loop. */
function heldStream(): { stream: () => AsyncIterable<RawPatch>; push: (p: RawPatch) => void; fail: (e: Error) => void } {
  const queue: (RawPatch | Error)[] = [];
  let wake: (() => void) | null = null;
  return {
    stream: () =>
      (async function* () {
        for (;;) {
          const next = queue.shift();
          if (next === undefined) {
            await new Promise<void>((r) => {
              wake = r;
            });
            wake = null;
            continue;
          }
          if (next instanceof Error) throw next;
          yield next;
          if (next.kind === "end") return;
        }
      })(),
    push: (p) => {
      queue.push(p);
      wake?.();
    },
    fail: (e) => {
      queue.push(e);
      wake?.();
    },
  };
}

/** One-second wakes, as the session's clock gives them. */
const seconds = (h: Harness, n: number): void => {
  for (let i = 0; i < n; i += 1) h.tick(1_000);
};

/** The entry's blocks in order: ids, and a notice's text where it is not the head. */
const blocksOf = (h: Harness): string =>
  (h.transcript.entries[0]?.doc.blocks ?? [])
    // The shell's ids end in a module-wide counter, so the count is dropped:
    // what the row reads is which blocks, in what order.
    .map((blk, i) => {
      const id = blk.id.replace(/-\d+$/u, "");
      return i > 0 && blk.kind === "notice" ? `${id}: ${blk.text}` : id;
    })
    .join(" · ");

/** One appended `raw` per data patch, numbered so the body's ids are visible. */
function appender(): () => { op: "append"; block: ReturnType<typeof b.raw> } {
  let n = 0;
  return () => {
    n += 1;
    return { op: "append", block: b.raw(`line ${String(n)}`, { id: `o${String(n)}` }) };
  };
}

/**
 * The whole settlement as one string: status, `error`, the head, the body
 * between them, the last block, the code and the record. **One string**, because
 * the defect was fields that disagreed — a head saying cancelled over `ok` and 0
 * beside a record of 130 — and a row per field passes the build that moves one.
 */
const settlement = (h: Harness): string => {
  const entry = h.transcript.entries[0];
  const blocks = entry?.doc.blocks ?? [];
  const head = blocks[0];
  const last = blocks.at(-1);
  return [
    `streaming ${String(entry?.streaming)}`,
    `status ${String(entry?.doc.status)} · error ${JSON.stringify(entry?.doc.error ?? null)}`,
    `head ${head?.kind === "notice" ? `${String(head.state)} · ${head.text}` : String(head?.kind)}`,
    `body ${blocks.slice(1, -1).map((blk) => blk.id).join(" ")}`,
    `last ${last?.kind === "notice" ? `${String(last.tone)} ${String(last.glyph)} · ${last.text}` : String(last?.kind)}`,
    `code ${String(entry?.doc.meta.exitCode)} · recorded ${h.recorded.map((r) => `${r.command} ${String(r.exitCode)}`).join(", ")}`,
  ].join(" | ");
};

/** Each entry's command, whether it still streams or how it settled, and its first line. */
const entries = (h: Harness): string =>
  h.transcript.entries
    .map((e) => {
      const first = e.doc.blocks[0];
      return `${e.doc.command}: ${e.streaming ? "streaming" : e.doc.status} · ${first?.kind === "notice" ? first.text : String(first?.kind)}`;
    })
    .join(" / ");

const invokes = (h: Harness): number => h.calls.filter((c) => c === "invoke").length;

describe("C23 I98, I99 — the app route's cancel", () => {
  it("T4.97 (C23 I98, ruling 97, F1490): ⌃c, a withdrawn approval and a cancelled stream settle partial with the card kept, the cancelled notice under it, and 130 in meta and C20", async () => {
    const seen: string[] = [];

    // `⌃c` over an invocation the far side has not answered.
    const invoked = pipelineHarness({ invoke: () => new Promise<RawResult>(() => undefined) });
    invoked.pipeline.submit("/ps");
    await settled();
    invoked.pipeline.cancel();
    await settled();
    seen.push(`⌃c: ${settlement(invoked)}`);

    // An approval its asker withdrew (C23 I92): nothing ran, and it is a cancel.
    const asker = new AbortController();
    const asked = pipelineHarness({ approval: () => ({ signal: asker.signal }) });
    asked.pipeline.submit("/ps");
    await settled();
    asker.abort();
    await settled();
    await settled();
    seen.push(`withdrawn: ${settlement(asked)}`);

    // A stream with one line under its head, then the subscription rung (C16 §5).
    const held = heldStream();
    const streamed = pipelineHarness({ stream: held.stream, adaptPatch: appender() });
    streamed.pipeline.submit("/tail web.log");
    await settled();
    held.push({ kind: "data", value: {} });
    await settled();
    streamed.pipeline.cancelNewestStream();
    await settled();
    seen.push(`stream: ${settlement(streamed)}`);

    expect(seen).toEqual([
      "⌃c: streaming false | status partial · error null | head cancelled · ps · cancelled | body  | last muted cancelled · Cancelled. | code 130 · recorded /ps 130",
      "withdrawn: streaming false | status partial · error null | head cancelled · ps · cancelled | body  | last muted cancelled · Cancelled. | code 130 · recorded /ps 130",
      "stream: streaming false | status partial · error null | head cancelled · tail(web.log) · cancelled | body o1 | last muted cancelled · Cancelled. | code 130 · recorded /tail web.log 130",
    ]);

    // **The control**: a denied approval is not a cancel, and keeps `ok` and 126.
    const denied = pipelineHarness({ approval: () => ({}) });
    denied.pipeline.submit("/ps");
    await settled(denied.pipeline);
    denied.confirm.answerHandler()?.({ kind: "key", key: { name: "n", ctrl: false, meta: false, shift: false, sequence: "n" } });
    await settled(denied.pipeline);
    await settled(denied.pipeline);
    const refused = denied.transcript.entries[0];
    expect(
      [refused?.streaming, refused?.doc.status, refused?.doc.blocks.length, denied.recorded.map((r) => `${r.command} ${String(r.exitCode)}`).join(", ")],
      "denied: settled on the card alone, with no cancelled notice, and 126",
    ).toEqual([false, "ok", 1, "/ps 126"]);
  });

  it("T4.98 (C23 I99, §8a A6.8 rows 4 and 5): the far side's late answer after a cancel writes nothing and records nothing", async () => {
    // Row 4 — the invocation answers with C06's cancelled result, as a real
    // subprocess transport does once the abort has stopped the child.
    let answer: ((r: RawResult) => void) | null = null;
    const invoked = pipelineHarness({
      invoke: () =>
        new Promise<RawResult>((r) => {
          answer = r;
        }),
    });
    invoked.pipeline.submit("/ps");
    await settled();
    invoked.pipeline.cancel();
    await settled();
    const before = invoked.transcript.entries[0]?.doc;
    (answer as unknown as (r: RawResult) => void)(result({ exitCode: null, signal: "SIGINT", cancelled: true }));
    await settled();
    await settled();
    expect(
      [invoked.transcript.entries[0]?.doc === before, invoked.recorded.map((r) => `${r.command} ${String(r.exitCode)}`).join(", ")],
      "row 4: the same document, and one record",
    ).toEqual([true, "/ps 130"]);

    // Row 5 — the stream's `end`, which arrives after every cancel of a real
    // subprocess stream: the generator yields it once the child has exited.
    const held = heldStream();
    const streamed = pipelineHarness({ stream: held.stream, adaptPatch: appender() });
    streamed.pipeline.submit("/tail web.log");
    await settled();
    held.push({ kind: "data", value: {} });
    await settled();
    streamed.pipeline.cancelNewestStream();
    await settled();
    const kept = streamed.transcript.entries[0]?.doc;
    held.push({ kind: "end", result: result({ exitCode: null, signal: "SIGINT", cancelled: true }) });
    await settled();
    await settled();
    const head = streamed.transcript.entries[0]?.doc.blocks[0];
    expect(
      [
        streamed.transcript.entries[0]?.doc === kept,
        head?.kind === "notice" ? `${String(head.state)} · ${head.text}` : "",
        streamed.recorded.map((r) => `${r.command} ${String(r.exitCode)}`).join(", "),
      ],
      "row 5: the same document, the head still cancelled, one record",
    ).toEqual([true, "cancelled · tail(web.log) · cancelled", "/tail web.log 130"]);
  });

  it("T4.99 (C23 I99, §8a A6.8 rows 6 and 7): a run's finally releases the guard only while it holds it", async () => {
    // Row 6 — a cancel, a second submission, then the first's late answer.
    const answers: ((r: RawResult) => void)[] = [];
    const h = pipelineHarness({
      invoke: () =>
        new Promise<RawResult>((r) => {
          answers.push(r);
        }),
    });
    h.pipeline.submit("/ps");
    await settled();
    h.pipeline.cancel();
    await settled();
    h.pipeline.submit("/ps --quiet");
    await settled();
    answers[0]?.(result({ exitCode: null, signal: "SIGINT", cancelled: true }));
    await settled();
    await settled();
    h.pipeline.submit("/ps");
    await settled();
    expect([invokes(h), entries(h)], "row 6: the third waits for the second").toEqual([
      2,
      "/ps: partial · ps · cancelled / /ps --quiet: streaming · ps(--quiet) · ⠋ / /ps: streaming · queued behind ps",
    ]);
    h.pipeline.cancel();
    await settled();
    expect(entries(h), "row 6: ⌃c settles the running one and clears the queued one").toBe(
      "/ps: partial · ps · cancelled / /ps --quiet: partial · ps(--quiet) · cancelled / /ps: partial · cancelled before it ran",
    );

    // Row 7 — no cancel at all: a stream ends while an invocation holds the guard.
    const held = heldStream();
    const s = pipelineHarness({
      stream: held.stream,
      invoke: () => new Promise<RawResult>(() => undefined),
    });
    s.pipeline.submit("/tail web.log");
    await settled();
    s.pipeline.submit("/ps");
    await settled();
    s.pipeline.submit("/ps --quiet");
    await settled();
    held.push({ kind: "end", result: result() });
    await settled();
    await settled();
    expect([invokes(s), entries(s)], "row 7: the queued line still waits for the running one").toEqual([
      1,
      "/tail web.log: ok · tail(web.log) / /ps: streaming · ps · ⠋ / /ps --quiet: streaming · queued behind ps",
    ]);
    s.pipeline.cancel();
    await settled();
    expect(entries(s), "row 7: ⌃c reaches the running one").toBe(
      "/tail web.log: ok · tail(web.log) / /ps: partial · ps · cancelled / /ps --quiet: partial · cancelled before it ran",
    );
  });

  it("T4.103 (C23 I98, ruling 100 d, F1509): a cancel's document leaves the stall row out, on a stream and on an invocation", async () => {
    // **Measured first that the row is the document's** (§8a A6.10): the stall
    // notice is a block `refresh.ts` patches into the entry, id `stall-notice`,
    // so the document the shell composes is where it has to be left out.
    const seen: string[] = [];

    const held = heldStream();
    const streamed = pipelineHarness({ stream: held.stream, adaptPatch: appender() });
    streamed.pipeline.submit("/tail web.log");
    await settled();
    held.push({ kind: "data", value: {} });
    await settled();
    seconds(streamed, 121);
    // **The fixture responds** (test/support/README.md): the row is there to be left out.
    expect(blocksOf(streamed), "stalled, before the cancel").toBe("call · o1 · stall-notice: no output for 2m");
    streamed.pipeline.cancelNewestStream();
    await settled();
    seen.push(`stream: ${blocksOf(streamed)}`);

    const invoked = pipelineHarness({ invoke: () => new Promise<RawResult>(() => undefined) });
    invoked.pipeline.submit("/ps");
    await settled();
    seconds(invoked, 121);
    expect(blocksOf(invoked), "stalled, before the cancel").toBe("call · stall-notice: no output for 2m");
    invoked.pipeline.cancel();
    await settled();
    seen.push(`⌃c: ${blocksOf(invoked)}`);

    expect(seen).toEqual([
      "stream: call · o1 · cancelled: Cancelled.",
      "⌃c: call · cancelled: Cancelled.",
    ]);
  });

  it("T4.104 (C23 I102, F1509): no stall row lands on an entry after it settles, on any route", async () => {
    // **Each settled inside three seconds, then three minutes pass** (§8a A6.10
    // rows 3–5). A `"shell"` patch lands on a settled entry (C13 §6), so a watch
    // that outlived the settle appended `no output for 2m` under the ending.
    const seen: string[] = [];
    const after = async (route: string, h: Harness): Promise<void> => {
      await settled();
      const final = h.transcript.entries[0]?.doc;
      seconds(h, 180);
      seen.push(`${route}: ${String(h.transcript.entries[0]?.doc === final)} · ${blocksOf(h)}`);
    };

    const invoked = pipelineHarness({ invoke: () => new Promise<RawResult>(() => undefined) });
    invoked.pipeline.submit("/ps");
    await settled();
    seconds(invoked, 2);
    invoked.pipeline.cancel();
    await after("⌃c", invoked);

    const cancelled = heldStream();
    const c = pipelineHarness({ stream: cancelled.stream, adaptPatch: appender() });
    c.pipeline.submit("/tail web.log");
    await settled();
    seconds(c, 2);
    c.pipeline.cancelNewestStream();
    await after("stream cancelled", c);

    const bad = heldStream();
    const m = pipelineHarness({ stream: bad.stream, adaptPatch: () => ({ op: "replace", blockId: "absent", block: b.raw("x", { id: "x" }) }) });
    m.pipeline.submit("/tail web.log");
    await settled();
    seconds(m, 2);
    bad.push({ kind: "data", value: {} });
    await after("malformed patch", m);

    const thrown = heldStream();
    const t = pipelineHarness({ stream: thrown.stream, adaptPatch: appender() });
    t.pipeline.submit("/tail web.log");
    await settled();
    seconds(t, 2);
    thrown.fail(new Error("pipe closed"));
    await after("stream throws", t);

    // **The control**: a stream still running over the same three minutes gains the row.
    const live = heldStream();
    const l = pipelineHarness({ stream: live.stream, adaptPatch: appender() });
    l.pipeline.submit("/tail web.log");
    await settled();
    seconds(l, 182);
    seen.push(`still running: ${blocksOf(l)}`);

    expect(seen).toEqual([
      "⌃c: true · call · cancelled: Cancelled.",
      "stream cancelled: true · call · cancelled: Cancelled.",
      "malformed patch: true · call · truncated",
      "stream throws: true · call · stream-error",
      "still running: call · stall-notice: no output for 2m",
    ]);
  });
});
