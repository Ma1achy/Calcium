/**
 * S9 `/logs <c>` — the pushed streaming view.
 *
 * The consumer C22 §13a reserved and refused: **a verb that is both a view and a
 * stream.** `docker logs -f` has no natural end and A01 D4's test makes it a
 * view, so this is the surface that forced C22 I48's route. `LOGS_WALK.md`
 * carries the rulings.
 *
 * **`docker logs` is not a JSON-emitting verb**, which is the interesting part.
 * It streams whatever the container wrote to stdout — plain text for nginx — so
 * every line arrives as a `malformed` patch and C06 I12 degrades the stream.
 * That is the framework working as designed, and the app still has to write its
 * own `adaptPatch`, for a reason that only exists because of I47.
 */

import { b } from "@fmx/calcium";
import type { Adapter, RawPatch, StreamContext, ViewPatch } from "@fmx/calcium";

/**
 * How many lines the follow replays before it starts following.
 *
 * `docker logs -f` replays the **whole** log first: a container up for a day is
 * tens of thousands of lines, each of them a `ViewPatch` the view re-measures.
 * *The whole log* and *what is on screen* are different requests and S9 asks for
 * the second, so the app names a number rather than inheriting one (walk B5).
 * Same shape as `/inspect`'s split floor.
 *
 * **It lives in the shim, not here, and that is F39 again.** Calcium builds argv
 * from what the reader typed plus what the manifest declares, so an app cannot
 * add `-f` or `--tail` to a spawn — the same wall `--raw` hit from the other
 * direction. `bin/docker-json` supplies both, as it already supplies
 * `--no-stream` for `stats`. The number is stated here because this is where a
 * reader looks for it, and the test asserts the shim rather than this constant.
 */
export const TAIL = 200;

/**
 * A line, as a block of its own — **and this is the whole reason the app writes
 * an adapter for a stream the framework already handles.**
 *
 * C07's fallback accumulates a degraded stream's remainder into **one `raw`
 * block**, replaced on every line (`adapters/stream.ts`, `REMAINDER_ID`). For a
 * transcript entry that is right: C14 windows an entry by rows and a growing
 * block is fine. For a **view** it is the exact pathology C22 I47 was written
 * for — the window falls on block boundaries, so a single block taller than the
 * region is shown cut and reachable by no key, and a follow makes it taller
 * every second.
 *
 * So the app emits **one block per line**, and the view's block-boundary
 * windowing does what it was built to do. Two mechanisms, each correct, whose
 * combination is not (FINDINGS F45).
 */
const lineBlock = (text: string, seq: number): ViewPatch => ({
  op: "append",
  // `seq` is C07's per-stream counter and is unique within the stream by
  // construction, which is what C04 I14 needs — a duplicate id makes `append`
  // refuse, and the refusal is what `streamIntoView` reports as truncation.
  block: b.raw(text, { id: `log-${String(seq)}` }),
});

/**
 * The lines a `data` patch carries, when the far side did emit JSON.
 *
 * Not dead code for a plain-text verb: `docker logs` on a container whose
 * process logs structured JSON — which is most application containers — parses
 * cleanly and never degrades, so both arms are reachable from the same verb
 * against different containers. Rendered as the compact source line rather than
 * pretty-printed, because a follow is read as a stream of events and a
 * multi-line event breaks the one-line-per-event reading.
 */
const textOf = (value: unknown): string => {
  // The shim's wrapping — `{"line": "..."}` — is the normal case for this verb
  // and is checked first (F45). A container whose process logs structured JSON
  // arrives as its own object and is rendered compactly, because a follow reads
  // as one event per line and a pretty-printed object breaks that.
  if (value !== null && typeof value === "object" && "line" in value) {
    const line = (value as { line: unknown }).line;
    if (typeof line === "string") return line;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
};

export function createLogsAdapter(): Adapter {
  return {
    schema: "tui.view/1",

    /**
     * Never reached on the streaming route, and required by the type.
     *
     * `Adapter.adapt` is not optional, and a verb declared `streams` is invoked
     * through `stream()` — so this runs only if the declaration and the route
     * disagree. It is a visible notice rather than a throw or an empty
     * document: the first tells the reader what happened, and the other two are
     * the failure modes F15 and F35 are about.
     */
    adapt(result, ctx) {
      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: "error",
        error: { message: "logs was invoked without streaming", stage: "adapter" },
        blocks: [b.notice.error("logs was invoked without streaming — this is a wiring fault")],
        meta: {
          verb: ctx.verb,
          adapter: "logs",
          exitCode: result.exitCode ?? 0,
          durationMs: result.durationMs,
          truncated: false,
          argv: result.argv,
          stderr: result.stderr,
          transport: ctx.transport,
          origin: ctx.origin,
        },
      };
    },

    adaptPatch(patch: RawPatch, ctx: StreamContext): ViewPatch | null {
      switch (patch.kind) {
        case "malformed":
          // **The normal case for this verb**, not the exceptional one. A plain
          // log line is unparseable by definition and is exactly what the
          // reader asked to see, so it is rendered rather than dropped — which
          // is where this adapter differs from C07's fallback, whose job is to
          // treat an unparseable line among good ones as noise.
          return lineBlock(patch.line, ctx.seq);

        case "data":
          return lineBlock(textOf(patch.value), ctx.seq);

        case "degraded":
          // **Swallowed deliberately.** C06 I12 trips when a stream stops
          // parsing, which for `docker logs` is the first line and every line
          // after it. Reporting it would put *"the output stopped being JSON"*
          // at the top of a log view, which is true, useless, and would be the
          // first thing the reader saw every single time.
          return null;

        case "end":
          // The route appends its own terminal notice from the exit code
          // (C22 I48). A patch here would be a second one saying the same
          // thing, and this adapter does not have the code.
          return null;
      }
    },
  };
}
