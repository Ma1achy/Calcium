// C09 tier 1 — the registry's state machine, and each kind's documented height.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLowlight } from "lowlight";
import type { LanguageFn } from "highlight.js";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/** The default set again, for the reference tokeniser (T1.45). */
const GRAMMARS = { bash, css, diff, dockerfile, go, ini, java, javascript, json, markdown, python, rust, sql, typescript, xml, yaml };
import { displayCells } from "../../src/presentation/text.js";
import { NO_PROBE, block, validateBlock } from "../../src/data/viewmodel/index.js";
import type { Block, Group, MeasureFn, Probe } from "../../src/data/viewmodel/index.js";
import { groupDefinition } from "../../src/presentation/blocks/kinds/containers.js";
import {
  createBlockRegistry,
  GLYPH_TOKENS,
  spinnerFrames,
  DEFAULT_DEFINITIONS,
  DEFAULT_LANGUAGES,
  registerGrammar,
  tokenise,
  UNSLOTTED,
} from "../../src/presentation/blocks/index.js";
import { SLOTS, type Token } from "../../src/presentation/blocks/kinds/code.js";
import type { RenderContextInput } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, LOUD, MONO_CAPS, measurable, visible } from "../support/render.js";
import { RenderScratchStore } from "../../src/shell/render-scratch.js";
import { rows as inkRows } from "../../src/presentation/blocks/paint.js";
import type { BlockDefinition } from "../../src/presentation/blocks/types.js";
import { cells } from "../../src/presentation/text.js";

/** One sample per default grammar, ASCII throughout (T3.32, T1.45). */
const SAMPLES: Readonly<Record<string, string>> = {
  bash: 'for f in *.ts; do echo "$f"; done # c',
  css: ".a { color: #fff; } /* c */",
  diff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n",
  dockerfile: "FROM node:22\nRUN npm ci\n",
  go: 'func main() { fmt.Println("hi") } // c',
  ini: "[s]\nk = v ; c\n",
  java: "public class A { public static void main(String[] a) {} }",
  javascript: "async function f(a) { return await g(a); } // c",
  json: '{"a": 1, "b": [true, null]}',
  markdown: "# h\n\n`code` and text\n",
  python: "def f(x):\n    return [i for i in range(x)]  # c",
  rust: "fn main() { let v: Vec<u8> = vec![1]; } // c",
  sql: "SELECT id FROM t WHERE x > 1; -- c",
  typescript: "export const f = (x: number): string => `n`; // c",
  xml: '<a href="x">t</a><!-- c -->',
  yaml: "a: 1\nb:\n  - x\n",
};

