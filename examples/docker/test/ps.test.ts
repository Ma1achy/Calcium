/**
 * The `/ps` adapter. Every test names the walk row or the R01 row it holds.
 *
 * The corpus (`corpus/ps-real.ndjson`) is **real output from a real daemon**, not
 * a hand-written fixture, and that is deliberate: F4 is the finding that a
 * hand-drawn frame encoded assumptions docker does not satisfy, and a
 * hand-written fixture would encode exactly the same ones.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cells } from "@fmx/calcium";
import type { RawResult, Table, TableRow } from "@fmx/calcium";
import { COLUMNS, createPsAdapter, parseNdjson, stateOf } from "../src/ps.ts";

const CORPUS = readFileSync(new URL("./corpus/ps-real.ndjson", import.meta.url), "utf8");

const result = (over: Partial<RawResult> = {}): RawResult => ({
  argv: ["docker", "ps", "--format", "json"],
  exitCode: 0,
  signal: null,
  // **`undefined`, and this is the point of walk A1.** C06 calls `JSON.parse`
  // on the whole of stdout; concatenated objects are not a JSON document, so
  // this is what the adapter really receives for every successful invocation.
  stdout: undefined,
  stdoutRaw: CORPUS,
  stderr: "",
  durationMs: 12,
  parseError: "Unexpected non-whitespace character after JSON at position 1",
  cancelled: false,
  timedOut: false,
  overflowed: false,
  ...over,
});

const ctx = {
  command: "/ps",
  verb: "ps",
  width: 120,
  userRequestedJson: false,
  transport: "subprocess",
  origin: "user",
  tool: null,
} as const;

const adapt = (over: Partial<RawResult> = {}) => createPsAdapter().adapt(result(over), ctx);
const tableOf = (doc: ReturnType<typeof adapt>): Table =>
  doc.blocks.find((bl) => bl.kind === "table") as Table;
const cellText = (row: TableRow, key: string): string => row.cells[key]?.text ?? "";

describe("walk A: the transport boundary", () => {
  it("A1: a set parseError with retained stdoutRaw is the normal case, not a failure", () => {
    const doc = adapt();
    // The ruling this holds: `parseError` says nothing about success for this far
    // side. Reading it as failure would make every single invocation an error.
    expect(doc.status).toBe("ok");
    expect(tableOf(doc).rows.length).toBeGreaterThan(0);
  });

  it("A2 (R3.5): one malformed line degrades and the rest render", () => {
    const lines = CORPUS.trimEnd().split("\n");
    const damaged = [lines[0], "{not json at all", ...lines.slice(1)].join("\n");
    const doc = adapt({ stdoutRaw: damaged });

    expect(tableOf(doc).rows).toHaveLength(lines.length);
    // Counted, not silently dropped — a skipped line and no line are otherwise
    // indistinguishable in the frame.
    const summary = doc.blocks.find((bl) => bl.kind === "notice");
    expect(summary && "text" in summary ? summary.text : "").toContain("1 unreadable line");
  });

  it("A2b: a whole batch of garbage yields an empty table, not a throw", () => {
    const doc = adapt({ stdoutRaw: "nonsense\nmore nonsense\n" });
    expect(tableOf(doc).rows).toHaveLength(0);
    expect(doc.status).toBe("ok");
  });

  it("A3 (R3.6): a non-zero exit is an error document carrying stderr", () => {
    const doc = adapt({ exitCode: 125, stdoutRaw: "", stderr: "unknown flag: --nope\n" });
    expect(doc.status).toBe("error");
    expect(doc.blocks.some((bl) => bl.kind === "table")).toBe(false);
    const notice = doc.blocks[0];
    expect(notice && "text" in notice ? notice.text : "").toContain("unknown flag");
  });

  it("A3b: a non-zero exit with empty stderr still names what happened", () => {
    const doc = adapt({ exitCode: 127, stdoutRaw: "", stderr: "" });
    const notice = doc.blocks[0];
    expect(notice && "text" in notice ? notice.text : "").toContain("127");
  });
});

describe("walk C: the cells", () => {
  it("C1 (R1.2, R5.1): the glyph comes from State even when Status contradicts it", () => {
    // The row where using the wrong field produces a table that looks right: the
    // prose says "Up 2 minutes" and the container is cycling.
    const line = JSON.stringify({
      ID: "abc",
      Names: "flapping",
      Image: "x:1",
      State: "restarting",
      Status: "Up 2 minutes",
      Ports: "",
    });
    const row = tableOf(adapt({ stdoutRaw: line })).rows[0];
    expect(row?.cells.status?.glyph).toBe("warn");
    expect(row?.cells.status?.tone).toBe("warn");
    // And the text is still the prose, verbatim.
    expect(cellText(row!, "status")).toBe("Up 2 minutes");
  });

  it("C1b: every state maps to a slot in the vocabulary, and unknown is its own", () => {
    expect(stateOf("running")).toEqual({ glyph: "running", tone: "ok" });
    expect(stateOf("exited")).toEqual({ glyph: "error", tone: "error" });
    // F6: `paused` is `pending`, because R01's `▪` is not a slot.
    expect(stateOf("paused")).toEqual({ glyph: "pending", tone: "warn" });
    // An unknown state must not render identically to `created` — a real state
    // wearing an unknown one's mark is worse than an unknown one looking odd.
    expect(stateOf("hibernating")).not.toEqual(stateOf("created"));
  });

  it("C3 (R1.3): comma-joined Names take the first, and keep all of them in detail", () => {
    const line = JSON.stringify({
      ID: "d1",
      Names: "web,web-alias,legacy-web",
      Image: "nginx:alpine",
      State: "running",
      Status: "Up 1 hour",
      Ports: "",
    });
    const row = tableOf(adapt({ stdoutRaw: line })).rows[0];
    expect(cellText(row!, "name")).toBe("web");
    expect(row?.detail).toBeDefined();
    expect(JSON.stringify(row?.detail)).toContain("legacy-web");
  });

  it("C4: a non-string field yields empty, never [object Object] and never a throw", () => {
    // `Platform` is an object in docker 29 and R01 §4 promised a string. The
    // failure this rules out is the coercion boundary meeting a shape it was not
    // written for and stringifying it.
    const line = JSON.stringify({
      ID: "p1",
      Names: "probe",
      Image: { registry: "ghcr.io" },
      State: "running",
      Status: "Up 1 hour",
      Platform: { architecture: "arm64", os: "linux" },
      Ports: "",
    });
    const row = tableOf(adapt({ stdoutRaw: line })).rows[0];
    expect(cellText(row!, "image")).toBe("");
    expect(JSON.stringify(row)).not.toContain("object Object");
  });

  it("C5 (R1.6, R3.1): zero containers names the flag that would widen it", () => {
    const doc = adapt({ stdoutRaw: "" });
    const table = tableOf(doc);
    expect(table.rows).toHaveLength(0);
    expect(table.emptyMessage).toContain("--all");
    // The header still renders: the columns are what the reader learns from.
    expect(table.columns).toHaveLength(4);
  });
});

describe("walk B: the columns", () => {
  it("B2 (R1.4, R5.2): Ports renders verbatim — no arrow, no condensing", () => {
    const row = tableOf(adapt()).rows.find((r) => cellText(r, "ports") !== "—");
    const ports = cellText(row!, "ports");
    expect(ports).toContain("->");
    // The two forms a parser would produce, neither of which may appear.
    expect(ports).not.toContain("→");
    expect(ports).not.toMatch(/^\d+→\d+/);
    // The bind address survives: 0.0.0.0 versus 127.0.0.1 is whether the port
    // faces the network, and a condenser decides in advance nobody needs it.
    expect(ports).toContain("0.0.0.0:");
  });

  it("B2b (R3.4): PORTS truncates from the end, keeping the host port", () => {
    const ports = COLUMNS.find((c) => c.key === "ports");
    expect(ports?.truncateFrom).toBe("end");
    // And the priority order S2 states: PORTS is the first to be refused.
    const byPriority = [...COLUMNS].sort((a, b) => b.priority - a.priority).map((c) => c.key);
    expect(byPriority).toEqual(["name", "status", "image", "ports"]);
  });

  it("B3: IMAGE truncates from the start, keeping the leaf and tag", () => {
    expect(COLUMNS.find((c) => c.key === "image")?.truncateFrom).toBe("start");
  });

  it("B1: STATUS's minWidth fits the longest status AND the glyph beside it", () => {
    // **This assertion used to be the defect restated.** It compared `minWidth`
    // against `cells(Status)` alone and passed at 22 — while every stopped
    // container rendered `✗ Exited (0) 2 days a…`, because walk C2 puts the
    // glyph *inside* this cell and walk B1 sized the column from the text. Two
    // correct rulings, and neither owns the gap between them.
    //
    // Found by reading the frame, which is the only thing that could have: the
    // numbers were self-consistent and describing a table that truncated.
    const GLYPH = cells("✗ "); // the mark and its separator, in cells
    const longest = Math.max(
      ...parseNdjson(CORPUS).rows.map((r) => cells(String(r["Status"] ?? ""))),
      cells("Exited (0) 5 weeks ago"),
    );
    const status = COLUMNS.find((c) => c.key === "status");
    expect(status?.minWidth, "the text alone").toBeGreaterThanOrEqual(longest);
    expect(status?.minWidth, "and the glyph").toBeGreaterThanOrEqual(longest + GLYPH);
  });

  it("B1b: NAME does not flex, or it eats the width PORTS needs", () => {
    // At width 120 with `flex: true`, NAME took 54 columns and PORTS truncated on
    // a terminal wide enough for it twice over. Container names are short; the
    // slack belongs to the column whose content is long.
    const name = COLUMNS.find((c) => c.key === "name");
    expect(name?.flex ?? false).toBe(false);
    expect(name?.maxWidth).toBeDefined();
    expect(COLUMNS.find((c) => c.key === "ports")?.flex).toBe(true);
  });

  it("B1d: a paused container is not counted as stopped", () => {
    // Found by the dashboard's walk A1, in shipped step-1 code. The summary was
    // `running` against `everything else`, so a real frame read
    // `4 running · 1 stopped` above a row saying `◌ Up 11 minutes (Paused)`.
    // Step 1 had no paused container to look at, and every test agreed with the
    // code.
    const lines = [
      { ID: "a", Names: "up", Image: "x", State: "running", Status: "Up 1 hour", Ports: "" },
      { ID: "b", Names: "held", Image: "x", State: "paused", Status: "Up 1 hour (Paused)", Ports: "" },
      { ID: "c", Names: "dead", Image: "x", State: "exited", Status: "Exited (0)", Ports: "" },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");
    const summary = adapt({ stdoutRaw: lines }).blocks.find((bl) => bl.kind === "notice");
    const text = summary && "text" in summary ? summary.text : "";
    expect(text).toBe("1 running · 1 paused · 1 stopped");
  });

  it("B1e: a state with none of its kind is left out rather than shown as zero", () => {
    // `0 paused` is noise on the overwhelmingly common frame, and the clause
    // only earns its width when there is something in it.
    const summary = adapt().blocks.find((bl) => bl.kind === "notice");
    const text = summary && "text" in summary ? summary.text : "";
    expect(text).not.toContain("0 ");
  });

  it("B1c: the summary reads as English, not as a pluralised template", () => {
    // `2 runnings · 0 stoppeds` shipped and every test passed: they asserted the
    // counts and the unreadable-line clause, and none of them read the sentence.
    const summary = adapt().blocks.find((bl) => bl.kind === "notice");
    const text = summary && "text" in summary ? summary.text : "";
    expect(text).toMatch(/^\d+ running · \d+ stopped/);
    expect(text).not.toContain("runnings");
    expect(text).not.toContain("stoppeds");
  });

  it("B4: an empty Ports is an em dash in the cell, not a dropped column", () => {
    const row = tableOf(adapt()).rows.find((r) => cellText(r, "ports") === "—");
    expect(row).toBeDefined();
    expect(row?.cells.ports?.tone).toBe("muted");
    // The column is still declared: dropping is about the terminal's width and
    // says nothing about the container.
    expect(COLUMNS.some((c) => c.key === "ports")).toBe(true);
  });
});

describe("F3: a value the far side already truncated", () => {
  // The row to assert hardest. Docker elides its own fields with U+2026, and
  // `cells()` measures that as ONE cell. Code that truncates again produces two
  // ellipses for one value — the class where a value belongs to the far side and
  // the code assumes it owns it.
  //
  // `ps` does not emit `Mounts`, so the value is synthetic and says so; what it
  // exercises — `cells()` against a real pre-elided string — is not.
  const PRE_ELIDED = "/host_mnt/User…";

  it("F3a: U+2026 measures as one cell, not three", () => {
    expect(cells("…")).toBe(1);
    expect(cells(PRE_ELIDED)).toBe(PRE_ELIDED.length);
  });

  it("F3b: a pre-elided value passes through the adapter with exactly one ellipsis", () => {
    const line = JSON.stringify({
      ID: "m1",
      Names: "mounted",
      Image: PRE_ELIDED,
      State: "running",
      Status: "Up 1 hour",
      Ports: "",
    });
    const image = cellText(tableOf(adapt({ stdoutRaw: line })).rows[0]!, "image");
    expect([...image].filter((ch) => ch === "…")).toHaveLength(1);
    expect(image).toBe(PRE_ELIDED);
  });

  it("F3c: the real corpus carries pre-elided values, so this is not hypothetical", () => {
    const raw = readFileSync(new URL("./corpus/ps-real.ndjson", import.meta.url), "utf8");
    expect(raw).toContain("…");
  });
});
