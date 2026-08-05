/**
 * `docker ps` → a table. Every ruling here is ADAPTER_WALK.md's.
 *
 * The awkwardness is the point (R01 §4): capitalised keys, a prose `Status`
 * beside a machine-readable `State`, a `Ports` string that must not be parsed,
 * a `Platform` that is an object where the spec promised a string, and NDJSON
 * arriving through a transport that tried to parse it as one document.
 */

import { b } from "@fmx/calcium";
import type { Adapter, ColumnDef, Glyph, TableRow, Tone } from "@fmx/calcium";
import { parseNdjson, str } from "./ndjson.ts";
import type { Row } from "./ndjson.ts";

export { parseNdjson };

/**
 * `State` drives the glyph and the tone, never the prose `Status` (R01
 * commitment 4, R5.1). Walk C1 is the row where using the wrong field produces
 * a table that looks right.
 *
 * **`paused` deviates from R01 §5, which asks for `▪`.** There is no `▪` in
 * C09's glyph table — R01 named a character while saying it was following the
 * framework's vocabulary, and the vocabulary is slots (C04 I6). `pending` (`◌`)
 * is the honest neighbour: suspended, not progressing, distinct from
 * `restarting`'s `▲`. Recorded as F6.
 *
 * The default arm is load-bearing rather than defensive: docker may add a state,
 * and an unknown one must render as unknown instead of throwing or borrowing
 * another state's colour.
 */
const STATES: Readonly<Record<string, { glyph: Glyph; tone: Tone }>> = {
  running: { glyph: "running", tone: "ok" },
  restarting: { glyph: "warn", tone: "warn" },
  paused: { glyph: "pending", tone: "warn" },
  exited: { glyph: "error", tone: "error" },
  dead: { glyph: "error", tone: "error" },
  created: { glyph: "queued", tone: "muted" },
};
export const stateOf = (state: string): { glyph: Glyph; tone: Tone } =>
  STATES[state] ?? { glyph: "bullet", tone: "muted" };

/**
 * Columns. Priorities are R01 §5's; the arithmetic is walk B1's.
 *
 * `CPU` and `MEM` are deliberately absent — they come from `docker stats`, and a
 * column with no data is not a placeholder, it is a lie the width pays for. They
 * land with S4, the verb that has them.
 */
export const COLUMNS: readonly ColumnDef[] = [
  // **No `flex`, and a `maxWidth`.** With `flex: true` NAME absorbed every spare
  // column — 54 of them at width 120 — and PORTS truncated on a terminal wide
  // enough for it twice over. Container names are short; the slack belongs to the
  // column whose content is long. Read off the frame, not off the arithmetic:
  // every width assertion passed while the table was mostly whitespace.
  b.col("name", { label: "NAME", priority: 95, minWidth: 16, maxWidth: 24, sortable: true }),
  // `truncate: "start"` keeps `…app:v4` — an image reference is hierarchical with
  // the leaf last, which is the case C04 I30 names for `"start"`. Blind spot,
  // stated in walk B3: a flat generated name degrades to `…-features`, and a
  // screen of devcontainers all look alike.
  b.col("image", { label: "IMAGE", priority: 60, minWidth: 20, truncateFrom: "start" }),
  // **24, not 22, and the two extra cells are the glyph's.**
  //
  // The longest real status is `Exited (0) 5 weeks ago` — 22 cells — and a
  // `minWidth` of 22 still truncated it in the frame, because walk C2 put the
  // glyph *inside* this cell (`✗ `, two cells) while walk B1 computed the width
  // from the text alone. Both rulings are right and neither owns the gap between
  // them; "STATUS never truncates" was false on every stopped container.
  //
  // Found by reading the frame. The test that covered it asserted
  // `minWidth >= max(cells(Status))`, which is the defect restated as an
  // assertion — it passed against a table that truncated.
  b.col("status", { label: "STATUS", priority: 85, minWidth: 24 }),
  // From the end, keeping `0.0.0.0:8080…`. The host port is on the left in the
  // string docker sends — FINDINGS F4 is where the opposite ruling came from and
  // why it was wrong.
  b.col("ports", { label: "PORTS", priority: 40, minWidth: 20, flex: true, truncateFrom: "end" }),
];

