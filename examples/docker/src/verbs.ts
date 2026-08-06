/**
 * S10 and S11's four one-call verbs — `/diff`, `/images`, `/top`, `/port`.
 *
 * **One file, because each is thirty lines and four files of ceremony is
 * worse.** `/drift` and `/compare` share `drift.ts` for the same reason: what
 * makes a file is a shared mechanism, and these four share three — the meta
 * block, the failure arm, and the ruling that an empty result says so in words.
 *
 * Every ruling here is `S11_WALK.md`'s.
 *
 * **Three of the four far sides do not emit JSON**, which is the step's
 * headline and not a footnote: `docker diff` and `docker port` have no
 * `--format` flag at all, and `docker top`'s `--format` is `ps` options.
 * `bin/docker-json` drops Calcium's `--json` for all three (walk A1), so what
 * arrives here is text, and each adapter parses it — which is what `adapt`
 * receiving a whole `RawResult` is for. `/ps` already parses its own NDJSON;
 * this is the same seam, one layer coarser.
 */

import { b, cells } from "@fmx/calcium";
import type {
  AdapterDocument,
  Adapter,
  AdapterContext,
  Block,
  ColumnDef,
  KeyValueRow,
  RawResult,
  TableRow,
  Tone,
  ViewDocument,
} from "@fmx/calcium";
import { parseNdjson, str } from "./ndjson.ts";

/**
 * The nine `meta` fields, written once for these four.
 *
 * F13: `compose` fills them and is not exported, so every adapter in this app
 * writes them out by hand. Four more copies is what this avoids; the existing
 * four are left alone, because a refactor of shipped adapters is not what this
 * step is.
 */
/**
 * The failure arm, shared — **and it is shared because it is the arm that runs
 * least and is tested least.**
 *
 * Step 4's lesson: three error documents, two shipped, none ever run, ninety-one
 * rows agreeing with all three. Four new verbs is four new failure arms nobody
 * would reach by accident, so they get one implementation and one set of rows.
 *
 * C04 I3 requires `error` when `status` is `"error"`, and its absence is silent
 * — C13 throws, C23 discards, and the reader gets no entry at all rather than
 * this notice (F35).
 */
function failureDoc(
  result: RawResult,
  ctx: AdapterContext,
  adapter: string,
  message: string,
): AdapterDocument {
  return {
    schema: "tui.view/1",
    command: ctx.command,
    status: "error",
    error: { message, stage: "adapter" },
    blocks: [b.notice.error(message)],
    meta: { adapter },
  };
}

/** What docker said, or something that at least names the exit code. */
const failureOf = (result: RawResult): string =>
  result.stderr.trim() || `docker exited ${String(result.exitCode)}`;

const okDoc = (
  result: RawResult,
  ctx: AdapterContext,
  adapter: string,
  blocks: readonly Block[],
): AdapterDocument => ({
  schema: "tui.view/1",
  command: ctx.command,
  status: "ok",
  blocks,
  meta: { adapter },
});

/** Lines, without the trailing empty one a final newline produces. */
const linesOf = (raw: string): string[] => raw.split("\n").filter((l) => l.trim() !== "");

// ── /diff ───────────────────────────────────────────────────────────────────

/**
 * Docker's three change types, and nothing is inferred beyond them.
 *
 * **`+ - ~` are text on the cell, not glyphs** (walk A10). C04's `Glyph` union
 * is thirteen semantic slots and none of them means *added*; the type's own
 * comment says where such a character goes — *"anything outside this vocabulary
 * goes in the block's text"*. So the marker is text, and it is the framework's
 * own ruling rather than a workaround.
 *
 * **And the tones are not S10's, because the framework refused S10's.** The
 * drawing asks for `ok` / `error` / `warn`, and C04 I6 requires a glyph on
 * `error` and `warn` — *colour alone does not survive 1-bit or a colour-blind
 * reader*. `b.row` threw, which is the implementation falsifying the walk on
 * first run, and the throw was right twice over:
 *
 * - a deleted file is **not an error**. `docker diff` reporting `D` is a fact
 *   about a container, not a fault, and `error` is a health slot;
 * - the marker already carries the distinction without colour, which is the
 *   thing I6 exists to guarantee.
 *
 * So the change axis is carried by the marker and the word, and the tone is
 * chosen from the slots that claim no severity. **A change axis has no home in a
 * health palette** — gap 3's shape on a surface with no numbers in it, and
 * F30's other half: F30 filed `Comparison`'s verdict union for mixing a change
 * axis with a judgement axis, and this is the same collision one block over,
 * where the palette has only the judgement axis. FINDINGS F49.
 */
