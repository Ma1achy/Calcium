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
import { doc, tableOf } from "../support/blocks.js";
import { b } from "../../src/shell/builders/index.js";
import { commandRows } from "../../src/shell/paint.js";
import { entryLayout, measureEntry, renderEntryPieces, windowEntry } from "../../src/shell/entry-layout.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import { DARK_THEME, FULL_CAPS, visible } from "../support/render.js";
import { spinnerFrames } from "../../src/presentation/blocks/glyphs.js";
import { callHead, callStatus, toolCallDoc } from "../../src/shell/documents.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
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

/** The spinner's frame at `second` — the tick is the elapsed second (C23 I58). */
const FRAMES = spinnerFrames(FULL_CAPS);
const SPIN = (second: number): string => FRAMES[second % FRAMES.length] ?? "";

const headerOf = (blocks: readonly Block[]): { glyph: string | undefined; text: string } | null => {
  const first = blocks[0];
  return first?.kind === "notice" ? { glyph: first.glyph, text: first.text } : null;
};

/** A second at a time, so every one-second wake fires the way it does in a session. */
const seconds = (h: ReturnType<typeof pipelineHarness>, n: number): void => {
  for (let i = 0; i < n; i += 1) h.tick(1_000);
};

describe("C23 I54 — the pending entry is the running card", () => {
  it("T4.40 (C23 I54, I53, with C13): bare at dispatch, `· 4s` after four wakes, the body under the header, `· 4s` at `end` (a zero exit is no outcome, C23 I59), and still after", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });

    h.pipeline.submit("/tail web.log");
    await settled(h.pipeline);

    const entry = () => h.transcript.entries[0];
    expect(entry()?.streaming, "step 3 appended a streaming entry").toBe(true);
    // First assertion — the card, not `blocks: []` (T6.80).
    expect(headerOf(entry()?.doc.blocks ?? []), "the header is a `step` notice, the spinner alone below one second (C23 I58)").toEqual({
      glyph: "step",
      text: `tail(web.log) · ${SPIN(0)}`,
    });

    // Second — the figure moves through the route's own readout (T6.81).
    seconds(h, 4);
    expect(headerOf(entry()?.doc.blocks ?? [])?.text).toBe(`tail(web.log) · ${SPIN(4)} 4s`);

    // Third — the streamed body is the entry's own blocks, appended under the header.
    await gate.data({ a: 1 });
    await settled(h.pipeline);
    await gate.data({ a: 2 });
    await settled(h.pipeline);
    expect(entry()?.doc.blocks.map((blk) => blk.id).slice(1), "body blocks follow the header").toEqual(["o1", "o2"]);
    expect(headerOf(entry()?.doc.blocks ?? [])?.text, "the header is untouched by the body").toBe(`tail(web.log) · ${SPIN(4)} 4s`);

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
    await settled(h.pipeline);
    sub[Symbol.dispose]();
    expect(entry()?.streaming, "settled by `end`").toBe(false);
    expect(atSettle, "what persistence writes already carries the final head — the duration, and no `exit 0` (C23 I59)").toBe("tail(web.log) · 4s");
    expect(headerOf(entry()?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 4s");

    // And a settled card keeps its final figure: the readout is gone.
    seconds(h, 3);
    expect(headerOf(entry()?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 4s");
  });

  it("T4.40b (C23 I54): a stream that ends non-zero carries its code, and one that is truncated says so", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    h.pipeline.submit("/tail web.log");
    await settled(h.pipeline);
    seconds(h, 2);
    await gate.end({ exitCode: 1 });
    await settled(h.pipeline);
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
    await settled(h.pipeline);
    h.pipeline.submit("/tail web.log");
    await settled(h.pipeline);

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
    await settled(h.pipeline);
    await settled(h.pipeline);
    const routed = h.transcript.entries[1];
    expect(routed?.id, "same entry").toBe(queued?.id);
    expect(routed?.doc.blocks, "one block: the header replaced the notice").toHaveLength(1);
    expect(headerOf(routed?.doc.blocks ?? [])).toEqual({ glyph: "step", text: `tail(web.log) · ${SPIN(0)}` });
    seconds(h, 2);
    expect(headerOf(h.transcript.entries[1]?.doc.blocks ?? [])?.text).toBe(`tail(web.log) · ${SPIN(2)} 2s`);

    await gate.end({ exitCode: 0 });
    await settled(h.pipeline);
    expect(headerOf(h.transcript.entries[1]?.doc.blocks ?? [])?.text, "never *queued behind* once it ran").toBe(
      "tail(web.log) · 2s",
    );
  });

  it("T4.42 (C23 I54, with C16): Ctrl-C on a running stream → `· 3s · cancelled`, settled, and a later wake changes nothing", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    h.pipeline.submit("/tail web.log");
    await settled(h.pipeline);
    seconds(h, 3);

    h.pipeline.cancel();
    await settled(h.pipeline);
    const entry = h.transcript.entries[0];
    expect(entry?.streaming, "cancel settles the entry (C23 I10)").toBe(false);
    expect(headerOf(entry?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 3s · cancelled");
    expect(h.recorded.at(-1), "a cancellation is a settlement with its own code (C23 I29)").toEqual({ command: "/tail web.log", exitCode: 130 });

    seconds(h, 2);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 3s · cancelled");
  });

  it("T4.43 (C23 I54, I55): the invoke route shows the card while the transport runs and settles with the adapter's blocks under the card's header", async () => {
    const held: { release: (() => void) | null } = { release: null };
    const h = pipelineHarness({
      invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }),
    });
    // `--quiet` is a flag the fixture declares; the first draft typed `--all`, which is
    // not, and read the error route's document as a missing card.
    h.pipeline.submit("/ps --quiet");
    await settled(h.pipeline);

    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])).toEqual({ glyph: "step", text: `ps(--quiet) · ${SPIN(0)}` });
    seconds(h, 2);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe(`ps(--quiet) · ${SPIN(2)} 2s`);

    held.release?.();
    await settled(h.pipeline);
    const entry = h.transcript.entries[0];
    expect(entry?.streaming).toBe(false);
    expect(entry?.doc.command, "the adapter's document replaced the card (C13 §5)").toBe("adapted");
    // **Reversed 2026-09-05** (C23 I55): this read *no header survives a replacement*
    // and the card is now composed over the replacement — one header, block 0.
    // No count in the result and no failure: `verb · duration`, never `ok` (C23 I59).
    expect(headerOf(entry?.doc.blocks ?? []), "and the header is composed over it").toEqual({ glyph: "step", text: "ps(--quiet) · 2s" });
    expect((entry?.doc.blocks ?? []).filter((blk) => blk.kind === "notice" && blk.glyph === "step"), "exactly one").toHaveLength(1);
  });

  it("T4.46 (C23 I54; F795): a bare verb is a bare header — `ps`, not `ps()` — and grows its figure the same way", async () => {
    const held: { release: (() => void) | null } = { release: null };
    const h = pipelineHarness({
      invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }),
    });
    h.pipeline.submit("/ps");
    await settled(h.pipeline);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? []), "no arguments, no parentheses").toEqual({ glyph: "step", text: `ps · ${SPIN(0)}` });
    seconds(h, 2);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe(`ps · ${SPIN(2)} 2s`);
    // The control is T4.43 above: `ps(--quiet)` keeps its parentheses.
    held.release?.();
    await settled(h.pipeline);
  });

  it("T4.44 (C23 I54, I25, with §3b): the stall notice is the card's last row while the header counts on; a patch resumes it in place; `end` finishes above both", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream, adaptPatch: appender() });
    h.pipeline.submit("/tail web.log");
    await settled(h.pipeline);
    await gate.data({ a: 1 });
    await settled(h.pipeline);

    // 121 one-second wakes: the stall detector fires at two minutes of silence.
    seconds(h, 121);
    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(headerOf(blocks)?.text, "the header kept counting through the silence").toBe(`tail(web.log) · ${SPIN(121)} 2m 1s`);
    const last = blocks.at(-1);
    expect(last?.kind === "notice" && last.text, "the stall row is the card's last row").toBe("no output for 2m");
    expect(last?.kind === "notice" && last.glyph, "under the `⎿` hook").toBe("continuation");
    expect(blocks.map((blk) => blk.kind), "header, body, stall — in that order").toEqual(["notice", "raw", "notice"]);

    await gate.data({ a: 2 });
    await settled(h.pipeline);
    const resumed = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(resumed.map((blk) => (blk.kind === "notice" ? blk.text : blk.id)), "resumed in place, the new body row after it").toEqual([
      `tail(web.log) · ${SPIN(121)} 2m 1s`,
      "o1",
      "resumed after 2m",
      "o2",
    ]);

    await gate.end({ exitCode: 0 });
    await settled(h.pipeline);
    expect(headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("tail(web.log) · 2m 1s");
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
    await settled(h.pipeline);
    await gate.data({ a: 1 });
    await settled(h.pipeline);
    await gate.data({ a: 2 });
    await settled(h.pipeline);
    seconds(h, 4);
    capture("running · 4s");
    seconds(h, 117);
    capture("stalled · 2m 1s");
    await gate.data({ a: 3 });
    await settled(h.pipeline);
    capture("resumed");
    await gate.end({ exitCode: 0 });
    await settled(h.pipeline);
    capture("settled");

    console.log(`LANEP-FRAMES\n${captured.join("\n")}\nLANEP-FRAMES-END`);
    expect(visible(frame()[1] ?? "").trimEnd()).toBe("⏺︎ tail(web.log) · 2m 1s");
  });

  // The card kept on settlement — C23 I55/I56, ruled 2026-09-05. Before these
  // rows the invoke route's `settle(id, doc)` replaced the card wholesale, and
  // `❯ /ps` over a table was what a finished listing read.
  it("T4.47 (C23 I55): the invoke route, a throwing adapter and a local verb each settle to the card's header over the result's blocks, and the persisted document carries it", async () => {
    // The invoke route: `ps · 2s · ok` over the adapted blocks.
    const held: { release: (() => void) | null } = { release: null };
    const body = [b.raw("NAME   STATUS", { id: "r1" }), b.raw("web    running", { id: "r2" })];
    const h = pipelineHarness({
      invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }),
      adapt: () => doc({ command: "adapted", blocks: body }),
    });
    const atSettle: Block[][] = [];
    h.transcript.subscribe((change) => {
      if (change.kind === "settle") atSettle.push([...(h.transcript.entries.find((e) => e.id === change.id)?.doc.blocks ?? [])]);
    });
    h.pipeline.submit("/ps");
    await settled(h.pipeline);
    seconds(h, 2);
    held.release?.();
    await settled(h.pipeline);
    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(headerOf(blocks), "the header is block 0, with the duration; no count, so no outcome (C23 I59)").toEqual({ glyph: "step", text: "ps · 2s" });
    expect(blocks.slice(1).map((blk) => blk.id), "the result's own blocks follow it, in order").toEqual(["r1", "r2"]);
    expect(blocks.slice(1).some((blk) => blk.kind === "notice" && blk.glyph === "step"), "one header, not two").toBe(false);
    expect(atSettle, "one settle change, and the document it wrote carries the header").toHaveLength(1);
    expect(headerOf(atSettle[0] ?? [])?.text).toBe("ps · 2s");

    // A throwing adapter: `ps · failed` over the status box.
    const h2 = pipelineHarness({ invoke: () => Promise.reject(new Error("boom")) });
    h2.pipeline.submit("/ps --quiet");
    await settled(h2.pipeline);
    await settled(h2.pipeline);
    const failed = h2.transcript.entries[0]?.doc.blocks ?? [];
    expect(headerOf(failed)).toEqual({ glyph: "step", text: "ps(--quiet) · failed" });
    expect(failed[1]?.kind, "the status box is the body").toBe("status");
    expect(h2.transcript.entries[0]?.doc.status).toBe("error");

    // A local verb: the header over the handler's blocks — a local verb is a call.
    const h3 = pipelineHarness();
    h3.pipeline.submit("/guide");
    await settled(h3.pipeline);
    const local = h3.transcript.entries[0]?.doc.blocks ?? [];
    expect(headerOf(local), "a local verb below one second with no count: the verb alone").toEqual({ glyph: "step", text: "guide" });
    expect(h3.transcript.entries[0]?.doc.meta.transport, "a local document's verdict is its status").toBe("local");
  });

  it("T4.48 (C23 I56, C22 I83, I84): the frame after `/ps` settles hangs the body four cells in under a `⎿` at the header's text column, the header flush, and the measured height is the painted height", async () => {
    const registry = createBlockRegistry({ defaults: true });
    const h = pipelineHarness({
      adapt: () => doc({ command: "adapted", blocks: [b.raw("NAME   STATUS", { id: "r1" }), b.raw("web    running", { id: "r2" })] }),
    });
    h.pipeline.submit("/ps");
    await settled(h.pipeline);
    await settled(h.pipeline);
    const settledDoc = h.transcript.entries[0]?.doc;
    expect(settledDoc).toBeDefined();
    const blocks = settledDoc?.blocks ?? [];
    expect(headerOf(blocks)?.text).toBe("ps");

    // **Through the shell's layout, as `visibleRows` and C14's wrapper both do**
    // (C22 §6l.4 D, §6l.6): the header at 80, the body at 76 with the hook at 2.
    const options = { theme: DARK_THEME, capabilities: FULL_CAPS };
    const height = measureEntry(registry.measureSequence, blocks, 80);
    const drawn = renderEntryPieces(registry, windowEntry(entryLayout(blocks, 80), 0, height, registry), options);
    expect(drawn.rows, "measured rows are painted rows").toHaveLength(height);
    expect(drawn.faults).toEqual([]);
    const rows = drawn.rows.map((l) => visible(l).trimEnd());
    expect(rows[0], "the header at column 0, no `ok` (C23 I59)").toBe("⏺︎ ps");
    expect(rows[1]?.startsWith("  ⎿ "), "the body's first row under the hook, the hook at column 2").toBe(true);
    for (const row of rows.slice(2)) expect(row === "" || row.startsWith("  │ "), "every body row after the first under the bar (C22 I88)").toBe(true);
    // **The indent is the shell's, not the document's** (I56): the blocks carry
    // no gutter of their own, so a second composer does not indent twice.
    expect(blocks.slice(1).every((blk) => blk.kind !== "notice" || blk.glyph !== "continuation")).toBe(true);
    const flat = renderSequenceToLines(registry, blocks.slice(1), 76, options).map((l) => visible(l).trimEnd());
    expect(rows[1]).toBe(`  ⎿ ${flat[0] ?? ""}`);
  });
});

