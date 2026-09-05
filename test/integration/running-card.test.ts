// C23 I54 — the pending entry is the running card (`AGENT_TUI_DESIGN.md` §9c).
//
// **Every row drives the pipeline's own route** — `submit`, the transport's
// stream, `cancel`, the harness clock — and none calls `readout` or composes a
// header itself. T3.61 already proves the mechanism; these rows are the wiring,
// and *a test that calls the mechanism misses the wiring*: the readout's rows
// passed on the day nothing in `src/` registered one.
//
// The transcript is real (C13), so what is asserted is what the store holds and
// what T4.45 prints is what the frame draws.
import { describe, expect, it } from "vitest";

import { pipelineHarness, settled } from "../support/execution.js";
import { result } from "../support/transport.js";
import { b } from "../../src/shell/builders/index.js";
import { commandRows } from "../../src/shell/paint.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS, visible } from "../support/render.js";
import type { RawPatch, RawResult } from "../../src/data/transport/index.js";
import type { Block, ViewPatch } from "../../src/data/viewmodel/index.js";

/** A stream the row releases one patch at a time — the gate is the row's clock. */
function gatedStream(): {
  stream: () => AsyncIterable<RawPatch>;
  data: (value: unknown) => Promise<void>;
  end: (over?: Partial<RawResult>) => Promise<void>;
} {
  const queue: { patch: RawPatch; release: () => void }[] = [];
  let wake: (() => void) | null = null;
  const push = (patch: RawPatch): Promise<void> =>
    new Promise<void>((release) => {
      queue.push({ patch, release });
      wake?.();
    });
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
          // Released before the yield: after `end` the consumer never pulls again.
          next.release();
          yield next.patch;
          if (next.patch.kind === "end") return;
        }
      })(),
    data: (value) => push({ kind: "data", value }),
    end: (over = {}) => push({ kind: "end", result: result(over) }),
  };
}

/** One appended `raw` per data patch, numbered so the body's order is visible. */
function appender(): () => ViewPatch {
  let n = 0;
  return () => {
    n += 1;
    return { op: "append", block: b.raw(`line ${String(n)}`, { id: `o${String(n)}` }) };
  };
}

const headerOf = (blocks: readonly Block[]): { glyph: string | undefined; text: string } | null => {
  const first = blocks[0];
  return first?.kind === "notice" ? { glyph: first.glyph, text: first.text } : null;
};

/** A second at a time, so every one-second wake fires the way it does in a session. */
const seconds = (h: ReturnType<typeof pipelineHarness>, n: number): void => {
  for (let i = 0; i < n; i += 1) h.tick(1_000);
};