const CHANGES: Readonly<Record<string, { mark: string; word: string; tone: Tone }>> = {
  A: { mark: "+", word: "added", tone: "ok" },
  D: { mark: "-", word: "deleted", tone: "muted" },
  C: { mark: "~", word: "modified", tone: "accent" },
};

const DIFF_COLUMNS: readonly ColumnDef[] = [
  // **The word comes first, and the frame is what decided that.**
  //
  // Drawn the other way round — path, then the word — S10's two columns render
  // as a path at column 0 and `modified` at column 108, because the path column
  // takes the slack and the terminal is 120 wide. The reader traces across an
  // empty row to pair them. Moving the slack to the word column is worse: a
  // non-flex column is allocated its `minWidth` and nothing more, so the path
  // truncated to twenty cells while eighty sat empty beside it.
  //
  // So the fixed column goes first and the flexible one second, which is the
  // only arrangement of two columns where both are read together. `/ps`'s NAME
  // column carries the same lesson and its comment is in this repository;
  // having read it did not prevent writing it again, and only the frame showed
  // it.
  //
  // `truncateFrom: "start"` for `/ps`'s IMAGE reason, which is stronger here: a
  // path is hierarchical with the leaf last, and the leaf is the thing that
  // changed. `…/nginx/access.log` is useful; `/var/log/ngi…` is not.
  b.col("change", { label: "CHANGE", priority: 50, minWidth: 8, maxWidth: 8 }),
  b.col("path", { label: "PATH", priority: 90, minWidth: 20, flex: true, truncateFrom: "start" }),
];

/** One `C /path` line, or `null` for anything that is not one. */
export function changeRow(line: string, index: number): TableRow | null {
  const kind = line.slice(0, 1);
  const change = CHANGES[kind];
  const path = line.slice(2);
  if (change === undefined || line[1] !== " " || path === "") return null;

  return b.row(`change-${String(index)}`, {
    change: { text: change.word, tone: "dim" },
    path: { text: `${change.mark} ${path}`, tone: change.tone },
  });
}

/**
 * `3 added · 1 modified · 1 deleted`.
 *
 * **Counted verbatim, with nothing pruned** (walk A9). `docker diff` reports a
 * directory as `C` because a child changed, so `1 modified` can be a directory
 * whose own content did not change. Pruning it would be this app inventing a
 * model the far side does not have, and the reader who runs `docker diff`
 * themselves sees the same list. S10's own drawing shows the parent directly
 * above its child, so the drawing was already honest about it.
 *
 * The words do not pluralise, which is why they are not built by adding an `s`
 * — `/ps` shipped "2 runnings" past every test it had.
 */
export function diffSummary(lines: readonly string[]): string {
  const counts = { A: 0, D: 0, C: 0 };
  for (const line of lines) {
    const kind = line.slice(0, 1);
    if (kind === "A" || kind === "D" || kind === "C") counts[kind] += 1;
  }
  return [
    `${String(counts.A)} added`,
    `${String(counts.C)} modified`,
    `${String(counts.D)} deleted`,
  ].join(" · ");
}

export function createDiffAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx): AdapterDocument {
      if (result.exitCode !== 0) return failureDoc(result, ctx, "diff", failureOf(result));

      const lines = linesOf(result.stdoutRaw);
      const rows = lines.map(changeRow).filter((r): r is TableRow => r !== null);
      const unreadable = lines.length - rows.length;

      return okDoc(result, ctx, "diff", [
        b.table({
          id: "changes",
          columns: DIFF_COLUMNS,
          rows,
          showHeader: false,
          // **Walk A3, the empty-block class a fourth time.** A container that
          // has written nothing prints nothing and exits 0, which is
          // indistinguishable from a fetch that failed unless the document says
          // which. Measured on an `alpine sleep`: zero lines, rc 0.
          emptyMessage: "no filesystem changes — nothing has been written to the container layer",
        }),
        ...(rows.length === 0
          ? []
          : [
              b.notice(
                "muted",
                diffSummary(lines) +
                  (unreadable === 0
                    ? ""
                    : ` · ${String(unreadable)} unreadable line${unreadable === 1 ? "" : "s"}`),
                undefined,
                { gapBefore: true },
              ),
            ]),
      ]);
    },
  };
}