function rowOf(raw: Row, index: number): TableRow {
  const { glyph, tone } = stateOf(str(raw, "State"));

  // Docker joins aliases with commas: first in the column, all of them in the
  // detail (R1.3). The corpus has none, which is why the row is in the walk —
  // the case that never appears locally is the one that ships broken.
  const names = str(raw, "Names").split(",").filter(Boolean);
  const ports = str(raw, "Ports").trim();

  return b.row(
    str(raw, "ID") || `row-${String(index)}`,
    {
      name: { text: names[0] ?? "", tone: "identifier" },
      image: { text: str(raw, "Image") },
      // The glyph rides on the status cell (walk C2): `Cell` carries `glyph` and
      // `tone` beside `text`, so `State` drives the mark while `Status` supplies
      // the words, and no separate column is needed.
      status: { text: str(raw, "Status"), glyph, tone },
      // Verbatim, whitespace only. Condensing would lose the bind address, and
      // `0.0.0.0` versus `127.0.0.1` is whether the port faces the network.
      ports: ports === "" ? { text: "—", tone: "muted" } : { text: ports.replace(/\s+/g, " ") },
    },
    names.length > 1 ? { detail: [b.kv({ names: names.join(", ") })] } : undefined,
  );
}

/**
 * `2 running · 0 stopped` — the words do not pluralise.
 *
 * The first version added an `s` and produced "2 runnings · 0 stoppeds", which
 * every test passed: they asserted the *counts* and the unreadable-line clause,
 * and none of them read the sentence. Found by looking at the frame.
 */
const count = (n: number, word: string): string => `${String(n)} ${word}`;

export function createPsAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx) {
      // A failed invocation is an error document, not an empty table (walk A3).
      // The exit code is the only signal that can be trusted: `parseError` is the
      // *normal* case for this far side and says nothing about success.
      const failed = result.exitCode !== 0;
      const { rows, skipped } = failed ? { rows: [], skipped: 0 } : parseNdjson(result.stdoutRaw);
      // **A paused container is not a stopped one, and this said it was.**
      //
      // The summary was `running` against `everything else`, which reads fine
      // until the machine has a paused container: `/ps` showed five rows, one of
      // them `◌ Up 11 minutes (Paused)`, and summarised them as
      // `4 running · 1 stopped` — a count contradicting a row three lines above
      // it. Found by the dashboard's walk A1, which had to answer the same
      // question and answered it differently; nothing in step 1 could have
      // caught it, because step 1 never had a paused container to look at.
      //
      // A two-way split over three states is the shape: every state that is not
      // the named one falls into the other bucket, and the bucket's label is a
      // claim about all of them.
      const states = rows.map((r) => str(r, "State"));
      const running = states.filter((st) => st === "running").length;
      const paused = states.filter((st) => st === "paused" || st === "restarting").length;
      const stopped = states.length - running - paused;

      const skippedNote =
        skipped === 0 ? "" : ` · ${String(skipped)} unreadable line${skipped === 1 ? "" : "s"}`;
      const summary =
        [
          count(running, "running"),
          ...(paused === 0 ? [] : [count(paused, "paused")]),
          ...(stopped === 0 ? [] : [count(stopped, "stopped")]),
        ].join(" · ") + skippedNote;

      const failure = result.stderr.trim() || `docker exited ${String(result.exitCode)}`;

      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: failed ? "error" : "ok",
        // **C04 I3 requires it, and its absence is silent** — `transcript.append`
        // throws and `appendAndCommit` discards, so a failing `docker ps` would
        // have produced no entry at all rather than the error notice below it.
        // Never seen, because no frame-read ever had docker fail. FINDINGS F35.
        ...(failed ? { error: { message: failure, stage: "adapter" as const } } : {}),
        blocks: failed
          ? [b.notice.error(failure)]
          : [
              b.table({
                id: "containers",
                columns: COLUMNS,
                rows: rows.map(rowOf),
                emptyMessage: "no containers running · try /ps --all",
              }),
              ...(rows.length === 0 ? [] : [b.notice("muted", summary, undefined, { gapBefore: true })]),
            ],
        meta: {
          verb: ctx.verb,
          adapter: "ps",
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
  };
}