describe("C09 §6 — the registry's transition table", () => {

  it("T3.31 (C09 I23): a grammar registers after the fact, and the memo does not outlive it", async () => {
    // **The memo is the subject, not the export.** `tokenise` caches the
    // *fallback* under `language\u0000text`, so a registration that does not
    // invalidate leaves every block already rendered as plain text — and every
    // assertion about `registerGrammar` existing still passes (F123).
    const text = "SELECT 1;";
    const before = tokenise(text, "madeuplang");
    expect(before, "unregistered falls back to one unslotted run").toEqual([
      { text, slot: null },
    ]);

    // The control the row needs: the fallback is now *in the memo* under this
    // key. Without it the assertion below could pass on a tokeniser that never
    // cached anything, which is a different implementation than the one here.
    expect(tokenise(text, "madeuplang"), "and it is cached").toBe(before);

    const sql = (await import("highlight.js/lib/languages/sql")).default;
    registerGrammar("madeuplang", sql);

    const after = tokenise(text, "madeuplang");
    expect(after.some((t) => t.slot !== null), "highlighted whenever someone registers it").toBe(
      true,
    );

    // **And nothing reflows** (I8) — the other half of I23, and the reason
    // registration is safe at any moment rather than only at composition.
    const rendered = (lang: string): number =>
      renderToLines(
        createBlockRegistry({ defaults: true }),
        block({ kind: "code", id: "code-r", language: lang, text }),
        40,
        { theme: DARK_THEME, capabilities: FULL_CAPS, focus: null, tick: 0 },
      ).length;
    expect(rendered("madeuplang")).toBe(rendered("json"));
  });

  it("T3.32 (C09 I24): every grammar in the default set colours something", () => {
    // **Over the set rather than per grammar**, because what this catches is a
    // grammar added later whose emitted classes nobody checked — and a per-
    // grammar row can only be written for the ones already known. `markdown`
    // is the row that failed before `SLOTS` was extended: four runs, none
    // slotted, which is indistinguishable from not shipping it (F123).

    // The set drives the samples, not the other way round: a grammar added with
    // no sample fails here rather than being silently uncovered.
    expect(Object.keys(SAMPLES).sort()).toEqual([...DEFAULT_LANGUAGES]);

    const dead = DEFAULT_LANGUAGES.filter(
      (lang) => !tokenise(SAMPLES[lang] ?? "", lang).some((t) => t.slot !== null),
    );
    expect(dead, "a grammar that colours nothing is a grammar not shipped").toEqual([]);

    // The deliberate omissions, with the bidirectional arm MG27 and SS47 have:
    // an entry that starts being mapped is a stale reason rather than a pass.
    for (const [cls, why] of Object.entries(UNSLOTTED)) {
      expect(why.length, `${cls} needs a reason`).toBeGreaterThan(20);
    }
    expect(
      Object.keys(UNSLOTTED),
      "the change axis is refused a slot on C04's ruling, not on judgement here",
    ).toContain("hljs-addition");
  });

  it("T2.x (C09, F85): a caller cannot supply the two fields the registry owns", () => {
    // **The narrowing, asserted where it has to hold: at compile time.**
    // `registry.render` overwrote `measureChild` and `renderChild` on every call
    // — `{ ...ctx, measureChild: this.measure, renderChild: … }` — while the type
    // demanded them, so the only way to satisfy it was to write something untrue.
    // `render-lines.ts` supplied a stub that **threw if called**, correct only
    // because the overwrite is unconditional, with a comment as the whole of the
    // guarantee.
    //
    // **The fix is narrower, not wider.** Optional fields would stay discarded;
    // absent ones make supplying them fail to compile rather than fail to matter.
    const ctx: RenderContextInput = {
      width: 40,
      theme: DARK_THEME,
      capabilities: FULL_CAPS,
      focus: null,
      tick: 0,
    };
    expect(ctx).not.toHaveProperty("renderChild");

    // @ts-expect-error — the registry owns `renderChild`; a caller supplying one
    // is what F85 is. Removing the `Omit` makes this line compile and the file
    // stops building, which is the assertion.
    const illegal: RenderContextInput = { ...ctx, renderChild: () => null as never };
    void illegal;
  });
  it("T1.1: register in the open state → get returns it, kinds includes it", () => {
    const registry = createBlockRegistry({});
    registry.register({
      kind: "custom",
      measure: () => 3,
      render: () => {
        throw new Error("this test asserts registration, never rendering");
      },
    });

    expect(registry.get("custom")?.kind).toBe("custom");
    expect(registry.kinds).toContain("custom");
    expect(registry.sealed).toBe(false);
  });

  it("T1.2: seal → sealed is true, and existing kinds still resolve", () => {
    const registry = createBlockRegistry({});
    registry.seal();

    expect(registry.sealed).toBe(true);
    expect(registry.get("logs")?.kind).toBe("logs");
  });

  it("T1.3: measure and render work after seal", () => {
    const registry = createBlockRegistry({});
    registry.seal();

    expect(registry.measure(ONE_PER_KIND.logs, 80)).toBe(2);
    expect(
      renderToLines(registry, ONE_PER_KIND.logs, 80, {
        theme: DARK_THEME,
        capabilities: FULL_CAPS,
      }),
    ).toHaveLength(2);
  });

  /**
   * §3's table, read from the document rather than restated.
   *
   * **This row's name claimed a source it did not read** (F1016). The
   * `documented` record below carried the comment *§3's table, read back as
   * assertions* and was compared to `DEFAULT_DEFINITIONS` — the test's own
   * literal against the registry, never against the table — so §3 could lose a
   * row and this row stayed green. It had lost two: `image`, a registered
   * default with no row at all, and `patch`, whose two peers `table` and `plot`
   * were both present. That is F228's sentence one level up: *a coverage set
   * drawn from the test's own table covers the table*, and the set had moved
   * from the cases to the record they are drawn from.
   */
  const SPEC = "docs/components/C09_block_library.md";

  /** The spelled-out numbers §3's heading can hold; an unknown word fails. */
  const NUMBER_WORDS: Readonly<Record<string, number>> = {
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    "twenty-one": 21,
    "twenty-two": 22,
    "twenty-three": 23,
    "twenty-four": 24,
    "twenty-five": 25,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
  };

  /** Kind → its `Measure` cell, in the order §3 lists them. */
  const specTable = (source: string): ReadonlyMap<string, string> => {
    const lines = source.split("\n");
    const header = lines.indexOf("| Kind | Measure | Notes on render |");
    // **A reader that finds nothing must say so.** An empty map satisfies no
    // equality below, but it would report the absence as nineteen missing
    // kinds rather than as a parser that stopped matching its own document.
    expect(header, `${SPEC} holds §3's table header`).toBeGreaterThan(-1);

    const rows = new Map<string, string>();
    for (const line of lines.slice(header + 2)) {
      if (!line.startsWith("|")) break;
      const cells = line.split("|");
      const kind = /^\s*`([A-Za-z]+)`\s*$/.exec(cells[1] ?? "")?.[1];
      expect(kind, `§3's first cell names a kind: ${line.slice(0, 48)}`).toBeDefined();
      rows.set(kind ?? "", (cells[2] ?? "").trim());
    }
    return rows;
  };

  it("T1.4 (§3): §3's table is read from the document — its rows are the registry plus the three delegated — and each registered kind measures its documented height", () => {
    const kit = measurable();
    const documented: Readonly<Record<string, number>> = {
      rule: 1, // a rule is one row at any width
      notice: 1, // ceil(cells / w), floored at 1
      keyValue: 2, // rows
      steps: 3, // steps
      logs: 2, // lines, never wrapped
      events: 1, // events
      progress: 1, // label, bar, percentage
      code: 2, // lines
      comparison: 2, // rows + header
      pills: 1, // one logical row
      tip: 1, // ceil(cells / w)
      panel: 4, // children + 2
      group: 1, // row: max of children
      scroll: 3, // height, plus a residue row where the content overflows
      mosaic: 4, // `height`, exactly — declared and never derived (C04 I71)
      image: 3, // `height`, clamped by the width — 8x8 at 3 rows needs 6 columns (C04 I73)
      status: 7, // the declared height — six is the figure, seven shows its line
      raw: 2, // lines
      terminal: 2, // lines, plus a row for the dropped count where one exists (C27 I7)
    };

    const source = readFileSync(SPEC, "utf8");
    const table = specTable(source);

    // The corpus, asserted before anything is asserted against it — a
    // fabricated violation that empties the reader proves nothing.
    expect(table.size, "§3's table has rows").toBeGreaterThan(15);

    const delegated = new Map<string, string>();
    const registered: string[] = [];
    for (const [kind, measure] of table) {
      const owner = /^delegated to (C\d\d)$/.exec(measure)?.[1];
      if (owner === undefined) registered.push(kind);
      else delegated.set(kind, owner);
    }

    // **The gate this row's name always claimed.** §3's non-delegated rows and
    // `DEFAULT_DEFINITIONS` name the same kinds, by equality in both
    // directions: a kind that joins the registry and never joins the table
    // fails here — `image` did, and nothing said so — and so does a row for a
    // kind the registry does not have.
    expect(
      registered.slice().sort(),
      "§3's non-delegated rows and DEFAULT_DEFINITIONS name the same kinds",
    ).toEqual(DEFAULT_DEFINITIONS.map((d) => d.kind).sort());

    // **The three that register from outside, with their owners.** `patch` had
    // no row while `table` and `plot` both did, so the table's own evidence for
    // the extension mechanism being real rather than privileged — *three
    // components using the same public `register`* — was two thirds of a trio
    // (C09 §3, C04 §3).
    expect(
      Object.fromEntries([...delegated].sort()),
      "§3's delegated rows name C11, C12 and C25",
    ).toEqual({ patch: "C25", plot: "C12", table: "C11" });

    // **§3's heading counts its own table, and the count is compared rather
    // than read.** A count in prose beside the list it counts is the one
    // artefact no gate compares (F1009); this is that gate, for one heading.
    // An unrecognised number word fails rather than being skipped.
    const heading =
      /^## 3\. The ([a-z-]+) kinds — ([a-z-]+) registered here, ([a-z-]+) delegated$/m.exec(source);
    expect(heading, "§3's heading is in the form its counts are read from").not.toBeNull();
    const asNumber = (word: string): number => {
      expect(NUMBER_WORDS[word], `"${word}" is a number word this row can read`).toBeDefined();
      return NUMBER_WORDS[word] ?? -1;
    };
    expect(
      [asNumber(heading?.[1] ?? ""), asNumber(heading?.[2] ?? ""), asNumber(heading?.[3] ?? "")],
      "§3's heading counts its own table: total, registered, delegated",
    ).toEqual([table.size, registered.length, delegated.size]);

    // **Compared to the registry by equality, and the guard below runs the other
    // way** (F228). *Every listed kind has a fixture* was added after a rename
    // left seven entries measuring against `undefined`; it says nothing about a
    // kind that joins the registry and never joins this list, and `scroll` did
    // exactly that — shipped in `DEFAULT_DEFINITIONS`, absent from §3's table and
    // from these cases, so the one kind with no documented height was the one
    // nothing asserted a height for. A coverage set drawn from the test's own
    // table covers the table.
    //
    // Equality rather than a subset, on `BUILDER_OMISSIONS`' precedent: a subset
    // lets a dead entry outlive its reason unread, and both directions are the
    // point here.
    expect(
      Object.keys(documented).sort(),
      "§3's table and DEFAULT_DEFINITIONS name the same kinds",
    ).toEqual(DEFAULT_DEFINITIONS.map((d) => d.kind).sort());

    // **The bridge from the table's prose to a measured number, and it reaches
    // two rows of nineteen** — stated because an unrecorded limit reads as
    // strength. A `Measure` cell that is a bare integer can be compared to the
    // height measured below; every other cell is a formula — `ceil(cells(text)
    // / w)`, `children + 2`, `` `height`, exactly `` — and nothing here
    // evaluates one against a fixture. So membership is watched in both
    // directions and a **wrong formula beside a right membership is not**.
    // The set is asserted by equality so that a row losing its integer, or a
    // formula collapsing to one, is a finding rather than a smaller loop.
    const literal = registered.filter((k) => /^\d+$/.test(table.get(k) ?? ""));
    expect(literal.slice().sort(), "the §3 rows whose measure is a bare integer").toEqual([
      "progress",
      "rule",
    ]);
    for (const kind of literal) {
      expect(
        Number(table.get(kind)),
        `§3 gives ${kind} the height this row measures`,
      ).toBe(documented[kind]);
    }

    for (const [kind, height] of Object.entries(documented)) {
      const fixture = ONE_PER_KIND[kind as "raw"];

      // **A missing fixture measures as 1, which seven of these entries
      // document.** The `comparison` rename found it: the key here went stale,
      // `ONE_PER_KIND["diff"]` became `undefined`, and `measure` answered 1
      // rather than raising — so `rule`, `notice`, `events`, `progress`,
      // `pills`, `tip` and `group` would each have passed against no fixture at
      // all. Only `comparison` failed, and only because its height is 2.
      expect(fixture, `${kind} has a fixture`).toBeDefined();
      expect(kit.measure(fixture, 80), `${kind} at width 80`).toBe(height);
    }
  });
});

