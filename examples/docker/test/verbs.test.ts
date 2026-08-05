/**
 * S10 and S11's four one-call verbs. Every test names the walk row it holds.
 *
 * The corpus is **real daemon output**, captured before anything was built:
 * `docker diff` on an nginx container, `docker top` on the devcontainer (whose
 * PID 1 is a whole `sh -c` line), `docker port` on `-p 8080:80 -p
 * 127.0.0.1:9090:443` — which is where `80/tcp` appears twice — and
 * `docker images -a`, which carries one untagged image.
 *
 * **What these rows cannot see**: they drive the adapters directly, not a shell.
 * That the shim strips `--json` for three of these four verbs is `shim.test.ts`'s
 * job, and that any of it reaches a screen is the frame-read's.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Block, KeyValue, Notice, Table } from "@fmx/calcium";
import {
  changeRow,
  createDiffAdapter,
  createImagesAdapter,
  createPortAdapter,
  createTopAdapter,
  diffSummary,
  parseTop,
  portRow,
  splitAtMost,
} from "../src/verbs.ts";

const read = (name: string): string =>
  readFileSync(new URL(`./corpus/${name}`, import.meta.url), "utf8");

const DIFF = read("diff-real.txt");
const TOP = read("top-real.txt");
const PORT = read("port-real.txt");
const IMAGES = read("images-real.ndjson");

/**
 * **These rows assert the block, and the screen is the frame-read's job.**
 *
 * `renderToLines` is not on the public surface (F37), and the app's other
 * suites do the same: what a `Table` row carries is a complete description of
 * what will be drawn, so painting it here would add a rendering to check
 * without adding a claim. VERIFYING.md's frame-reads are where the screen is
 * read, and they are where three of `/logs`' four findings came from.
 */
const textOf = (doc: { blocks: readonly Block[] }): string =>
  doc.blocks
    .map((blk) =>
      blk.kind === "notice" ? blk.text : blk.kind === "table" ? (blk.emptyMessage ?? "") : "",
    )
    .join(" ");

const result = (over: Partial<Record<string, unknown>> = {}): never =>
  ({
    exitCode: 0,
    stdoutRaw: "",
    stderr: "",
    argv: ["docker", "diff", "x"],
    durationMs: 1,
    ...over,
  }) as never;

const ctx = {
  command: "/x",
  verb: "x",
  transport: "subprocess",
  origin: "user",
  width: 120,
} as never;

const blockOf = <T extends Block>(doc: { blocks: readonly Block[] }, id: string): T => {
  // **Identity, not position.** Every one of these documents can gain a block
  // above or below without changing what is asserted here, and two dashboard
  // rows broke on exactly that when the banner landed.
  const found = doc.blocks.find((blk) => blk.id === id);
  if (found === undefined) throw new Error(`no block ${id} in ${doc.blocks.map((x) => x.id).join(", ")}`);
  return found as T;
};

// ── /diff ───────────────────────────────────────────────────────────────────