// ── /images ─────────────────────────────────────────────────────────────────

/**
 * Docker's word for absent, rendered as this app's.
 *
 * **`<none>` is docker's null, not a repository name** (walk A7). The verbatim
 * rule — *docker's strings are not ours to normalise* — is about values, and an
 * untagged image has no value here. `—` muted is what `/ps` already draws for a
 * container with no ports, so the two surfaces agree about what absent looks
 * like.
 */
const NONE = "<none>";
const named = (value: string): { text: string; tone?: Tone } =>
  value === NONE || value === "" ? { text: "—", tone: "muted" } : { text: value };

const IMAGE_COLUMNS: readonly ColumnDef[] = [
  b.col("repository", {
    label: "REPOSITORY",
    priority: 90,
    minWidth: 20,
    flex: true,
    truncateFrom: "start",
  }),
  b.col("tag", { label: "TAG", priority: 70, minWidth: 8, maxWidth: 20 }),
  b.col("id", { label: "ID", priority: 80, minWidth: 12, maxWidth: 12 }),
  // **Not `sortable`, and that is walk A8's ruling rather than an omission.**
  // Docker sends `3.37GB` and `92.8MB` already formatted, and sorting them is
  // what would force the parse the `Ports` rule forbids — a lexicographic sort
  // puts the megabyte first while looking like it worked.
  b.col("size", { label: "SIZE", priority: 60, minWidth: 8, maxWidth: 10 }),
  b.col("age", { label: "AGE", priority: 40, minWidth: 12, maxWidth: 16 }),
];

export function createImagesAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx): AdapterDocument {
      if (result.exitCode !== 0) return failureDoc(result, ctx, "images", failureOf(result));

      const { rows, skipped } = parseNdjson(result.stdoutRaw);
      // **The id is the row's identity**, not its position — and for a dangling
      // image it is the only identity there is, both name columns being `—`.
      const table = rows.map((raw, index) =>
        b.row(str(raw, "ID") || `image-${String(index)}`, {
          repository: named(str(raw, "Repository")),
          tag: named(str(raw, "Tag")),
          id: { text: str(raw, "ID"), tone: "identifier" },
          size: { text: str(raw, "Size") },
          age: { text: str(raw, "CreatedSince"), tone: "muted" },
        }),
      );

      const dangling = rows.filter((raw) => str(raw, "Repository") === NONE).length;
      const summary =
        `${String(rows.length)} image${rows.length === 1 ? "" : "s"}` +
        (dangling === 0 ? "" : ` · ${String(dangling)} untagged`) +
        (skipped === 0 ? "" : ` · ${String(skipped)} unreadable line${skipped === 1 ? "" : "s"}`);

      return okDoc(result, ctx, "images", [
        b.table({
          id: "images",
          columns: IMAGE_COLUMNS,
          rows: table,
          emptyMessage: "no images — try docker pull",
        }),
        ...(table.length === 0
          ? []
          : [b.notice("muted", summary, undefined, { gapBefore: true })]),
      ]);
    },
  };
}

// ── /top ────────────────────────────────────────────────────────────────────

/**
 * The columns are **read from the header row, never named here** (walk A6).
 *
 * `docker top` prints whatever `ps` inside the container printed, so a constant
 * eight is a claim about a `ps` implementation in somebody else's image. The
 * header is data.
 *
 * `CMD` is last and contains spaces, so the split takes at most `n - 1`
 * separators and the remainder is one cell. Measured on the devcontainer's PID
 * 1, whose command is a whole `sh -c` line with quotes in it.
 */