describe("C09 §6 — kinds", () => {
  it("T1.5: the keyValue key column caps at 20 cells, and values still align", () => {
    const kit = measurable();
    const long = block({
      kind: "keyValue",
      id: "kv-long",
      rows: [
        { label: "a-key-far-longer-than-twenty-cells", value: "one" },
        { label: "short", value: "two" },
      ],
    });

    const [first, second] = kit.renderToLines(long, 80).map(visible);
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // The value column starts at the same cell in both rows — which is the
    // point of a capped column rather than a longest-key column.
    expect(first?.indexOf("one")).toBe(second?.indexOf("two"));
    expect(first?.indexOf("one")).toBe(22); // 20 cells of key, two of gap
  });

  /**
   * A `keyValue` row carrying a quantity — C04 I51.
   *
   * **Indexed by where the bar meets the remainder**, which is the only place
   * this differs from `Cell.bar`: a table column *is* a width and a `keyValue`
   * value is what the label leaves, so every row below is about that boundary
   * rather than about the run.
   */
  const withBar = (barWidth: number, value = "1.2GiB / 4GiB"): ReturnType<typeof block> =>
    block({
      kind: "keyValue",
      id: "kv-bar",
      rows: [{ label: "MEM", value, bar: { value: 45.2, max: 100, format: "percent" }, barWidth }],
    });

  it("T1.5a (C04 I51): the bar takes what it declared and the value takes the rest", () => {
    const kit = measurable();
    const [row] = kit.renderToLines(withBar(15), 80).map(visible);

    // **The finding this row exists for.** The value column here is 74 cells —
    // 80 less a five-cell key and two of gap — and a bar handed the remainder
    // draws a 68-cell run: right in every count, and a picture no surface
    // asked for. The declared width is what stops it.
    expect(row).toContain("45.2%");
    expect(row).toContain("1.2GiB / 4GiB");
    expect(row?.indexOf("1.2GiB")).toBeLessThan(30);
    expect(cells(row ?? ""), "the row is its own content, not the column").toBeLessThan(40);
  });

  it("T1.5b (C04 I51): the row is exactly its width, and the gap comes out of the detail", () => {
    const kit = measurable();
    for (const width of [80, 44, 34, 30]) {
      const [row] = kit.renderToLines(withBar(15), width).map(visible);
      // Added outside the remainder the gap would put the row one cell over,
      // and a row the terminal wraps adds a line no measurer counted (C09 I5).
      expect(cells(row ?? ""), `at width ${String(width)}`).toBeLessThanOrEqual(width);
    }
    expect(kit.measure(withBar(15), 30)).toBe(1);
  });

  it("T1.5c (C04 I51): with no room for a real detail the row is the bar", () => {
    const kit = measurable();
    // Read from the frame, not derived: the remainder came to exactly one cell
    // and the detail rendered as a lone `…` — a mark saying *there is more*
    // while showing none of it.
    //
    // **Both sides of the threshold, or the row is a restatement of the
    // constant.** At two cells a real character survives beside the mark and
    // the detail is worth drawing; at one there is only the mark.
    const [wide] = kit.renderToLines(withBar(15), 24).map(visible);
    expect(wide, "two cells of remainder carry a character").toContain("1…");

    const [narrow] = kit.renderToLines(withBar(15), 23).map(visible);
    expect(narrow).toContain("45.2%");
    expect(narrow, "an ellipsis alone is not a detail").not.toContain("…");
  });

  it("T1.5d (C04 I51): a bar wider than the column narrows rather than overflowing", () => {
    const kit = measurable();
    // Not a construction error — the same document is correct at a wider
    // terminal — so the width clamps here and the bar degrades through
    // `valueBar`'s own rungs.
    const [row] = kit.renderToLines(withBar(60), 30).map(visible);
    expect(cells(row ?? "")).toBeLessThanOrEqual(30);
    expect(row).toContain("45.2%");
  });

  it("T1.5e (C04 I51): the bar substitutes at ascii, because the framework draws it", () => {
    // The half F54 measured and could not fix from the app side: capability
    // substitution covers glyphs C09 picks, and an app-drawn run is adapter
    // text. Drawn here, it degrades.
    const [row] = measurable({ capabilities: ASCII_CAPS })
      .renderToLines(withBar(15), 80)
      .map(visible);
    expect(row).toContain("#");
    expect(row, "no block elements survive an ascii terminal").not.toContain("░");
  });

  it("T1.5f (C04 I51): a bar with no width is refused, and the renderer invents nothing", () => {
    // **Found as a mutation survivor**, not by reading: removing the renderer's
    // `barWidth === undefined` arm changed no frame, because every fixture
    // supplied both members. The state the row claims to cover was one nothing
    // constructed.
    //
    // The type cannot carry the pair — a narrower `bar` breaks every `b.kv`
    // taking a tone shorthand — so `validateBlock` is the gate, and the
    // renderer must not make the refused document render anyway. A default
    // here is how a gate stops being reached.
    const broken = {
      kind: "keyValue" as const,
      id: "kv-halfbar",
      rows: [{ label: "MEM", value: "1.2GiB / 4GiB", bar: { value: 45.2, max: 100 } }],
    };

    const verdict = validateBlock(broken);
    expect(verdict.ok, "a bar with no width is not a document").toBe(false);
    expect(verdict.ok ? [] : verdict.error).toContainEqual(expect.stringContaining("barWidth"));

    // **Asserted as a difference, because each frame alone is plausible.** The
    // first version checked that the row held its value and no run — and a
    // renderer that computed a `NaN` width satisfies both, drawing an empty run
    // and two spaces before the text. It survived the mutation. What separates
    // *ignored the bar* from *drew a bar of no cells* is only the comparison.
    const kit = measurable();
    const plain = { ...broken, rows: [{ label: "MEM", value: "1.2GiB / 4GiB" }] };
    const [row] = kit.renderToLines(broken as never, 80).map(visible);
    const [same] = kit.renderToLines(plain as never, 80).map(visible);

    expect(row, "an incomplete bar is no bar, cell for cell").toBe(same);
    expect(row).toContain("1.2GiB / 4GiB");
  });

  it("T1.6 (§3): a logs line longer than w is one row, ending in the marker", () => {
    const kit = measurable();
    const long = block({
      kind: "logs",
      id: "logs-long",
      lines: [{ ts: "12:00:01", level: "info", message: "x".repeat(500) }],
    });

    const lines = kit.renderToLines(long, 40);
    expect(lines, "never wrapped — predictable height is the point").toHaveLength(1);
    expect(visible(lines[0] ?? "").endsWith("…")).toBe(true);
    expect(kit.measure(long, 40)).toBe(1);
  });

  it("T1.6b (§3): code truncates by default and wraps when asked, both measured right", () => {
    const text = `${"y".repeat(200)}\nsecond`;
    const truncating = block({ kind: "code", id: "code-t", language: "yaml", text });
    const wrapping = block({ kind: "code", id: "code-w", language: "yaml", text, wrap: true });
    const kit = measurable();

    expect(kit.measure(truncating, 40), "two source lines, truncated").toBe(2);
    expect(kit.renderToLines(truncating, 40)).toHaveLength(2);

    expect(kit.measure(wrapping, 40), "200 cells over 40, plus one line").toBe(6);
    expect(kit.renderToLines(wrapping, 40)).toHaveLength(6);
  });

  it("T1.7: a notice longer than w wraps, and the measurement matches", () => {
    const kit = measurable();
    const notice = block({
      kind: "notice",
      id: "notice-long",
      tone: "info",
      text: "the resolver is not a walk, and the assignment had to be solved rather than walked",
    });

    for (const width of [20, 30, 40, 80]) {
      expect(kit.renderToLines(notice, width), `width ${width}`).toHaveLength(
        kit.measure(notice, width),
      );
    }
  });

  it("T1.7b: a notice's glyph comes out of the wrapping width, not out of nowhere", () => {
    // C04 §3's `ceil(len / w)` assumes the whole width is prose, and an `error`
    // notice always carries a glyph (C04 I6). Measuring at `w` while rendering
    // at `w - 2` is a row's difference at exactly the widths where it wraps.
    const kit = measurable();
    const text = "x".repeat(60);
    const bare = block({ kind: "notice", id: "n-bare", tone: "info", text });
    const glyphed = block({ kind: "notice", id: "n-glyph", tone: "error", glyph: "error", text });

    expect(kit.measure(bare, 30)).toBe(2);
    expect(kit.measure(glyphed, 30), "two fewer columns per row").toBe(3);
    expect(kit.renderToLines(glyphed, 30)).toHaveLength(3);
  });

  it("T1.8b (C04): a panel's footer is text in a row that is drawn anyway", () => {
    const kit = measurable();
    const children = [{ kind: "notice", id: "p-n", tone: "info", text: "hi" } as const];
    const plain = block({ kind: "panel", id: "p", title: "logs", children });
    const footed = block({ kind: "panel", id: "p", title: "logs", footer: "esc back", children });

    // **The height is the assertion.** A footer that added a row would be a new
    // row rather than a use of the existing one — and a panel whose measurer and
    // renderer disagree is what C09 reports as a border that does not close.
    expect(kit.measure(footed, 40)).toBe(kit.measure(plain, 40));
    expect(kit.renderToLines(footed, 40)).toHaveLength(kit.measure(footed, 40));

    const lines = kit.renderToLines(footed, 40);
    const bottom = lines.at(-1) ?? "";
    expect(bottom, "the text is in the bottom border").toContain("esc back");
    expect(displayCells(bottom), "and the border still closes at the width").toBe(40);

    // The control: without a footer the same rail is plain, so the assertion
    // above is about the field rather than about panels having a bottom row.
    expect(kit.renderToLines(plain, 40).at(-1) ?? "").not.toContain("esc back");
  });

  it("T1.8: panel measures its children at w - 2", () => {
    const kit = measurable();
    const text = "z".repeat(40);
    const panel = block({
      kind: "panel",
      id: "p",
      title: "Summary",
      children: [{ kind: "notice", id: "p-n", tone: "info", text }],
    });

    // At width 42 the child has 40 columns and fits on one row; at 41 it has 39
    // and takes two. A panel that passed `w` through would not move here.
    expect(kit.measure(panel, 42)).toBe(3);
    expect(kit.measure(panel, 41)).toBe(4);
    expect(kit.renderToLines(panel, 41)).toHaveLength(4);
  });

  it("T1.9: a column group sums its children; a row group takes the max", () => {
    const kit = measurable();
    const short = { kind: "raw", id: "g-a", text: "one" } as const;
    const tall = { kind: "raw", id: "g-b", text: "one\ntwo\nthree" } as const;

    const column = block({ kind: "group", id: "g-col", direction: "column", children: [short, tall] });
    const row = block({ kind: "group", id: "g-row", direction: "row", children: [short, tall] });

    expect(kit.measure(column, 80), "1 + 3").toBe(4);
    expect(kit.measure(row, 80), "max(1, 3)").toBe(3);
    expect(kit.renderToLines(column, 80)).toHaveLength(4);
    expect(kit.renderToLines(row, 80)).toHaveLength(3);
  });

  it("T1.9b (C28 I31): a column group measures each child once per `measure`, not twice", () => {
    // **The count, because no height can tell the two apart.** `measure` is pure
    // (I2), so measuring a child twice gives the same answer twice — every
    // assertion in T1.9 above passes either way, and the profiler's
    // calls-per-frame column is what separated them (C28 I31).
    //
    // What it was: `childHeights` measured every placed child, the column branch
    // used the result only for its `.length`, and `sequenceHeight` then measured
    // them all again. A `.map`'s length is its input's, so `placed.length`
    // answers the same question for nothing.
    //
    // The definition is called directly rather than through the registry, so the
    // count is this container's own and not the sum of a dispatch chain.
    const calls: string[] = [];
    const counting: MeasureFn = (child, _width) => {
      calls.push(child.id);
      return 1;
    };
    const kids = [
      { kind: "raw", id: "c-a", text: "one" },
      { kind: "raw", id: "c-b", text: "two" },
      { kind: "raw", id: "c-c", text: "three" },
    ] as const;

    const column = block({ kind: "group", id: "g-c", direction: "column", children: [...kids] });
    expect(groupDefinition.measure(column as Group, 80, counting), "1 + 1 + 1").toBe(3);
    expect(calls, "each child measured once").toEqual(["c-a", "c-b", "c-c"]);

    // The row branch reads the heights, so it measures once and this is the arm
    // that says the fix moved the call rather than deleting it.
    calls.length = 0;
    const row = block({ kind: "group", id: "g-r", direction: "row", children: [...kids] });
    expect(groupDefinition.measure(row as Group, 80, counting), "max(1, 1, 1)").toBe(1);
    expect(calls, "each child measured once here too").toEqual(["c-a", "c-b", "c-c"]);

    // And the empty case still measures nothing at all, which is the branch the
    // `.length` question was being asked for.
    calls.length = 0;
    const empty = block({ kind: "group", id: "g-e", direction: "column", children: [] });
    expect(groupDefinition.measure(empty as Group, 80, counting)).toBe(0);
    expect(calls, "an empty container measures no children").toEqual([]);
  });

  it("T1.44 (I70): a column group measured twice through one caller-owned memo measures each child once across both calls, the answers equal the memo-less answers, and another width and a rebuilt child miss through", () => {
    const kit = measurable();
    // **The registry's own probe, so the row reads hits and misses where the
    // profiler does** (C28 I31) — a count taken from a wrapper round `measure`
    // would miss the hit path by construction, because a hit never reaches it.
    const events: string[] = [];
    const probe: Probe = {
      ...NO_PROBE,
      hit: (cache) => void events.push(`hit:${cache}`),
      miss: (cache, reason) => void events.push(`miss:${cache}:${reason}`),
      on: true,
    };
    (kit.registry as unknown as { probe: Probe }).probe = probe;
    const measures = (): readonly string[] => events.filter((e) => e.includes(":measure"));

    const kids = Array.from({ length: 12 }, (_, i) => ({
      kind: "raw" as const,
      id: `m-${String(i)}`,
      text: `line ${String(i)}\nand another`,
    }));
    const column = block({ kind: "group", id: "g-memo", direction: "column", children: [...kids] });

    // The memo-less answers first: the claim is equality with them — the rows,
    // and the pattern of asks. A column group asks each child twice in one call
    // and the per-call memo answers the second ask, so a fresh call reads as
    // twelve misses then twelve hits; that pattern is the baseline, not a
    // number this row invents.
    const plain80 = kit.registry.measure(column, 80);
    const fresh = measures();
    expect(fresh.slice(0, kids.length), "a fresh call: every child absent first").toEqual(
      kids.map(() => "miss:measure:absent"),
    );
    expect(fresh.filter((e) => e.startsWith("miss")), "and absent once each").toHaveLength(kids.length);
    const plain40 = kit.registry.measure(column, 40);

    const memo = new WeakMap<Block, Readonly<{ width: number; rows: number }>>();
    events.length = 0;
    expect(kit.registry.measure(column, 80, memo), "the first call answers as without a memo").toBe(plain80);
    expect(measures(), "and asks exactly as a fresh call does").toEqual(fresh);

    events.length = 0;
    expect(kit.registry.measure(column, 80, memo), "the second call answers the same").toBe(plain80);
    expect(measures(), "and asked nothing: the group itself is held, so no child is reached").toEqual([]);

    // **Across members** (I70): `measureSequence` through the same memo reads
    // the answers `measure` wrote, which is what lets C14's measurer and the
    // session's window share one (C22 I100).
    events.length = 0;
    expect(kit.registry.measureSequence(kids as never, 80, memo)).toBe(plain80);
    expect(measures(), "the sequence read every child back: every ask a hit, no miss").toEqual(
      kids.map(() => "hit:measure"),
    );
    const asWidth = fresh.map((e) => e.replace("absent", "width"));

    // A rebuilt child — the same content as a new object — is a new question.
    const rebuilt = block({
      kind: "group",
      id: "g-memo",
      direction: "column",
      children: kids.map((k) => ({ ...k })),
    });
    events.length = 0;
    expect(kit.registry.measure(rebuilt, 80, memo)).toBe(plain80);
    expect(measures(), "identity, never content").toEqual(fresh);

    // Another width misses through with the width's reason, and answers right.
    events.length = 0;
    expect(kit.registry.measure(column, 40, memo)).toBe(plain40);
    expect(measures(), "held for one width").toEqual(asWidth);

    // **The registry holds no reference**: a call without the memo is a call
    // with a fresh one, whatever the caller's still holds.
    events.length = 0;
    expect(kit.registry.measure(column, 40)).toBe(plain40);
    expect(measures(), "afresh").toEqual(fresh);
  });

  it("T1.10 (I10): an unknown kind renders through raw and never throws", () => {
    const kit = measurable();
    const foreign = { kind: "sparkline-3000", id: "x-1", values: [1, 2, 3] } as unknown as never;

    expect(() => kit.measure(foreign, 80)).not.toThrow();
    expect(kit.renderToLines(foreign, 80)).toHaveLength(kit.measure(foreign, 80));
    expect(
      visible(kit.renderToLines(foreign, 80)[0] ?? ""),
      "the content is visible, degraded rather than hidden",
    ).toContain("sparkline-3000");
  });

  it("T1.11 (I18): an injected escape sequence is stripped, not passed through", () => {
    const kit = measurable();
    const attack = `${String.fromCharCode(27)}[31mred`;
    const notice = block({ kind: "notice", id: "n-attack", tone: "info", text: attack });

    const line = kit.renderToLines(notice, 80)[0] ?? "";
    // The rendered row carries C10's styling and not the block's: the injected
    // sequence is gone, and the literal text that followed it remains.
    expect(visible(line)).toContain("[31mred");
    expect(cells(visible(line))).toBe(cells("[31mred"));
  });

  it("T1.12 (§2): steps show a spinner while active and a settled glyph after", () => {
    const steps = block({
      kind: "steps",
      id: "s",
      steps: [
        { label: "one", state: "done" },
        { label: "two", state: "active" },
        { label: "three", state: "failed" },
        { label: "four", state: "pending" },
      ],
    });

    const first = measurable({ tick: 0 }).renderToLines(steps, 40).map(visible);
    const later = measurable({ tick: 3 }).renderToLines(steps, 40).map(visible);

    expect(first[0]?.startsWith("✓")).toBe(true);
    expect(first[2]?.startsWith("✗")).toBe(true);
    expect(first[3]?.startsWith("◌")).toBe(true);

    // The spinner frame changes with the tick; the settled rows do not.
    expect(later[1]).not.toBe(first[1]);
    expect(later[0]).toBe(first[0]);
    expect(later, "and the height never changes").toHaveLength(first.length);
  });

  it("T1.4b (C04 §2): a comparison's columns are labelled `a` and `b`, never directional", () => {
    // **The ruling the rename carried, and nothing covered it.** The type has
    // said `a`/`b` since C04 and the renderer's header said `before`/`after` —
    // directional names for a kind whose primary consumer, S07, compares two
    // *runs*. There is no before-and-after there, and a label that is wrong for
    // half a kind's consumers invites an adapter to swap the fields to make the
    // naming true.
    //
    // Asserted on the rendered header rather than on the type, because the type
    // was already right; the two disagreed, and only the screen showed it.
    const kit = measurable();
    const header = visible(kit.renderToLines(ONE_PER_KIND.comparison, 60)[0] ?? "");

    expect(header, "positional labels").toMatch(/\ba\b/);
    expect(header, "both of them").toMatch(/\bb\b/);
    expect(header, "and not directional ones").not.toContain("before");
    expect(header, "either of them").not.toContain("after");
  });

  it("T1.4c (C04 I35, C04 I36): the change axis is a marker, and it survives one bit", () => {
    // **The ruling's whole content, asserted where it is decidable.** C04 I35 says a
    // categorical axis is carried by a marker and only *emphasised* by a tone.
    // The check that it holds is not that the marker is drawn — it is that
    // nothing is lost when the colour goes, so both depths are rendered and the
    // markers compared.
    //
    // Read off a frame rather than off `CHANGE_MARKERS`, because a test that
    // reads the renderer's own table agrees with it by construction.
    const changed = block({
      kind: "comparison",
      id: "c",
      rows: [
        { field: "image", a: "nginx:1.2", b: "nginx:1.3", change: "changed" },
        { field: "env.NEW", a: "", b: "on", change: "added" },
        { field: "env.OLD", a: "off", b: "", change: "removed" },
        { field: "ports", a: "80", b: "80", change: "unchanged" },
      ],
    });

    const full = measurable().renderToLines(changed, 56).map(visible);
    const mono = measurable({ capabilities: MONO_CAPS }).renderToLines(changed, 56).map(visible);

    // Right-trimmed on both sides: at one bit a run of trailing spaces carries
    // no background and is dropped, which is a difference about padding rather
    // than about meaning. Comparing raw made this row fail for the one reason
    // it is not testing.
    expect(mono.map((l) => l.trimEnd()), "the axis is not carried by colour").toEqual(
      full.map((l) => l.trimEnd()),
    );
    expect(full[1]?.startsWith("~"), "changed").toBe(true);
    expect(full[2]?.startsWith("+"), "added — the member F30 had nowhere to put").toBe(true);
    expect(full[3]?.startsWith("-"), "removed").toBe(true);
    expect(full[4]?.startsWith(" "), "unchanged is blank, not a fourth mark").toBe(true);
  });

  it("T1.4e (C04 I35, F51): an event's tone reaches the paint, and the word survives without it", () => {
    // **Added because the mutation pass found nothing to kill.** Removing
    // `event.tone ?? ` from the renderer left 33 rows green: the field was in
    // the type, the builder and the D29 sweep, and no row asserted that
    // anything painted it. A checker that inspects a document agrees with the
    // document, not with the screen.
    const events = (tone?: "error") =>
      block({
        kind: "events",
        id: "e",
        events: [{ ts: "12:00:01", type: "die", message: "exit 137", ...(tone ? { tone } : {}) }],
      });

    const kit = measurable();
    const toned = kit.renderToLines(events("error"), 60);
    const plain = kit.renderToLines(events(), 60);

    // Raw, not `visible` — the difference under test is the escape sequence.
    expect(toned, "the tone changes what is emitted").not.toEqual(plain);
    expect(toned.map(visible), "and changes nothing about the text").toEqual(plain.map(visible));

    // D29's half: the type word is on screen either way, so the colour
    // emphasises rather than carries (C04 I35).
    expect(visible(toned[0] ?? "")).toContain("die");
  });

  it("T1.4f (C04 I38): the verdict's mark is derived, and it is what survives ASCII", () => {
    // **F34's measured half, and the frame is what settled it.** Before this,
    // `better`, `worse` and no verdict at all rendered *identically* at every
    // depth — the tone was the only difference and `200ms` against `150ms` says
    // nothing about which is wanted, so unlike `same`/`changed` a reader could
    // not recover it from the two cells.
    const judged = block({
      kind: "comparison",
      id: "j",
      rows: [
        { field: "p99", a: "200ms", b: "150ms", verdict: "better" },
        { field: "auprc", a: "0.912", b: "0.930", verdict: "worse" },
        { field: "loss", a: "0.03", b: "0.04" },
      ],
    });

    const uni = measurable().renderToLines(judged, 48).map(visible);
    const asc = measurable({ capabilities: ASCII_CAPS }).renderToLines(judged, 48).map(visible);

    expect(uni[1], "better").toContain("✓ 150ms");
    expect(uni[2], "worse").toContain("✗ 0.930");
    expect(uni[3], "and no verdict is no mark").not.toMatch(/[✓✗]/u);

    // The mark is the carrier, so it has to survive the substitution — and it
    // is 1:1 by cell count, which is why the rows stay the same width.
    expect(asc[1]).toContain("+ 150ms");
    expect(asc[2]).toContain("x 0.930");
    for (const [i, line] of asc.entries()) expect(line, `row ${String(i)}`).toHaveLength(48);
  });

  it("T1.4g (C04 I39): a live panel says so, in a slot that degrades and costs no height", () => {
    // **A slot reserved and unreachable since C04 was written** — `Glyph` has
    // carried `live` with both renderings, two surfaces draw it, and nothing in
    // the tree consumed it (F18). A03 §2's class in the glyph table.
    const of = (live: boolean) =>
      block({
        kind: "panel",
        id: live ? "p" : "q",
        title: "containers",
        ...(live ? { live: true } : {}),
        children: [block({ kind: "rule", id: live ? "r" : "s", label: "x" })],
      });

    // **The mark is a spinner frame since M4, and it was `▌`.** `Glyph.live` is
    // retired: the design carries no static live mark — liveness is the spinner
    // (§030) — and `▌` is the design's selection rail and caret (§017), so a
    // repository token stood on a design character for a fact drawn another way.
    // The fact survives the mark, which is what this row is now for.
    const kit = measurable();
    const frames = spinnerFrames(FULL_CAPS);
    const titleAt = (t: number, caps = FULL_CAPS): string =>
      visible(measurable({ capabilities: caps, tick: t }).renderToLines(of(true), 40)[0] ?? "");

    expect(titleAt(0)).toContain(`${frames[0]!} containers`);
    expect(visible(kit.renderToLines(of(false), 40)[0] ?? ""), "a static panel takes no mark").not.toContain(
      ` containers`.trimStart() === "" ? "x" : `${frames[0]!} `,
    );

    // **It advances**, which is the half a static rail could not carry: the
    // fact is *this region refreshes*, and a mark that never moves says a
    // region exists rather than that it is working.
    const seen = new Set(frames.map((_, t) => titleAt(t)));
    expect(seen.size, "the title moves with the tick").toBeGreaterThan(1);

    // The whole argument for a slot rather than a character in the title: it
    // degrades, where a `▌` an app wrote into its own title could not.
    const ascii = measurable({ capabilities: ASCII_CAPS });
    const asciiFrames = spinnerFrames(ASCII_CAPS);
    expect(visible(ascii.renderToLines(of(true), 40)[0] ?? "")).toContain(`${asciiFrames[0]!} containers`);

    // **Geometry does not animate** (I8): it rides in a border drawn either
    // way, so the panel is children + 2 still, and every frame is one cell, so
    // the row is the same width at every tick.
    expect(kit.measure(of(true), 40)).toBe(kit.measure(of(false), 40));
    for (const t of frames.keys()) expect(titleAt(t), `tick ${String(t)}`).toHaveLength(40);
  });

  /** Every `.ts` under `src/`, for the producer sweep below. */
  const srcFiles = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) srcFiles(path, out);
      else if (/\.ts$/u.test(entry) && !/\.d\.ts$/u.test(entry)) out.push(path);
    }
    return out;
  };

  it("T1.4g2 (C04 I39, R-GLY-003): retiring `live` loses no fact — `▌` had one consumer and it was this one", () => {
    // **The condition on retiring the token was that both its facts keep a
    // named, asserted replacement.** Measured, the repository's `▌` carried
    // **one**: *this region refreshes* (`Panel.live`, `livePanel` in
    // `shell/refresh.ts`, drawn at exactly one site), which T1.4g above now
    // asserts as a spinner.
    //
    // The other reading of `▌` — *my keys go here* — is the **design's**
    // (§017, R-BLK-129: the selection rail, and the caret in the mode line),
    // and nothing in `src/` paints it. A fact with no carrier cannot be lost by
    // retiring a mark, and this row is what makes that a measurement rather
    // than a claim: it fails the day a second producer appears, which is when
    // the replacement — the footer's owner line (R-KEY-004, M5) plus `▸` when
    // focused — has to exist.
    const src = srcFiles("src");
    const producers: string[] = [];
    for (const file of src) {
      const text = readFileSync(file, "utf8");
      for (const [i, line] of text.split("\n").entries()) {
        if (!line.includes("\u258c")) continue;
        // A mention in prose is not a producer; a string literal is.
        if (/^\s*(\*|\/\/|\/\*)/u.test(line)) continue;
        // **The line number is deliberately not in the key** (the anchor
        // lesson): it moves whenever anything above it is edited, so a row
        // keyed on it goes red for reasons that have nothing to do with `▌`.
        // The file and the line's own text locate it just as well and only
        // move when the producer does.
        void i;
        producers.push(`${file} ${line.trim().replace(/\s+/gu, " ")}`);
      }
    }
    // **Four, and not one of them is an ownership mark.** Named rather than
    // counted, because a count says *no new producer* and a list says *what the
    // old ones were for* — and the second is what the next reader needs when
    // R-KEY-004's owner line lands.
    expect(producers, "every `▌` a frame can reach, and what each is for").toEqual([
      // The plot's box fill — a figure, where position carries the meaning.
      'src/presentation/blocks/glyphs.ts bar: "▌",',
      // Two spinner sets: `▌` as one *frame* of an animation, which is a
      // liveness carrier and not a mark that stands still and means something.
      'src/presentation/blocks/glyphs.ts frames: Object.freeze(["▏", "▎", "▍", "▌", "▋", "▊", "▉", "▊", "▋", "▌", "▍", "▎"]),',
      'src/presentation/blocks/glyphs.ts frames: Object.freeze(["▌", "▀", "▐", "▄"]),',
      // A trailing comment on a range bound in `cells()`'s own table.
      "src/presentation/text.ts 0x25a0, 0x25ff, // geometric shapes — ▌ ● ○ ▸ ▾",
    ]);

    // And the token is gone from the vocabulary, both halves.
    expect(GLYPH_TOKENS as readonly string[]).not.toContain("live");
  });

  it("T1.4h (C04 I40): a comparison names its columns, and says nothing when it has nothing to say", () => {
    const rows = [{ field: "cmd", a: "nginx", b: "nginx" }];
    const named = block({ kind: "comparison", id: "n", rows, labels: ["nginx:alpine", "dtui-web"] });
    const bare = block({ kind: "comparison", id: "b", rows });

    const kit = measurable();
    const head = visible(kit.renderToLines(named, 60)[0] ?? "");
    expect(head).toContain("nginx:alpine");
    expect(head).toContain("dtui-web");

    // Positional stays the default: absent labels are not `["a", "b"]` written
    // in by a builder, they are absent, and the header is what it always was.
    expect(visible(kit.renderToLines(bare, 60)[0] ?? "")).toMatch(/\ba\b.*\bb\b/u);
    expect(kit.measure(named, 60)).toBe(kit.measure(bare, 60));
  });

  it("T1.4d (C04 I36): a block using only the verdict half renders as it did before the split", () => {
    // **The regression the split could most easily have caused.** The marker
    // column is per-block, so a comparison that declares no change must be
    // untouched — and every shipped consumer of this kind is one, which is why
    // the suite stayed green through a layout change and why this row exists.
    const kit = measurable();
    const lines = kit.renderToLines(ONE_PER_KIND.comparison, 56).map(visible);

    expect(lines[0]?.startsWith("field"), "no marker column, no leading pad").toBe(true);
    for (const l of lines) expect(l, "and the width is unchanged").toHaveLength(56);
  });

  it("T1.12b (I5): under ASCII every glyph is one cell and the row count is unchanged", () => {
    const unicode = measurable();
    const ascii = measurable({ capabilities: ASCII_CAPS });
    const steps = ONE_PER_KIND.steps;

    const asciiLines = ascii.renderToLines(steps, 40).map(visible);
    expect(asciiLines).toHaveLength(unicode.renderToLines(steps, 40).length);
    expect(asciiLines[0]?.startsWith("+")).toBe(true);
    for (const line of asciiLines) {
      expect([...line].every((ch) => (ch.codePointAt(0) ?? 0) < 0x80), line).toBe(true);
    }
  });
});