describe("C23 — the call grammar's head states", () => {
  const key = (name: string): InputEvent => ({
    kind: "key",
    key: { name, ctrl: false, meta: false, shift: false, sequence: name },
  });
  const heads = (blocks: readonly Block[]): string[] =>
    blocks.flatMap((blk) => (blk.kind === "notice" && blk.glyph === "step" ? [blk.text] : []));

  it("T4.49 (C23 I58, §8f P9): a stream reads the spinner alone at 0 s, spinner and `1s` after one wake with the frame advanced by exactly one, and the final figure with no spinner at `end`; ASCII draws the set's ASCII pair", async () => {
    const gate = gatedStream();
    const h = pipelineHarness({ stream: gate.stream });
    h.pipeline.submit("/tail web.log");
    await settled(h.pipeline);
    const head = () => headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text;
    expect(head(), "dispatched: the spinner alone, no figure").toBe(`tail(web.log) · ${SPIN(0)}`);
    seconds(h, 1);
    expect(head(), "one wake: the frame moved by one and the figure appeared").toBe(`tail(web.log) · ${SPIN(1)} 1s`);
    seconds(h, 1);
    expect(head(), "the frame is the second, not the sweep").toBe(`tail(web.log) · ${SPIN(2)} 2s`);
    await gate.end({ exitCode: 0 });
    await settled(h.pipeline);
    expect(head(), "settled: the duration alone — no spinner, and no `exit 0` (I59)").toBe("tail(web.log) · 2s");
    // A wake after settlement moves nothing: the readout is gone with the spinner.
    seconds(h, 3);
    expect(head()).toBe("tail(web.log) · 2s");

    // **The ASCII arm draws the set's ASCII pair, and `:` for the separator**
    // (F828) — through the composer the route calls, at the arm it would pass.
    const ascii = { ...FULL_CAPS, unicode: "ascii" as const };
    const asciiFrames = spinnerFrames(ascii);
    const asciiHead = callHead({ name: "tail", args: "web.log", elapsedMs: 1_000, id: "step" }, ascii, 1);
    expect(asciiHead.kind === "notice" && asciiHead.text).toBe(`tail(web.log) : ${asciiFrames[1 % asciiFrames.length] ?? ""} 1s`);
    expect(asciiFrames.every((f) => /^[\x20-\x7e]+$/u.test(f)), "the ASCII pair is ASCII").toBe(true);
  });

  it("T4.50 (C23 I59): a listing with a row count settles to a count, one without settles to duration alone, a non-zero exit is `exit N`, and the string `ok` appears in no settled head across the routes", async () => {
    // A count where one exists — the first table's rows.
    const counted = pipelineHarness({
      adapt: () => doc({
        command: "adapted",
        blocks: [tableOf(3, "t")],
      }),
    });
    counted.pipeline.submit("/ps");
    await settled(counted.pipeline);
    await settled(counted.pipeline);
    expect(headerOf(counted.transcript.entries[0]?.doc.blocks ?? [])?.text, "the count, singular or plural by the number").toBe("ps · 3 rows");

    // No count: duration alone, once there is a figure.
    const held: { release: (() => void) | null } = { release: null };
    const plain = pipelineHarness({ invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }) });
    plain.pipeline.submit("/ps");
    await settled(plain.pipeline);
    seconds(plain, 3);
    held.release?.();
    await settled(plain.pipeline);
    expect(headerOf(plain.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("ps · 3s");

    // A far side's non-zero code is the outcome, and it wins over a count. **Not
    // 2**: exit 2 is the usage route (`/verb --help`'s document, F92) and never
    // reaches the adapter — the first draft asked for it and read `failed`.
    const failed = pipelineHarness({
      invoke: () => Promise.resolve(result({ exitCode: 3 })),
      // The code the head reads is the document's (`meta.exitCode`, set by the registry from the raw result).
      // `error` is required when the status is `error` (C04 I3); without it the settle refused the document and the head read `failed`.
      adapt: () => doc({ command: "adapted", status: "error", error: { message: "ps failed" }, blocks: [tableOf(1, "t")], meta: { ...doc().meta, exitCode: 3 } }),
    });
    failed.pipeline.submit("/ps");
    await settled(failed.pipeline);
    await settled(failed.pipeline);
    expect(headerOf(failed.transcript.entries[0]?.doc.blocks ?? [])?.text).toBe("ps · exit 3");

    // **`ok` in no settled head, over the routes the harness can drive**: invoke,
    // a throwing adapter, a local verb, a stream's `end`, a stream throw, and a
    // shell command. The word was the placeholder for *no count*, and a placeholder
    // that survives one route survives them all.
    const gate = gatedStream();
    const streamed = pipelineHarness({ stream: gate.stream });
    streamed.pipeline.submit("/tail web.log");
    await settled(streamed.pipeline);
    await gate.end({ exitCode: 0 });
    await settled(streamed.pipeline);
    const thrown = pipelineHarness({ invoke: () => Promise.reject(new Error("boom")) });
    thrown.pipeline.submit("/ps --quiet");
    await settled(thrown.pipeline);
    await settled(thrown.pipeline);
    const local = pipelineHarness();
    local.pipeline.submit("/guide");
    await settled(local.pipeline);
    const streamThrow = pipelineHarness({
      stream: () => (async function* () { yield { kind: "data", value: {} } as RawPatch; throw new Error("socket closed"); })(),
    });
    streamThrow.pipeline.submit("/tail");
    await settled(streamThrow.pipeline);
    await settled(streamThrow.pipeline);
    const shell = pipelineHarness({
      spawnShell: () => ({
        stdout: (async function* () { yield "hello\n"; })(),
        stderr: (async function* () { /* nothing */ })(),
        exited: Promise.resolve({ code: 0, signal: null }),
        overflowed: false,
      }) as never,
    });
    shell.pipeline.submit("echo hello");
    await settled(shell.pipeline);
    await settled(shell.pipeline);
    const every = [counted, plain, failed, streamed, thrown, local, streamThrow, shell].flatMap((x) =>
      x.transcript.entries.flatMap((e) => heads(e.doc.blocks)),
    );
    expect(every.length, "the control: heads were composed").toBeGreaterThanOrEqual(7);
    for (const text of every) expect(text, "no head carries `ok`").not.toMatch(/\bok\b/u);
    expect(every, "the settled forms").toEqual(expect.arrayContaining(["ps · 3 rows", "ps · 3s", "ps · exit 3", "tail(web.log)", "ps(--quiet) · failed", "guide", "tail · failed"]));
  });

  it("T4.51 (C23 I60, §8f P10, P12; C04 §3c S4): a call needing approval reads `waiting` with no readout; approve pops the layer and the readout starts; deny settles the card reading `denied` with history 126 and no body; the head's `⏎` is `expand` aimed at the body's scroll", async () => {
    // **Approve.** The head waits with the spinner and the word, and no figure
    // grows while it does — the readout is registered on approval, so the tool's
    // clock starts when the tool does (P1's rule).
    const held: { release: (() => void) | null } = { release: null };
    const h = pipelineHarness({
      invoke: () => new Promise((r) => { held.release = () => r(result({ exitCode: 0 })); }),
      approval: (call) => (call.name === "ps" ? { consequence: "lists every container, including exited ones" } : null),
    });
    h.pipeline.submit("/ps");
    await settled();
    const head = () => headerOf(h.transcript.entries[0]?.doc.blocks ?? [])?.text;
    expect(head(), "waiting: spinner and the word, never a figure").toBe(`ps · ${SPIN(0)} waiting`);
    seconds(h, 3);
    expect(head(), "no readout while waiting — three seconds pass and the head does not move").toBe(`ps · ${SPIN(0)} waiting`);
    expect(h.calls, "the transport has not been invoked").not.toContain("invoke");
    const handler = h.confirm.answerHandler();
    expect(handler, "the confirm layer is up").not.toBeNull();
    handler?.(key("y"));
    await settled();
    await settled();
    expect(h.calls, "approved: the tool runs").toContain("invoke");
    expect(head(), "the readout starts at approval, from zero").toBe(`ps · ${SPIN(0)}`);
    seconds(h, 2);
    expect(head(), "and counts from there, not from the submit").toBe(`ps · ${SPIN(2)} 2s`);
    held.release?.();
    await settled();
    expect(head()).toBe("ps · 2s");
    expect(h.recorded.map((r) => r.exitCode)).toEqual([0]);

    // **Deny.** The card settles reading `denied`, with no body, no invocation,
    // and history code 126 — the shell's *not executable*.
    const d = pipelineHarness({
      invoke: () => Promise.resolve(result({ exitCode: 0 })),
      approval: () => ({}),
    });
    d.pipeline.submit("/ps");
    await settled(d.pipeline);
    d.confirm.answerHandler()?.(key("n"));
    await settled(d.pipeline);
    await settled(d.pipeline);
    const denied = d.transcript.entries[0];
    expect(headerOf(denied?.doc.blocks ?? [])?.text).toBe("ps · denied");
    expect(denied?.doc.blocks, "no body — it never ran").toHaveLength(1);
    expect(denied?.streaming, "settled").toBe(false);
    expect(d.calls).not.toContain("invoke");
    expect(d.recorded).toEqual([{ command: "/ps", exitCode: 126 }]);
    expect(d.confirm.answerHandler(), "the layer is gone").toBeNull();

    // **A call nobody asks about runs as before**: the emitter is a seam, not a gate.
    const free = pipelineHarness({ approval: () => null });
    free.pipeline.submit("/ps");
    await settled(free.pipeline);
    await settled(free.pipeline);
    expect(free.calls).toContain("invoke");
    expect(free.confirm.answerHandler()).toBeNull();

    // **`⏎` on the head is `expand`, aimed at the body's scroll** (C09 I47, C26
    // §5): the composer's document carries it on the head, and a head over a body
    // with no scroll carries no action — an element, with nothing to activate.
    // The toggle itself is C04 I98's `collapsed` replace, tested where it lives;
    // whether a paged box reopens where it was is C14's offset and is owed there.
    const folded = toolCallDoc("run_command", { name: "run_command", args: "npm test", output: [b.raw("x", { id: "o1" })], height: 3, collapsed: true }, { origin: "agent" }, FULL_CAPS);
    const scroll = folded.blocks.find((blk) => blk.kind === "scroll");
    const foldedHead = folded.blocks[0];
    expect(foldedHead?.kind === "notice" && foldedHead.action).toEqual({ kind: "expand", label: "expand", target: scroll?.id });
    const bare = toolCallDoc("ps", { name: "ps", args: "", result: "one line" }, { origin: "agent" }, FULL_CAPS);
    expect(bare.blocks[0]?.kind === "notice" && bare.blocks[0].action, "no scroll, no action").toBeUndefined();
    expect(validateDocument(folded).ok).toBe(true);
  });

  it("T4.52 (C23 I61, §8f P8, P11): a stream throw settles over a `status` box under a kept head; a retry's box carries the countdown while the head carries elapsed; and the resuming replace keeps the block count", async () => {
    const h = pipelineHarness({
      stream: () => (async function* () { yield { kind: "data", value: {} } as RawPatch; throw new Error("socket closed"); })(),
    });
    h.pipeline.submit("/tail");
    await settled(h.pipeline);
    await settled(h.pipeline);
    const blocks = h.transcript.entries[0]?.doc.blocks ?? [];
    expect(headerOf(blocks)?.text, "the head is kept, with the word").toBe("tail · failed");
    const box = blocks.at(-1);
    expect(box?.kind === "status" && { state: box.state, message: box.message }, "the failure is the `status` kind, not a notice").toEqual({
      state: "error",
      message: "stream failed: Error: socket closed",
    });
    expect(blocks.some((blk) => blk.kind === "notice" && blk.tone === "error"), "no error notice anywhere in the card").toBe(false);
    expect(h.transcript.entries[0]?.streaming, "settled").toBe(false);

    // **The retry's two numbers live in two places** (C09 §3a: three numbers on
    // one line is one too many): the countdown is the box's, the elapsed is the
    // head's. **No card route retries today** — the view route's `renderError`
    // is the one producer of a `retrying` box — so this is the composer's half,
    // at the shapes the route would pass.
    const retrying = callStatus("retrying", "connection lost", { id: "s", retryInMs: 12_000, attempt: 2 });
    expect(retrying.kind === "status" && [retrying.state, retrying.retryInMs, retrying.attempt]).toEqual(["retrying", 12_000, 2]);
    const head = callHead({ name: "tail", args: "web.log", elapsedMs: 41_000, id: "step" }, FULL_CAPS, 41);
    expect(head.kind === "notice" && head.text, "the head: elapsed and the spinner, never the countdown").toBe(`tail(web.log) · ${SPIN(41)} 41s`);
    expect(head.kind === "notice" && head.text).not.toContain("12");

    // **Resume replaces the box in place** — `ViewPatch` has no delete (§8a A4's
    // trap), so the box becomes the muted line and the block count is unchanged.
    const r = pipelineHarness();
    const id = r.transcript.append(doc({ command: "tail", blocks: [head, b.raw("o1", { id: "o1" }), retrying] }), { streaming: true });
    const before = r.transcript.entries.find((e) => e.id === id)?.doc.blocks.length;
    const outcome = r.transcript.patch(id, { op: "replace", blockId: "s", block: b.notice("muted", "resumed after 2 attempts", "continuation", { id: "s" }) }, "shell");
    expect(outcome.ok).toBe(true);
    const after = r.transcript.entries.find((e) => e.id === id)?.doc.blocks ?? [];
    expect(after.length, "same count").toBe(before);
    expect(after.map((blk) => blk.kind), "same order — the box's slot is the notice's").toEqual(["notice", "raw", "notice"]);
  });

  it("T4.53 (C23 I62, §8f P13, §8g rows 20–21): three children in dispatch order roll up `1 of 3`, keep their order when the third settles first, sum same-unit counts, read `2 of 3 · 1 failed` on one failure, keep the parent's wall clock, and roll up `0 of 3 · 3 cancelled`", () => {
    const META = { origin: "agent" as const };
    const child = (name: string, args: string, rest: Partial<Parameters<typeof toolCallDoc>[1]> = {}) => ({ name, args, id: `c-${name}-${args}`, ...rest });
    const parent = (children: readonly ReturnType<typeof child>[], rest: Partial<Parameters<typeof toolCallDoc>[1]> = {}) =>
      toolCallDoc("agent", { name: "agent", args: "review", elapsedMs: 8_000, children, ...rest }, META, FULL_CAPS);

    // The third dispatched settles first: `1 of 3`, and the order is still the dispatch order.
    // **The first running child has output** — the mutation pass found the row
    // could not see a body drawn for a running child when no running child had
    // anything to draw: a fixture that cannot construct its subject tests nothing.
    const oneDone = parent([
      child("search", "a", { output: [b.raw("src/a.ts:12", { id: "o-a" })], height: 3 }),
      child("search", "b"),
      child("search", "c", { elapsedMs: 3_000, outcome: "12 matches", settled: true, result: "…" }),
    ]);
    expect(validateDocument(oneDone).ok).toBe(true);
    expect(heads(oneDone.blocks)[0], "running: spinner, wall clock, `k of N`").toBe(`agent(review) · ${SPIN(0)} 8s · 1 of 3`);
    const cards = oneDone.blocks.filter((blk) => blk.kind === "group");
    expect(cards.map((g) => g.kind === "group" && heads(g.children)[0]), "dispatch order, the settled one still last").toEqual([
      `search(a) · ${SPIN(0)}`,
      `search(b) · ${SPIN(0)}`,
      "search(c) · 3s · 12 matches",
    ]);
    expect(cards.map((g) => g.kind === "group" && g.children.length), "running children are head only; the settled one has a body").toEqual([1, 1, 2]);
    const settledBody = cards[2]?.kind === "group" ? cards[2].children[1] : undefined;
    expect(settledBody?.kind, "a settled child's body is under the hook").toBe("notice");

    // Same-unit counts sum; the parent's clock is its own — 8 s over three 3 s children.
    const allDone = parent(
      [
        child("search", "a", { elapsedMs: 3_000, outcome: "41 matches", settled: true }),
        child("search", "b", { elapsedMs: 3_000, outcome: "12 matches", settled: true }),
        child("search", "c", { elapsedMs: 3_000, outcome: "29 matches", settled: true }),
      ],
      { settled: true },
    );
    expect(heads(allDone.blocks)[0]).toBe("agent(review) · 8s · 82 matches");

    // One failure: `k of N · m failed`; a non-zero exit is a failure; the message is never adopted.
    const oneFailed = parent(
      [
        child("search", "a", { elapsedMs: 3_000, outcome: "41 matches", settled: true }),
        child("run_command", "npm test", { elapsedMs: 5_000, outcome: "exit 1", settled: true }),
        child("search", "c", { elapsedMs: 3_000, outcome: "29 matches", settled: true }),
      ],
      { settled: true },
    );
    expect(heads(oneFailed.blocks)[0]).toBe("agent(review) · 8s · 2 of 3 · 1 failed");

    // Ctrl-C with three running: every child `cancelled`, the parent `0 of 3 · 3 cancelled`.
    const cancelled = parent(
      ["a", "b", "c"].map((a) => child("search", a, { elapsedMs: 2_000, outcome: "cancelled", settled: true })),
      { settled: true },
    );
    expect(heads(cancelled.blocks)[0]).toBe("agent(review) · 8s · 0 of 3 · 3 cancelled");

    // Mixed units with no failure: `k of N`, not a sum of unlike things.
    const mixed = parent(
      [child("search", "a", { outcome: "41 matches", settled: true }), child("ls", "src", { outcome: "9 files", settled: true }), child("ps", "", { outcome: "3 rows", settled: true })],
      { settled: true },
    );
    expect(heads(mixed.blocks)[0]).toBe("agent(review) · 8s · 3 of 3");
  });
});
