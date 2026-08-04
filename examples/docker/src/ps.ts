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

/** One line of `docker ps --format json`, before anything is trusted about it. */
type Row = Readonly<Record<string, unknown>>;

/**
 * Every field read goes through here (walk C4).
 *
 * `Platform` is an object and R01 §4 said everything was a string, so the shape
 * is checked rather than assumed at each use site. A missing or wrongly-shaped
 * value is `""`; nothing throws and nothing renders `[object Object]`.
 */
const str = (row: Row, key: string): string => {
  const v = row[key];
  return typeof v === "string" ? v : "";
};

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
  b.col("name", { label: "NAME", priority: 95, minWidth: 16, flex: true, sortable: true }),
  // `truncate: "start"` keeps `…app:v4` — an image reference is hierarchical with
  // the leaf last, which is the case C04 I30 names for `"start"`. Blind spot,
  // stated in walk B3: a flat generated name degrades to `…-features`, and a
  // screen of devcontainers all look alike.
  b.col("image", { label: "IMAGE", priority: 60, minWidth: 20, truncateFrom: "start" }),
  // 22 is the measured maximum (`Exited (0) 5 weeks ago`), so the column never
  // truncates — which is the whole of "never truncates": a `minWidth` that fits
  // the longest real value. Walk B1 on what that trades against.
  b.col("status", { label: "STATUS", priority: 85, minWidth: 22 }),
  // From the end, keeping `0.0.0.0:8080…`. The host port is on the left in the
  // string docker sends — FINDINGS F4 is where the opposite ruling came from and
  // why it was wrong.
  b.col("ports", { label: "PORTS", priority: 40, minWidth: 20, truncateFrom: "end" }),
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
 * NDJSON out of a transport that expected one document (walk A1, A2).
 *
 * C06 calls `JSON.parse` on the whole of stdout, which fails here — concatenated
 * objects are not a JSON document — so `stdout` is `undefined` and `parseError`
 * is set. `stdoutRaw` is retained either way (C06 I6), explicitly so this is
 * possible.
 *
 * **Per line, with a per-line catch.** One `JSON.parse` over the batch discards
 * six good containers for one bad byte (R3.5). A failed line is counted and
 * reported rather than dropped: a skipped line and no line are indistinguishable
 * in the frame otherwise.
 */
export function parseNdjson(raw: string): { rows: Row[]; skipped: number } {
  const rows: Row[] = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        rows.push(parsed as Row);
      } else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { rows, skipped };
}

const plural = (n: number, one: string): string => `${String(n)} ${one}${n === 1 ? "" : "s"}`;

export function createPsAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx) {
      // A failed invocation is an error document, not an empty table (walk A3).
      // The exit code is the only signal that can be trusted: `parseError` is the
      // *normal* case for this far side and says nothing about success.
      const failed = result.exitCode !== 0;
      const { rows, skipped } = failed ? { rows: [], skipped: 0 } : parseNdjson(result.stdoutRaw);
      const running = rows.filter((r) => str(r, "State") === "running").length;

      const summary =
        `${plural(running, "running")} · ${plural(rows.length - running, "stopped")}` +
        (skipped === 0 ? "" : ` · ${plural(skipped, "unreadable line")}`);

      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: failed ? "error" : "ok",
        blocks: failed
          ? [b.notice.error(result.stderr.trim() || `docker exited ${String(result.exitCode)}`)]
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
