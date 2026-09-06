// C09 tier 1 — the registry's state machine, and each kind's documented height.
import { describe, expect, it } from "vitest";
import { displayCells } from "../../src/presentation/text.js";
import { block, validateBlock } from "../../src/data/viewmodel/index.js";
import {
  createBlockRegistry,
  DEFAULT_DEFINITIONS,
  DEFAULT_LANGUAGES,
  registerGrammar,
  tokenise,
  UNSLOTTED,
} from "../../src/presentation/blocks/index.js";
import type { RenderContextInput } from "../../src/presentation/blocks/index.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { ASCII_CAPS, DARK_THEME, FULL_CAPS, MONO_CAPS, measurable, visible } from "../support/render.js";
import { cells } from "../../src/presentation/text.js";

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

  it("T1.4: each of the nineteen kinds measures its documented height", () => {
    // §3's table, read back as assertions. The fixture is the canonical one, so
    // a change to a kind's height rule fails here with the kind named rather
    // than as one line of a conformance report.
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

    const kit = measurable();
    expect(visible(kit.renderToLines(of(true), 40)[0] ?? "")).toContain("▌ containers");
    expect(visible(kit.renderToLines(of(false), 40)[0] ?? "")).not.toContain("▌");

    // The whole argument for a slot rather than a character in the title.
    const ascii = measurable({ capabilities: ASCII_CAPS });
    expect(visible(ascii.renderToLines(of(true), 40)[0] ?? "")).toContain("| containers");

    // It rides in a border drawn either way, so the panel is children + 2 still.
    expect(kit.measure(of(true), 40)).toBe(kit.measure(of(false), 40));
    expect(visible(kit.renderToLines(of(true), 40)[0] ?? "")).toHaveLength(40);
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