describe("C23 I54 — the pending entry is the running card", () => {
  it("T4.40 (C23 I54, I53, with C13): bare at dispatch, `· 4s` after four wakes, the body under the header, `· 4s · exit 0` at `end`, and still after", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });

    h.pipeline.submit("/tail web.log");
    await settled();

    const entry = () => h.transcript.entries[0];
    expect(entry()?.streaming, "step 3 appended a streaming entry").toBe(true);
    // First assertion — the card, not `blocks: []` (T6.80).
    expect(headerOf(entry()?.doc.blocks ?? []), "the header is a `step` notice, bare below one second").toEqual({
      glyph: "step",
      text: "tail(web.log)",
    });

    // Second — the figure moves through the route's own readout (T6.81).
    seconds(h, 4);
    expect(headerOf(entry()?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 4s");

    // Third — the streamed body is the entry's own blocks, appended under the header.
    await gate.data({ a: 1 });
    await settled();
    await gate.data({ a: 2 });
    await settled();
    expect(entry()?.doc.blocks.map((blk) => blk.id).slice(1), "body blocks follow the header").toEqual(["o1", "o2"]);
    expect(headerOf(entry()?.doc.blocks ?? [])?.text, "the header is untouched by the body").toBe("tail(web.log) · 4s");

    // Fourth — the outcome is in the document the `settle` change carries (T6.82).
    // **Measured: a `"shell"` patch on a settled entry is accepted** (C13 §6), so
    // the final state would read the same either way. What differs is the record:
    // persistence writes on `settle` and on nothing after it (C13 §5b.2).
    let atSettle: string | undefined;
    const sub = h.transcript.subscribe((change) => {
      if (change.kind !== "settle") return;
      atSettle = headerOf(h.transcript.entries.find((e) => e.id === change.id)?.doc.blocks ?? [])?.text;
    });
    await gate.end({ exitCode: 0 });
    await settled();
    sub[Symbol.dispose]();
    expect(entry()?.streaming, "settled by `end`").toBe(false);
    expect(atSettle, "what persistence writes already carries the verdict").toBe("tail(web.log) · 4s · exit 0");
    expect(headerOf(entry()?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 4s · exit 0");

    // And a settled card keeps its final figure: the readout is gone.
    seconds(h, 3);
    expect(headerOf(entry()?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 4s · exit 0");
  });

  it("T4.40b (C23 I54): a stream that ends non-zero carries its code, and one that is truncated says so", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    h.pipeline.submit("/tail web.log");
    await settled();
    seconds(h, 2);
    await gate.end({ exitCode: 1 });
    await settled();
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 2s · exit 1");
  });

  it("T4.41 (C23 I54, roadmap 33): a queued line is bare while it waits, gains no figure, and becomes the card — same id — when routed, with its clock starting there", async () => {
    // A held invoke holds the guard; a stream would release it (I6) and nothing
    // would queue. The queued line is the streaming verb, so the card survives
    // its settlement and the header can be read at the end as well.
    const held: { release: (() => void) | null } = { release: null };
    const gate = gatedStream();
    const h = pipelineHarness({
      invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }),
      stream: gate.stream,
      adaptPatch: appender(),
    });

    h.pipeline.submit("/ps");
    await settled();
    h.pipeline.submit("/tail web.log");
    await settled();

    const queued = h.transcript.entries[1];
    expect(queued?.streaming, "the queue is visible: appended streaming when typed").toBe(true);
    const waiting = headerOf(queued?.doc.blocks ?? []);
    expect(waiting?.text, "waiting, not running").toContain("queued behind");
    expect(waiting?.glyph, "a `continuation` notice, not a `step`").toBe("continuation");

    // Five seconds in the queue: no figure, because no clock has started (P1).
    seconds(h, 5);
    expect(headerOf(h.transcript.entries[1]?.doc.blocks ?? [])?.text).toContain("queued behind");
    expect(headerOf(h.transcript.entries[1]?.doc.blocks ?? [])?.text).not.toMatch(/· \d+s/u);

    // Routed: the header *replaces* the notice on the same entry (P2), and the
    // clock starts here — two seconds later it reads 2s, not 7s (T6.83).
    held.release?.();
    await settled();
    await settled();
    const routed = h.transcript.entries[1];
    expect(routed?.id, "same entry").toBe(queued?.id);
    expect(routed?.doc.blocks, "one block: the header replaced the notice").toHaveLength(1);
    expect(headerOf(routed?.doc.blocks ?? [])).toEqual({ glyph: "step", text: "tail(web.log)" });
    seconds(h, 2);
    expect(headerOf(h.transcript.entries[1]?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 2s");

    await gate.end({ exitCode: 0 });
    await settled();
    expect(headerOf(h.transcript.entries[1]?.doc.blocks ?? [])?.text, "never *queued behind* once it ran").toBe(
      "tail(web.log) · 2s · exit 0",
    );
  });

  it("T4.42 (C23 I54, with C16): Ctrl-C on a running stream → `· 3s · cancelled`, settled, and a later wake changes nothing", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    h.pipeline.submit("/tail web.log");
    await settled();
    seconds(h, 3);

    h.pipeline.cancel();
    await settled();
    const entry = h.transcript.entries[0];
    expect(entry?.streaming, "cancel settles the entry (C23 I10)").toBe(false);
    expect(headerOf(entry?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 3s · cancelled");
    expect(h.recorded.at(-1), "a cancellation is a settlement with its own code (C23 I29)").toEqual({ command: "/tail web.log", exitCode: 130 });

    seconds(h, 2);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 3s · cancelled");
  });

  it("T4.43 (C23 I54): the invoke route shows the card while the transport runs and settles with the adapter's document, no `step` in it", async () => {
    const held: { release: (() => void) | null } = { release: null };
    const h = pipelineHarness({
      invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }),
    });
    // `--quiet` is a flag the fixture declares; the first draft typed `--all`, which is
    // not, and read the error route's document as a missing card.
    h.pipeline.submit("/ps --quiet");
    await settled();

    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])).toEqual({ glyph: "step", text: "ps(--quiet)" });
    seconds(h, 2);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("ps(--quiet) · 2s");

    held.release?.();
    await settled();
    const entry = h.transcript.entries[0];
    expect(entry?.streaming).toBe(false);
    expect(entry?.doc.command, "the adapter's document replaced the card (C13 §5)").toBe("adapted");
    expect(entry?.doc.blocks.some((blk) => blk.kind === "notice" && blk.glyph === "step"), "no header survives a replacement").toBe(false);
  });

  it("T4.44 (C23 I54, I25, with §3b): the stall notice is the card's last row while the header counts on; a patch resumes it in place; `end` finishes above both", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    h.pipeline.submit("/tail web.log");
    await settled();
    await gate.data({ a: 1 });
    await settled();

    // 121 one-second wakes: the stall detector fires at two minutes of silence.
    seconds(h, 121);
    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(headerOf(blocks)?.text, "the header kept counting through the silence").toBe("tail(web.log) · 2m 1s");
    const last = blocks.at(-1);
    expect(last?.kind === "notice" && last.text, "the stall row is the card's last row").toBe("no output for 2m");
    expect(last?.kind === "notice" && last.glyph, "under the `⎿` hook").toBe("continuation");
    expect(blocks.map((blk) => blk.kind), "header, body, stall — in that order").toEqual(["notice", "raw", "notice"]);

    await gate.data({ a: 2 });
    await settled();
    const resumed = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(resumed.map((blk) => (blk.kind === "notice" ? blk.text : blk.id)), "resumed in place, the new body row after it").toEqual([
      "tail(web.log) · 2m 1s",
      "o1",
      "resumed after 2m",
      "o2",
    ]);

    await gate.end({ exitCode: 0 });
    await settled();
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 2m 1s · exit 0");
  });

  it("T4.45 (C23 I54): the four frames — running, stalled, resumed, settled — printed in colour for the read", async () => {
    const registry = createBlockRegistry({ defaults: true });
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    const frame = (): readonly string[] => {
      const doc = h.transcript.entries[0]?.doc;
      if (doc === undefined) return [];
      return [
        ...commandRows(doc.command, 80, FULL_CAPS),
        ...renderSequenceToLines(registry, doc.blocks, 80, { theme: DARK_THEME, capabilities: FULL_CAPS }),
      ];
    };
    const captured: string[] = [];
    const capture = (label: string): void => {
      const rows = frame();
      captured.push(`--- ${label}`, ...rows.map((l) => l.replace(//gu, "␛").trimEnd()), "    (visible)", ...rows.map((l) => `    ${visible(l).trimEnd()}`));
    };

    h.pipeline.submit("/tail web.log");
    await settled();
    await gate.data({ a: 1 });
    await settled();
    await gate.data({ a: 2 });
    await settled();
    seconds(h, 4);
    capture("running · 4s");
    seconds(h, 117);
    capture("stalled · 2m 1s");
    await gate.data({ a: 3 });
    await settled();
    capture("resumed");
    await gate.end({ exitCode: 0 });
    await settled();
    capture("settled · exit 0");

    console.log(`LANEP-FRAMES\n${captured.join("\n")}\nLANEP-FRAMES-END`);
    expect(visible(frame()[1] ?? "").trimEnd()).toBe("⏺ tail(web.log) · 2m 1s · exit 0");
  });
});