export function parseTop(raw: string): { columns: readonly ColumnDef[]; rows: readonly TableRow[] } {
  const lines = linesOf(raw);
  const headings = (lines[0] ?? "").trim().split(/\s+/u).filter(Boolean);
  if (headings.length === 0) return { columns: [], rows: [] };

  const keys = headings.map((_, i) => `c${String(i)}`);
  const body = lines.slice(1).map((line) => splitAtMost(line.trim(), headings.length));

  /**
   * **Each column asks its own content how wide it needs to be**, and the frame
   * is what forced that.
   *
   * A flat `minWidth: 4` on every column but the last renders `109…` for a PID
   * and `sta…` for a user, with eighty cells empty beyond the command — because
   * a non-flex column is allocated its `minWidth` and nothing more, and the one
   * flex column takes everything else. The columns are not known here (walk A6),
   * so their widths cannot be either: the app has the rows, so it measures them.
   *
   * `cells`, never `.length` — it is public for exactly this (C24 I14), and a
   * consumer measuring width its own way disagrees with the measurer silently.
   */
  const widest = (i: number): number =>
    body.reduce((n, parts) => Math.max(n, cells(parts[i] ?? "")), cells(headings[i] ?? ""));

  const last = headings.length - 1;
  const columns = headings.map((heading, i) =>
    b.col(keys[i] ?? `c${String(i)}`, {
      label: heading,
      // The command line takes the slack and keeps its head when the terminal
      // is narrow: a truncated tail still says which program this is.
      priority: i === last ? 90 : 50,
      minWidth: i === last ? 20 : Math.min(widest(i), 24),
      ...(i === last ? { flex: true } : {}),
    }),
  );

  const rows = body.map((parts, index) => {
    const row: Record<string, { text: string; tone?: Tone }> = {};
    keys.forEach((key, i) => {
      row[key] = { text: parts[i] ?? "" };
    });
    return b.row(`proc-${String(index)}`, row);
  });

  return { columns, rows };
}

/** `n` fields, the last one keeping every space it contains. */
export function splitAtMost(line: string, n: number): string[] {
  const out: string[] = [];
  let rest = line;
  while (out.length < n - 1) {
    const match = /\s+/u.exec(rest);
    if (match === null) break;
    out.push(rest.slice(0, match.index));
    rest = rest.slice(match.index + match[0].length);
  }
  out.push(rest);
  return out;
}

export function createTopAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx): AdapterDocument {
      // **A stopped container is an error here and an empty list nowhere.**
      // `docker top` on one exits 1 with *"container … is not running"*, which
      // is the honest thing to show — the reader asked what is running inside
      // something that is not.
      if (result.exitCode !== 0) return failureDoc(result, ctx, "top", failureOf(result));

      const { columns, rows } = parseTop(result.stdoutRaw);
      if (columns.length === 0) {
        return failureDoc(result, ctx, "top", "docker top returned nothing that could be read");
      }

      return okDoc(result, ctx, "top", [
        b.table({
          id: "processes",
          columns,
          rows,
          emptyMessage: "no processes — the container is running nothing",
        }),
        ...(rows.length === 0
          ? []
          : [
              b.notice(
                "muted",
                `${String(rows.length)} process${rows.length === 1 ? "" : "es"}`,
                undefined,
                { gapBefore: true },
              ),
            ]),
      ]);
    },
  };
}

// ── /port ───────────────────────────────────────────────────────────────────

/** `80/tcp -> 0.0.0.0:8080` — the arrow is docker's, and it is ASCII. */
export function portRow(line: string): KeyValueRow | null {
  const at = line.indexOf(" -> ");
  if (at === -1) return null;
  const container = line.slice(0, at).trim();
  const published = line.slice(at + 4).trim();
  if (container === "" || published === "") return null;
  return { label: container, value: { text: published, tone: "identifier" } };
}

export function createPortAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx): AdapterDocument {
      if (result.exitCode !== 0) return failureDoc(result, ctx, "port", failureOf(result));

      const rows = linesOf(result.stdoutRaw)
        .map(portRow)
        .filter((r): r is KeyValueRow => r !== null);

      // **The empty rendering is ambiguous between two successful worlds, and it
      // says so** (walk A4). Measured:
      //
      //   publishing nothing        (empty)  exit 0
      //   stopped, published 8080   (empty)  exit 0
      //
      // Every previous instance of the empty-block class was *empty* against
      // *failed*. This one is two containers that are both fine, and one call
      // cannot tell them apart — `docker inspect` can, and it is a different
      // verb. Saying only "no published ports" is a claim about the container's
      // configuration that this verb has not established, and it is false for
      // exactly the container a reader is most likely asking about.
      if (rows.length === 0) {
        return okDoc(result, ctx, "port", [
          b.notice("muted", "no published ports — a stopped container reports none either"),
        ]);
      }

      // **`b.kv`'s array arm, which is C24 I18 and exists because of this
      // verb.** A published port has one binding per address family, so `80/tcp`
      // appears twice for `-p 8080:80` — once for `0.0.0.0` and once for `[::]`
      // — and a record keeps one of them.
      return okDoc(result, ctx, "port", [b.kv(rows, { id: "ports" })]);
    },
  };
}