describe("/diff — the filesystem change list", () => {
  it("D1 (A10, F49): the marker carries the change and no tone claims severity", () => {
    // C04's Glyph union has thirteen slots and none of them means *added*, and
    // the type's own comment says a character outside the vocabulary goes in
    // the block's text.
    //
    // **The tones are not S10's, and the framework is what said so.** The
    // drawing asks for ok/error/warn; C04 I6 requires a glyph on error and warn,
    // so `b.row` threw. It was right: a deleted file is a fact about a
    // container, not a fault, and the marker already carries the distinction
    // without colour — which is what I6 exists to guarantee.
    const added = changeRow("A /tmp/cache", 0);
    const deleted = changeRow("D /etc/nginx/default.conf", 1);
    const modified = changeRow("C /var/log", 2);

    expect(added?.cells["path"]).toEqual({ text: "+ /tmp/cache", tone: "ok" });
    expect(deleted?.cells["path"]).toEqual({
      text: "- /etc/nginx/default.conf",
      tone: "muted",
    });
    expect(modified?.cells["path"]).toEqual({ text: "~ /var/log", tone: "accent" });
  });

  it("D1a (F49): the marker alone distinguishes the three, with no colour at all", () => {
    // The 1-bit reading, asserted rather than assumed: strip every tone and the
    // three rows are still three different things. This is the row that would
    // fail if someone restored S10's tones and dropped the markers as
    // redundant — which is exactly the shape the drawing invites.
    const marks = ["A /a", "D /b", "C /c"].map(
      (line, i) => changeRow(line, i)?.cells["path"]?.text.slice(0, 1),
    );
    expect(new Set(marks).size).toBe(3);
  });

  it("D2: a line that is not one of the three change types is not a row", () => {
    // The default arm is load-bearing rather than defensive: docker's output is
    // three letters today, and an unknown one must not become a row claiming to
    // be a modification.
    expect(changeRow("X /tmp", 0)).toBeNull();
    expect(changeRow("A", 0)).toBeNull();
    expect(changeRow("Anotaspace", 0)).toBeNull();
    expect(changeRow("", 0)).toBeNull();
  });

  it("D3 (A9): the summary counts verbatim, parents included", () => {
    // A directory shows as `C` because a child was added, so `modified` counts
    // a directory whose own content did not change. Pruning it would be this
    // app inventing a model docker does not have — and S10's drawing shows the
    // parent directly above its child, so the drawing was honest about it.
    expect(diffSummary(DIFF.split("\n").filter(Boolean))).toBe(
      "6 added · 4 modified · 0 deleted",
    );
  });

  it("D4: the words do not pluralise, and the frame is what says so", () => {
    const doc = createDiffAdapter().adapt(result({ stdoutRaw: "A /a\n" }), ctx);
    const notice = doc.blocks.find((blk) => blk.kind === "notice") as Notice;
    // "1 addeds" is what /ps shipped, past every test it had, because they
    // asserted the counts and never read the sentence.
    expect(notice.text).toBe("1 added · 0 modified · 0 deleted");
  });

  it("D5 (A3): no changes renders words, not an empty block", () => {
    // Measured against an `alpine sleep`: zero lines, exit 0 — indistinguishable
    // from a failed fetch unless the document says which. Fourth instance of the
    // empty-block class, after /drift, /config and /logs.
    const doc = createDiffAdapter().adapt(result({ stdoutRaw: "" }), ctx);
    expect(doc.status).toBe("ok");
    expect(textOf(doc)).toContain("no filesystem changes");
    // And no summary line, which would say "0 added · 0 modified · 0 deleted"
    // beneath a sentence that already said it.
    expect(doc.blocks.some((blk) => blk.kind === "notice")).toBe(false);
  });

  it("D6: a failed diff is an error document with its `error`", () => {
    const doc = createDiffAdapter().adapt(
      result({ exitCode: 1, stderr: "Error response from daemon: No such container: nope" }),
      ctx,
    );
    expect(doc.status).toBe("error");
    expect(doc.error?.message).toContain("No such container");
  });

  it("D7: the real corpus renders one row per line, in docker's order", () => {
    const doc = createDiffAdapter().adapt(result({ stdoutRaw: DIFF }), ctx);
    const table = blockOf<Table>(doc, "changes");
    expect(table.rows).toHaveLength(10);
    // Order is docker's, and it matters: the parent precedes the child, which
    // is what makes A9's `C /var/cache/nginx` readable rather than noise.
    // **The claim is structural, not positional.** The first version of this
    // row named `client_temp` at index 3 and docker's order is not stable
    // across runs — it came back `proxy_temp`. What is true every time is that
    // the parent `C` precedes the children that caused it, which is what makes
    // A9's redundant-looking `~ /var/cache/nginx` readable rather than noise.
    const paths = table.rows.map((r) => r.cells["path"]?.text ?? "");
    const parent = paths.indexOf("~ /var/cache/nginx");
    expect(parent).toBeGreaterThan(-1);
    expect(paths[parent + 1]).toMatch(/^\+ \/var\/cache\/nginx\//u);
  });
});

// ── /images ─────────────────────────────────────────────────────────────────

describe("/images — the table with docker's null in it", () => {
  it("M1 (A7): `<none>` renders as `—`, in both columns", () => {
    const doc = createImagesAdapter().adapt(result({ stdoutRaw: IMAGES }), ctx);
    const table = blockOf<Table>(doc, "images");
    const dangling = table.rows.filter((r) => r.cells["repository"]?.text === "—");
    expect(dangling.length).toBeGreaterThan(0);
    // Both columns, because a repository of `<none>` always carries a tag of
    // `<none>` and rendering one of them literally is the half-fix.
    expect(dangling[0]?.cells["tag"]).toEqual({ text: "—", tone: "muted" });
  });

  it("M2 (A7): a dangling image's identity is its ID, which is on the row", () => {
    const doc = createImagesAdapter().adapt(result({ stdoutRaw: IMAGES }), ctx);
    const table = blockOf<Table>(doc, "images");
    const dangling = table.rows.find((r) => r.cells["repository"]?.text === "—");
    expect(dangling?.cells["id"]?.text).toMatch(/^[0-9a-f]{12}$/u);
    // The row id too, so a patch addressing it does not depend on position.
    expect(dangling?.id).toBe(dangling?.cells["id"]?.text);
  });

  it("M3 (A8): SIZE is verbatim and not sortable", () => {
    const doc = createImagesAdapter().adapt(result({ stdoutRaw: IMAGES }), ctx);
    const table = blockOf<Table>(doc, "images");
    const size = table.columns.find((c) => c.key === "size");
    // Sorting is what would force the parse the `Ports` rule forbids: a
    // lexicographic order over `3.37GB` and `92.8MB` puts the megabyte first
    // while looking like it worked.
    expect(size?.sortable ?? false).toBe(false);
    expect(table.rows.map((r) => r.cells["size"]?.text)).toContain("92.8MB");
  });

  it("M4: the summary counts the untagged ones separately", () => {
    const doc = createImagesAdapter().adapt(result({ stdoutRaw: IMAGES }), ctx);
    const notice = doc.blocks.find((blk) => blk.kind === "notice") as Notice;
    expect(notice.text).toMatch(/^\d+ images · 1 untagged$/u);
  });

  it("M5: an unreadable line is counted, not dropped", () => {
    const doc = createImagesAdapter().adapt(
      result({ stdoutRaw: `${IMAGES.split("\n")[0] ?? ""}\n<html>\n` }),
      ctx,
    );
    const notice = doc.blocks.find((blk) => blk.kind === "notice") as Notice;
    expect(notice.text).toContain("1 unreadable line");
  });

  it("M6: a failed images is an error document", () => {
    const doc = createImagesAdapter().adapt(result({ exitCode: 1, stderr: "daemon down" }), ctx);
    expect(doc.status).toBe("error");
    expect(doc.error?.message).toBe("daemon down");
  });
});

// ── /top ────────────────────────────────────────────────────────────────────

describe("/top — the columns are data", () => {
  it("T1 (A6): the headings come from the output, never from a constant", () => {
    const { columns } = parseTop(TOP);
    expect(columns.map((c) => c.label)).toEqual([
      "UID",
      "PID",
      "PPID",
      "C",
      "STIME",
      "TTY",
      "TIME",
      "CMD",
    ]);

    // And a different `ps` gives different columns, which is the point: a
    // hard-coded eight is a claim about somebody else's image.
    const other = parseTop("PID USER COMMAND\n1 root /bin/sh\n");
    expect(other.columns.map((c) => c.label)).toEqual(["PID", "USER", "COMMAND"]);
    expect(other.rows[0]?.cells["c2"]?.text).toBe("/bin/sh");
  });

  it("T2 (A6): the last column keeps its spaces", () => {
    // The devcontainer's PID 1 is a whole `sh -c` line with quotes in it. Split
    // on every space it becomes nine columns of nonsense; split `n - 1` times
    // it is one cell.
    const { rows } = parseTop(TOP);
    const cmd = rows[0]?.cells["c7"]?.text ?? "";
    expect(cmd).toContain("/bin/sh -c echo Container started");
    expect(cmd.split(" ").length).toBeGreaterThan(5);
  });

  it("T3: splitAtMost never loses a field and never invents one", () => {
    expect(splitAtMost("a b c d", 3)).toEqual(["a", "b", "c d"]);
    expect(splitAtMost("a b", 4)).toEqual(["a", "b"]);
    expect(splitAtMost("solo", 1)).toEqual(["solo"]);
    // Runs of whitespace are one separator: `docker top` pads its columns with
    // many spaces, so splitting on a single one gives empty fields.
    expect(splitAtMost("a     b", 2)).toEqual(["a", "b"]);
  });

  it("T4: a stopped container is an error, not an empty process list", () => {
    // `docker top` exits 1 with "container … is not running", which is the
    // honest thing to show: the reader asked what is running inside something
    // that is not.
    const doc = createTopAdapter().adapt(
      result({ exitCode: 1, stderr: "Error response from daemon: container abc is not running" }),
      ctx,
    );
    expect(doc.status).toBe("error");
    expect(doc.error?.message).toContain("is not running");
  });

  it("T5: exit zero with nothing readable is still an error", () => {
    const doc = createTopAdapter().adapt(result({ stdoutRaw: "\n" }), ctx);
    expect(doc.status).toBe("error");
  });

  it("T7 (F50): each column is at least as wide as its own widest cell", () => {
    // **This row exists because a mutation failed nothing.** Flattening every
    // non-command column to `minWidth: 4` left all twenty-four rows green, and
    // the frame showed `109…` for a PID and `sta…` for a user with eighty cells
    // empty beyond the command. A non-flex column is allocated its `minWidth`
    // and nothing more, so a width that ignores the content is a truncation
    // nothing can see from the block.
    const { columns, rows } = parseTop(TOP);
    columns.slice(0, -1).forEach((col, i) => {
      const widest = Math.max(
        ...rows.map((r) => (r.cells[`c${String(i)}`]?.text ?? "").length),
        (col.label ?? "").length,
      );
      expect(col.minWidth, `${col.label ?? "?"} truncates its own content`).toBeGreaterThanOrEqual(
        Math.min(widest, 24),
      );
    });
  });

  it("T6: the real corpus renders every process", () => {
    const doc = createTopAdapter().adapt(result({ stdoutRaw: TOP }), ctx);
    const table = blockOf<Table>(doc, "processes");
    expect(table.rows).toHaveLength(TOP.split("\n").filter(Boolean).length - 1);
    expect(table.columns[0]?.label).toBe("UID");
  });
});

// ── /port ───────────────────────────────────────────────────────────────────

describe("/port — the verb b.kv's array arm exists for", () => {
  it("P1 (A5, C22 I18): one container port with two bindings gives two rows", () => {
    // The reason C24 I18 was written. A record keeps one of them, silently, and
    // the frame then shows a container publishing on IPv6 only.
    const doc = createPortAdapter().adapt(result({ stdoutRaw: PORT }), ctx);
    const kv = blockOf<KeyValue>(doc, "ports");

    expect(kv.rows).toHaveLength(3);
    expect(kv.rows[0]).toEqual({ label: "80/tcp", value: "0.0.0.0:8080", tone: "identifier" });
    expect(kv.rows[1]).toEqual({ label: "80/tcp", value: "[::]:8080", tone: "identifier" });
    expect(kv.rows.filter((r) => r.label === "80/tcp")).toHaveLength(2);
  });

  it("P2 (A4): empty names both worlds, because one call cannot tell them apart", () => {
    // Measured: a container publishing nothing and a stopped container that
    // published 8080 both print nothing and exit 0. Every previous instance of
    // the empty-block class was empty against failed; this is two containers
    // that are both fine.
    const doc = createPortAdapter().adapt(result({ stdoutRaw: "" }), ctx);
    expect(doc.status).toBe("ok");
    expect(textOf(doc)).toContain("no published ports");
    expect(textOf(doc)).toContain("stopped container reports none either");
  });

  it("P3: a line without docker's arrow is not a mapping", () => {
    expect(portRow("80/tcp 0.0.0.0:8080")).toBeNull();
    expect(portRow("-> 0.0.0.0:8080")).toBeNull();
    expect(portRow("80/tcp -> ")).toBeNull();
    expect(portRow("80/tcp -> [::]:8080")).toEqual({
      label: "80/tcp",
      value: { text: "[::]:8080", tone: "identifier" },
    });
  });

  it("P4: a failed port is an error document", () => {
    const doc = createPortAdapter().adapt(
      result({ exitCode: 1, stderr: "No such container: nope" }),
      ctx,
    );
    expect(doc.status).toBe("error");
  });
});