describe("C09 I28 — a progress bar clamps its fill and never its number", () => {
  // **One ruling where there were two.** `progress` clamped the ratio, and
  // `examples/docker`'s CPU bar deliberately overflows because `CPUPerc` is
  // per-core-normalised. The docker argument is not about docker: `100/100` and
  // `150/100` drawing identically is the same defect wherever it happens, and a
  // bar reporting `100%` on an overshoot says *complete* about something that
  // is not.
  const draw = (current: number, total: number, width = 40): string =>
    measurable({ theme: DARK_THEME, capabilities: FULL_CAPS })
      .renderToLines(block({ kind: "progress", id: "p", label: "Build", current, total }), width)
      .map((l) => l.replace(/\u001b\[[0-9;]*m/gu, ""))
      .join("");

  it("T1.24 (I28): an overshoot fills the bar and keeps counting", () => {
    expect(draw(150, 100), "the number is the true fraction").toContain("150%");
    expect(draw(100, 100), "and a complete bar is still 100%").toContain("100%");
    // The pair that used to be one picture. Asserted as a *difference*, because
    // each frame alone is plausible and the defect was that they matched.
    expect(draw(150, 100)).not.toBe(draw(100, 100));
  });

  it("T1.24 (I28): the bar itself never exceeds its cells", () => {
    // The half that must clamp: a bar has no cells past its last one, so the
    // fill saturates while the number does not. Without this the row would run
    // past the width and the terminal would wrap a line no measurer counted.
    const drawn = draw(150, 100, 40);
    expect(cells(drawn, "narrow"), "exactly the width, at any overshoot").toBeLessThanOrEqual(40);
    expect(draw(1000, 1, 40)).toContain("100000%");
  });

  it("T1.24 (I28): a negative current is floored, and without the floor it throws", () => {
    // **The mutation pass found this**: removing the `Math.max(0, …)` survived
    // every row, because no fixture in the corpus carries a negative `current`.
    // It is not a cosmetic guard — `bar.on.repeat(filled)` with a negative count
    // is a `RangeError`, so the block that renders a bar backwards does not
    // render at all, and C09 I2's *no block input throws* is what it breaks.
    expect(() => draw(-5, 100)).not.toThrow();
    expect(draw(-5, 100)).toContain("0%");
  });

  it("T1.24 (I28): a total of zero has no proportion — an empty bar and 0%", () => {
    // A floor rather than a measurement, and recorded so it is not rediscovered
    // as a defect. `current / 0` is what this exists to keep out of the frame.
    const drawn = draw(5, 0);
    expect(drawn).toContain("0%");
    expect(drawn).not.toContain("NaN");
    expect(drawn).not.toContain("Infinity");
  });
});

describe("C09 I71 — the tokeniser's run is emitted straight from the emitter seam", () => {
  // **The reference is the tree**: `lowlight`'s hast over the same grammars,
  // flattened by §4a's rule as `code.ts` had it — a text node's slot is the
  // innermost mapped class on its path, an unmapped class never dropped.
  type Hast = Readonly<{ type: string; value?: string; properties?: Readonly<{ className?: readonly string[] | string }>; children?: readonly Hast[] }>;
  const flatten = (node: Hast, inherited: string | null): Token[] => {
    if (node.type === "text") return node.value === undefined || node.value === "" ? [] : [{ text: node.value, slot: inherited }];
    const classes = node.properties?.className;
    const list = typeof classes === "string" ? [classes] : (classes ?? []);
    let here = inherited;
    for (const name of list) { const mapped = SLOTS[name]; if (mapped !== undefined) here = mapped; }
    const out: Token[] = [];
    for (const child of node.children ?? []) out.push(...flatten(child, here));
    return out;
  };
  // **A grammar with a sublanguage under a scoped mode**, because none of the
  // sixteen has one (their `subLanguage` modes carry no scope) and the clause
  // about a sublanguage's unslotted tokens taking the enclosing slot is
  // unobservable without it: the JSON between `<<` and `>>` sits in a
  // `string` scope, and its whitespace and colons — `null` in JSON's own run —
  // read as `string` here.
  const holding: LanguageFn = () => ({ contains: [{ scope: "string", begin: "<<", end: ">>", subLanguage: "json" }] });
  const DOCUMENTS: Readonly<Record<string, readonly string[]>> = {
    markdown: ["# h\n\n```js\nconst a = 1;\n```\n\ntext <b>bold</b> and `code`\n"],
    xml: ['<html><style>.a { color: red; }</style><script>let x = 1; // c</script><p class="q">t</p></html>'],
    javascript: ["const s = `a ${f(1)} b`; const h = html`<b>${x}</b>`; function g() {} // c"],
    holding: ["k <<{\"a\": [1, true]}>> v", "<<>> <<1>>"],
  };

  it("T1.45 (C09 I71): over every default grammar's sample, a markdown document with a fenced block, an xml document with style and script bodies and a javascript template literal, tokenise's run equals lowlight's tree flattened by §4a's rule token for token, and a grammar registered after the first call tokenises on the next", () => {
    // Every key of the table carries the prefix, which is what licenses looking
    // up the first segment alone (I71).
    expect(Object.keys(SLOTS).every((k) => k.startsWith("hljs-"))).toBe(true);
    // ASCII throughout, so I64's cluster pass is the identity and the run is
    // the emitter's own.
    const corpus = [...Object.entries(SAMPLES).map(([l, s]) => [l, s] as const), ...Object.entries(DOCUMENTS).flatMap(([l, ds]) => ds.map((d) => [l, d] as const))];
    for (const [, text] of corpus) expect(/^[\x00-\x7f]*$/u.test(text), "ASCII").toBe(true);

    // The grammar arriving after the first call: `tokenise` has run for the
    // default set (T3.32 above, and the first arm here), and `holding` is
    // registered now, on both sides.
    registerGrammar("holding", holding);
    const reference = createLowlight({ ...GRAMMARS, holding });

    let compared = 0;
    for (const [language, text] of corpus) {
      const ours = tokenise(text, language);
      const theirs = flatten(reference.highlight(language, text) as Hast, null);
      expect(ours, `${language}: ${JSON.stringify(text)}`).toEqual(theirs);
      expect(ours.map((t) => t.text).join(""), "the run is the text").toBe(text);
      compared += 1;
    }
    expect(compared).toBe(corpus.length);
    // The clause the hand grammar exists for: an unslotted JSON token under the
    // `string` scope reads as `string`, and the sublanguage's own slots hold.
    const held = tokenise(DOCUMENTS["holding"]?.[0] ?? "", "holding");
    // The delimiters, and JSON's two spaces — after the colon and the comma —
    // which JSON's own run leaves unslotted; the colon itself is JSON's
    // punctuation and keeps that.
    expect(held.filter((t) => t.slot === "string").map((t) => t.text).join("")).toBe("<<  >>");
    expect(held.some((t) => t.slot === "number"), "JSON's own number slot survives").toBe(true);
    // A sample with two adjacent scopes, the boundary the merge mutation moves.
    expect(tokenise("a: 1", "yaml").length).toBeGreaterThan(2); // cells-ok — a token count
  });
});

describe("C09 I76 — the window seam takes the caller's scratch, and the form is held in it", () => {
  it("T2.145 (C09 I76, F1191): a windowable block resolves once per width through one scratch — over the cap and within it — the seam hands `window` the same bare block both times, `render` touches the store not at all, another width resolves again, and a kind with no `window` leaves the store untouched", () => {
    const measured: Block[] = [];
    const windowed: Block[] = [];
    const linesOf = (b: Block): readonly string[] => (b as unknown as { lines: readonly string[] }).lines;
    const tall: BlockDefinition = {
      kind: "tall",
      measure: (b) => {
        measured.push(b);
        return linesOf(b).length; // cells-ok — a row count
      },
      render: (b) => inkRows(linesOf(b)),
      window: (b, _w, from, to) => {
        windowed.push(b);
        return { block: { ...(b as object), lines: linesOf(b).slice(from, to) } as unknown as Block, skipRows: 0, dropRows: 0 };
      },
    };
    const r = createBlockRegistry({ maxBlockRows: 10, onError: LOUD });
    r.register(tall);
    const events: string[] = [];
    const probe: Probe = {
      ...NO_PROBE,
      hit: (cache) => void events.push(`hit:${cache}`),
      miss: (cache, reason) => void events.push(`miss:${cache}:${reason}`),
      on: true,
    };
    const scratch = new RenderScratchStore(probe);
    const scratchEvents = (): readonly string[] => events.filter((e) => e.includes(":scratch"));

    // **Over the cap.** Forty lines against a cap of ten: the form is the
    // kind's own window to [0, cap) with the marker attached (§2b).
    const big = { kind: "tall", id: "big", lines: Array.from({ length: 40 }, (_, i) => `l${String(i)}`) } as unknown as Block;
    const on = (b: Block, list: readonly Block[]): number => list.filter((x) => x === b).length; // cells-ok — a call count
    const first = r.windowSequence([big], 80, 0, 5, undefined, scratch);
    expect(on(big, measured), "the whole block measured once to decide the cap").toBe(1);
    expect(on(big, windowed), "and windowed once to the cap").toBe(1);
    const handed = windowed.filter((b) => b !== big);
    expect(handed, "the sequence windowed the form's bare block").toHaveLength(1);
    expect(scratchEvents().some((e) => e.startsWith("miss:scratch")), "the first call missed the store").toBe(true);

    const second = r.windowSequence([big], 80, 0, 5, undefined, scratch);
    expect(second, "the same window").toEqual(first);
    expect(on(big, measured), "the whole block measured no further time").toBe(1);
    expect(on(big, windowed), "nor windowed to the cap again").toBe(1);
    const handedAgain = windowed.filter((b) => b !== big);
    expect(handedAgain, "the sequence windowed the bare block again").toHaveLength(2);
    expect(handedAgain[1], "and it is the same object (I76)").toBe(handed[0]);
    expect(scratchEvents().filter((e) => e === "hit:scratch").length, "a scratch hit on the second call").toBeGreaterThanOrEqual(1); // cells-ok — a count

    // **`render` touches the store not at all** (I76): the block it is handed
    // on the transcript path is the frame's slice, a new object every frame.
    const scratchBefore = scratchEvents().length;
    renderToLines(r, big, 80, { theme: DARK_THEME, capabilities: FULL_CAPS, tick: 0, scratch });
    expect(scratchEvents().length, "render neither read nor wrote the store").toBe(scratchBefore);

    // **Another width resolves again** — the width is the key. Relative to
    // the count after the render, which measures as it always did (F942).
    const beforeWidth = on(big, measured);
    r.windowSequence([big], 40, 0, 5, undefined, scratch);
    expect(on(big, measured), "a new width is a new form").toBe(beforeWidth + 1);
    r.windowSequence([big], 40, 0, 5, undefined, scratch);
    expect(on(big, measured), "and is held at that width").toBe(beforeWidth + 1);

    // **Within the cap**, the form is the block itself and is held likewise:
    // the whole-block measure that decided the cap is the cost either way.
    // Through the session's memo too (I70), because `#measured` commits the
    // height with a measure of its own (F942's second half) and that one is
    // the memo's to answer — so the reading is *no further measure on the
    // second call*, not a count of one.
    const small = { kind: "tall", id: "small", lines: ["a", "b", "c", "d", "e"] } as unknown as Block;
    const memo = new WeakMap<Block, Readonly<{ width: number; rows: number }>>();
    r.windowSequence([small], 80, 0, 3, memo, scratch);
    const afterFirstSmall = on(small, measured);
    expect(afterFirstSmall, "the first call measured the block").toBeGreaterThanOrEqual(1);
    r.windowSequence([small], 80, 0, 3, memo, scratch);
    expect(on(small, measured), "a block within the cap resolved no further time").toBe(afterFirstSmall);

    // **A kind with no `window`** has no form to hold and touches the store
    // not at all. Its own kind, because `raw` divides (block-cap's `raw(n)`).
    r.register({ kind: "atom", measure: () => 1, render: () => inkRows(["atom"]) });
    const before = scratchEvents().length;
    r.windowSequence([{ kind: "atom", id: "a" } as unknown as Block], 80, 0, 1, undefined, scratch);
    expect(scratchEvents().length, "no scratch read or write for a kind with no window").toBe(before);

    // **Without a scratch**, as before: every call resolves the form twice —
    // once for the height (`#measureChild`), once for the window — which is
    // the cost F1191 measured and the scratch removes.
    const beforePlain = on(big, measured);
    r.windowSequence([big], 80, 0, 5);
    r.windowSequence([big], 80, 0, 5);
    expect(on(big, measured), "two calls with no scratch, two whole-block measures each").toBe(beforePlain + 4);
  });
});

describe("C09 §7f — the scrollbar, owed at the spec commit", () => {
  it.todo(
    "T1.59 (C09 I92, §7f, §021): §021's four figure rows are drawn back glyph for glyph — twelve rows, a viewport of 12 in a content of 40, at offsets 0, 5, 14 and 28; not deferred on a component: the column lands in this MR",
  );
  it.todo(
    "T1.60 (C09 I92, §7f, §021): content that fits draws nothing and one row more draws a bar, then the properties over a sweep — the column is the gutter's height, the thumb is never empty, never leaves the track, and reaches its end exactly at the maximum offset; not deferred on a component: the column lands in this MR",
  );
  it.todo(
    "T1.61 (C09 I93, §7f, C02 I9): the set at wide is the ASCII set with no half-row form, and the width check run on one glyph rather than the set is the fabricated violation; not deferred on a component: the set lands in this MR",
  );
});
