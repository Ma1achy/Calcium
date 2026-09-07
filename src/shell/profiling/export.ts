/**
 * The report, in formats other tools already read (C28 §7).
 *
 * **Flame charts arrive with no renderer written.** The span tree this
 * component builds is the same shape Chrome's Trace Event format describes, so
 * emitting that format hands the data to Perfetto (`ui.perfetto.dev`) and
 * speedscope, both of which draw a flame chart, a sandwich view and a left-heavy
 * view over it. A renderer of ours would be a fourth implementation of a picture
 * two tools draw better, and it would arrive later.
 *
 * The two formats answer different questions and neither replaces the other:
 *
 * - **Trace events** — *where did this frame go*. A tree per retained frame,
 *   nested by containment on one lane, opened in a viewer.
 * - **NDJSON** — *what happened over four hours*. One frame per line, appended,
 *   greppable, and readable by `jq` without holding the session in memory. A
 *   long session's timeline is the thing a single JSON document cannot be.
 *
 * The captures need neither: `Profiler.stop` already returns V8's `.cpuprofile`
 * shape, so a CPU profile is written in the format its readers expect and this
 * file never sees it.
 */
import type { TreeNode } from "./tree.js";
import type { FrameRecord, ProfileReport } from "./types.js";

/**
 * One complete event, as the Trace Event format defines it.
 *
 * **Not exported**, deliberately. The schema is Chrome's and publishing a type
 * for it would be a second declaration of someone else's format, drifting from
 * it silently — a consumer reads the JSON with their own type or with the
 * format's documentation, and what this component publishes is the document.
 *
 * `ph: "X"` is *complete* — a begin and an end in one record, which is what a
 * closed span is. `ts` and `dur` are **microseconds**, and this component's
 * clock is in milliseconds, so every figure is multiplied on the way out and
 * nothing is multiplied twice.
 */
type TraceEvent = Readonly<{
  name: string;
  cat: string;
  ph: "X" | "i";
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  s?: "g";
  args?: Readonly<Record<string, string | number>>;
}>;

const MS_TO_US = 1000;

/** One lane. Everything here ran on one thread and pretending otherwise would
 *  put concurrent-looking bars beside work that was strictly sequential. */
const PID = 1;
const TID = 1;

/**
 * Walk a retained tree into complete events.
 *
 * **`startedAt` is on the node rather than derived, and that is the whole
 * reason the field exists.** A parent's children do not tile it — the gaps are
 * the parent's own self time — so laying them out end to end inside the parent
 * would produce a timeline that is plausible, well-formed, and not what
 * happened. A viewer cannot tell the difference and neither can a reader.
 */
function walk(node: TreeNode, out: TraceEvent[], depth: number): void {
  out.push(
    Object.freeze({
      name: node.name,
      // The category is what a viewer colours by, so it separates the two feeds
      // a reader has to tell apart: an element is a block instance the registry
      // seam measured, a phase is a span a component opened inside itself.
      cat: node.name.includes("#") ? "element" : "phase",
      ph: "X" as const,
      ts: Math.round(node.startedAt * MS_TO_US),
      dur: Math.round(node.total * MS_TO_US),
      pid: PID,
      tid: TID,
      args: Object.freeze({ self: Number(node.self.toFixed(4)), depth }),
    }),
  );
  for (const child of node.children) walk(child, out, depth + 1);
}

/**
 * The retained frames as a Trace Event document.
 *
 * **Only the retained frames have trees** (C28 I32), so this is the worst N and
 * not the session: a tree per frame is unbounded where a per-key sum is not.
 * That is stated in the output rather than left for a reader to notice, as a
 * metadata event naming how many frames the session had and how many are drawn.
 */
export function toTraceEvents(report: ProfileReport): string {
  const events: TraceEvent[] = [];
  const withTrees = report.timeline.filter((f) => f.tree !== undefined);

  for (const frame of withTrees) {
    if (frame.tree === undefined) continue;
    walk(frame.tree, events, 0);
  }

  // Marks as instant events, so a session's own landmarks — a resize, a
  // suspend, a far-side response — land on the same axis as the spans.
  for (const mark of report.marks) {
    events.push(
      Object.freeze({
        name: mark.label,
        cat: "mark",
        ph: "i" as const,
        ts: Math.round(mark.at * MS_TO_US),
        pid: PID,
        tid: TID,
        s: "g" as const,
      }),
    );
  }

  return JSON.stringify({
    traceEvents: events,
    displayTimeUnit: "ms",
    // **The document says what it is not.** A reader opening this and counting
    // frames would otherwise conclude the session drew `withTrees.length` of
    // them, which is the retention policy read as a measurement.
    otherData: {
      tier: report.regime.tier,
      node: report.regime.node,
      framesInSession: String(report.frames),
      framesWithTrees: String(withTrees.length),
      retentionNote:
        "trees are kept for the worst frames only (C28 I32); framesInSession is the real count",
    },
  });
}

/**
 * One frame per line.
 *
 * **Appendable, which a JSON document is not**, and that is the whole
 * difference: a four-hour session's timeline can be written as it happens and
 * read with `jq` without the reader holding it. The fields are the record's own
 * — no derived totals, and in particular **no sum of `work` and `wait`** (C28
 * I4), because two columns that add up look like a column that is missing.
 */
export function toNdjson(report: ProfileReport): string {
  return report.timeline
    .map((frame: FrameRecord) =>
      JSON.stringify({
        seq: frame.seq,
        at: frame.at,
        reason: frame.reason,
        work: frame.work,
        wait: frame.wait,
        outcome: frame.outcome,
        selfInflicted: frame.selfInflicted,
        spans: frame.spans,
      }),
    )
    .join("\n");
}
