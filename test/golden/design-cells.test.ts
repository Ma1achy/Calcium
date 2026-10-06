// The design's figures against the framework's frames, **cell by cell in the
// registry's vocabulary** — M16's blind spot, closed for the fifteen items the
// design-check of 2026-10-03 found (b5-fixcolour).
//
// `design-fixtures.test.ts` compares the set of non-ASCII marks each side
// draws, and its own document says what that cannot see: tone, ground, weight,
// position, and every section classed `app`. All fifteen of the design-check's
// items are in exactly those channels, and every one of them passed M16. This
// file reads them: `tools/design/cells.ts` turns a section's figure into cells
// from the registry's `renderHtml` and a frame into cells from its SGR, both
// named in the registry's own tokens, and `test/support/design-cells.ts` asks
// each item's questions of both.
//
// **The debt list is `design-cells-debt.json`, compared by equality** — every
// item, every differing reading, and both values. A difference with no entry
// fails, and so does an entry whose reading now agrees or whose values moved:
// a design lane fixing a reading removes its line, and fixing the last removes
// the item. **The values are in the entry on purpose.** A fix that moves the
// frame halfway — the rail toned on every row, but in `dim` where the figure
// says `muted` — changes the frame value without clearing the reading, and an
// entry keyed by name alone would go on reading as the old defect.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { REGISTRY, designGrid, frameGrid, rowText, type Grid } from "../../tools/design/cells.js";
import { ABSENT, PROBES, REPORT_ITEMS, UNSUPPORTED, figureOf, type Probe } from "../support/design-cells.js";

const DEBT = "test/golden/design-cells-debt.json";

/**
 * The sections whose `sectionBlocks` text is not the page's, by equality, and
 * the measured cause of each. **The registry's projection and the page are two
 * records of one figure, and three of these causes are drift between them** —
 * the page is what the fixtures are derived from.
 */
const PROJECTION_DIFFERS: Readonly<Record<string, string>> = {
  "15": "`{{RULE_ITEM:…}}` placeholders — the builder expands them from `rules`; the projection keeps the template",
  "18": "`{{RULE_ITEM:…}}` placeholders",
  "28": "the projection draws `› deny` on `pick` where the page draws `deny` — drift",
  "32": "`{{RULE_ITEM:…}}` placeholders, and the ASCII-fallback table the page generates from the spinner registry is a retained specimen here — drift",
  "51": "`{{APPROVAL_INSPECTION_LABEL}}` — the builder fills it from `approvalChoices`",
  "56": "`{{RULE_ITEM:…}}` placeholders",
  "61": "`{{APPROVAL_INSPECTION_LABEL}}`",
  "63": "`{{RULE_ITEM:…}}` placeholders",
  "78": "`{{RULE_ITEM:…}}` placeholders — none on a row I8 reads",
  "93": "a retained specimen: `FOUR AMBIGUOUS, EIGHT NARROW` and an older ASCII column where the page says `FOURTEEN AMBIGUOUS, SIX NARROW` — drift",
};

/** The sections the builder renders from structured records rather than projecting as `sectionBlocks`. */
const GENERATED = [1, 2, 6, 19, 22, 31, 33, 37, 91, 92, 111];

type Measured = Record<string, Record<string, { design: string; frame: string }>>;
type Debt = Record<string, { owner: string; readings: Record<string, { design: string; frame: string }> }>;

/** Every probe's readings that differ, keyed item → reading → both values. */
async function measure(probes: readonly Probe[], frameOf: (p: Probe) => Grid | Promise<Grid> = (p) => p.frame()): Promise<Measured> {
  const out: Measured = {};
  for (const p of probes) {
    const figure = figureOf(p);
    const frame = await frameOf(p);
    for (const [name, read] of Object.entries(p.readings)) {
      const design = read(figure);
      const drawn = read(frame);
      if (design === drawn) continue;
      (out[p.item] ??= {})[name] = { design, frame: drawn };
    }
  }
  return out;
}

const owed = (): Measured => {
  const debt = JSON.parse(readFileSync(DEBT, "utf8")) as Debt;
  return Object.fromEntries(Object.entries(debt).map(([item, e]) => [item, e.readings]));
};

describe("M16's blind spot — the figures against the frames, cell by cell", () => {
  it("DC1: the registry's figure is the fixture — the parser reads every section's text exactly", () => {
    // **The instrument before the subject.** A design grid whose text is not
    // the fixture is a parser reading something else, and every reading below
    // would compare against it. The fixtures are the registry's `panelText`
    // (`tools/design/fixtures.ts`), so a section's grid, right-trimmed, is that
    // file byte for byte — for every section with a figure, not for the eleven
    // the probes use.
    //
    // **Eleven figures are not in `sectionBlocks` at all**, measured: the
    // builder renders them from the registry's structured records — the
    // contract, the glyph census, the keymap, the help view, the spinner, bar
    // and ramp catalogues, the two state tables and the condensed rules — so
    // their cells carry no class this parser can read. They are listed by
    // equality, so a twelfth falling out of the projection fails here rather
    // than reading as a smaller corpus.
    const index = JSON.parse(readFileSync("docs/design/language/fixtures/INDEX.json", "utf8")) as { file: string; section: number; id: string }[];
    const projected = new Set((JSON.parse(readFileSync(REGISTRY, "utf8")) as { sectionBlocks: { sectionKey: string }[] }).sectionBlocks.map((b) => b.sectionKey));
    expect(index.filter((e) => !projected.has(e.id)).map((e) => e.section)).toEqual(GENERATED);
    const wrong: string[] = [];
    for (const { file, section, id } of index) {
      if (!projected.has(id)) continue;
      const text = designGrid(section).map((r) => rowText(r)).join("\n").replace(/\n+$/u, "");
      const fixture = readFileSync(`docs/design/language/fixtures/${file}`, "utf8").replace(/\n+$/u, "");
      if (text !== fixture) wrong.push(`§${String(section)}`);
    }
    expect(wrong, "sections whose grid text is not their fixture").toEqual(Object.keys(PROJECTION_DIFFERS).map((n) => `§${n}`));
    expect(index.length - GENERATED.length, "the figures compared").toBe(98); // cells-ok — a count

    // **And the rows a probe reads are the fixture's rows exactly**, the ten
    // above included — so a reading can never be taken from a line the page
    // does not draw.
    for (const p of PROBES) {
      const { file } = index.find((e) => e.section === p.section)!;
      const fixture = readFileSync(`docs/design/language/fixtures/${file}`, "utf8").split("\n");
      const [from, to] = p.rows ?? [0, fixture.length - 1];
      // A `{{…}}` row is a template the page expands (PROJECTION_DIFFERS), so
      // it is the one kind of row not compared; no reading locates one.
      const want = fixture.slice(from, to + 1).map((l) => l.trimEnd());
      // `designGrid` drops trailing blank rows, as `panelText` does.
      while (want.length > 0 && want[want.length - 1] === "") want.pop();
      const got = figureOf(p).map((r) => rowText(r));
      expect(got.length, `${p.item}'s figure rows`).toBe(want.length);
      got.forEach((row, i) => {
        if (!row.startsWith("{{")) expect(row, `${p.item} row ${String(from + i)}`).toBe(want[i]);
      });
    }
  });

  it("DC2: every item in the report is probed or named unsupported with a reason, and none is both", () => {
    const probed = new Set(PROBES.map((p) => p.item));
    const unsupported = new Set(Object.keys(UNSUPPORTED));
    expect([...probed].filter((i) => unsupported.has(i)), "both probed and unsupported").toEqual([]);
    expect([...probed, ...unsupported].sort(), "the report's items").toEqual([...REPORT_ITEMS].sort());
    for (const [item, why] of Object.entries(UNSUPPORTED)) expect(why.length, `${item}'s reason`).toBeGreaterThan(40); // cells-ok — a count
  });

  it("DC3: every reading finds its subject in the figure, so an agreement is never two absences", async () => {
    // **The vacuity class, at the instrument.** A locator that misses on both
    // sides reads `absent` twice and agrees. The figure is fixed, so a reading
    // that cannot find its subject there is a reading that compares nothing.
    const blind: string[] = [];
    for (const p of PROBES) {
      const figure = figureOf(p);
      for (const [name, read] of Object.entries(p.readings)) if (read(figure) === ABSENT) blind.push(`${p.item} ${name}`);
    }
    expect(blind).toEqual([]);
  });

  it("DC4: no block frame fell through to `raw` — a frame drawing the block's JSON is not the kind", async () => {
    // `table` and `plot` are not default kinds; an unregistered kind draws its
    // own JSON and still has rows. The first draft read I8 from exactly that.
    for (const p of PROBES) {
      const text = (await p.frame()).map((r) => rowText(r)).join("\n");
      expect(text, `${p.item}'s frame`).not.toMatch(/\{"kind":/u);
    }
  });

  it("DC5: the measured differences equal the debt list, item by item, reading by reading, value by value", async () => {
    // A failure prints the measured list whole, so the repair is a paste and
    // the diff of the paste is the reading to check against the picture.
    const now = await measure(PROBES);
    expect(now, `the measured differences — ${DEBT} must equal:\n${JSON.stringify(now, null, 2)}`).toEqual(owed());
  });

  it("DC6: every debt entry names an owner and an item the report has", () => {
    const debt = JSON.parse(readFileSync(DEBT, "utf8")) as Debt;
    for (const [item, e] of Object.entries(debt)) {
      expect(REPORT_ITEMS, `${item} is a report item`).toContain(item);
      expect(e.owner, `${item}'s owner`).toMatch(/^b5-[a-z0-9]+$/u);
    }
  });

  it("DC7: a fabricated violation — the figure drawn as its own frame agrees, and one changed cell is the one difference", async () => {
    // **The fabrication goes through `measure`, the function DC5 gates**, not
    // through a reading called by hand. Control first: every probe's figure as
    // its own frame measures nothing, which is what says a reading is a
    // function of the cells and not of which side it was handed.
    expect(await measure(PROBES, (p) => figureOf(p))).toEqual({});

    // Then one cell of §081's figure: the prompt's `❯` in default ink, which
    // is I6 exactly — and nothing else may move.
    const i6 = PROBES.find((p) => p.item === "I6")!;
    const fabricated = (p: Probe): Grid =>
      figureOf(p).map((row) =>
        row.map((c) => (c.ch === "❯" && row.findIndex((d) => d.ch !== " ") === row.indexOf(c) && c.bg === "" ? { ...c, fg: "default" } : c)),
      );
    expect(await measure([i6], fabricated)).toEqual({
      I6: { "prompt.mark": { design: "fg=muted bg=—", frame: "fg=default bg=—" } },
    });
  });

  it("DC8: the instrument's own arms — weight, underline, dim, ground names and the duration's shape, on constructed cells", () => {
    // **Written after the mutation pass**: swapping the frame fold's bold off
    // and the duration's `fractional`/`whole` branch to a constant both failed
    // nothing, because no probe's frame carries bold today and the one
    // duration in a frame is absent. Both are what the design lanes' fixes
    // will first make visible, so the arms are constructed here and not
    // waited for. Removing `p === 1` from `frameGrid` fails this row.
    const fg = "\u001b[38;2;140;140;140m";
    const [bold] = frameGrid([`\u001b[1m${fg}\u001b[4mA\u001b[0m${fg}B`])[0]!;
    expect(bold).toMatchObject({ ch: "A", fg: "muted", bold: true, ul: true, dim: false });
    const row = frameGrid([`${fg}B\u001b[2mC\u001b[48;2;34;34;34mD`])[0]!;
    expect(row.map((c) => [c.ch, c.bold, c.dim, c.bg])).toEqual([["B", false, false, ""], ["C", false, true, ""], ["D", false, true, "bgElev"]]);

    const duration = PROBES.find((p) => p.item === "I3")!.readings["head.duration"]!;
    const head = (text: string): Grid => frameGrid([`\u001b[38;2;140;140;140m${text}`]);
    expect(duration(head("● ps · 0.3s · 4 of 11"))).toBe("fg=muted bg=— · fractional");
    expect(duration(head("● ps · 4s · 4 of 11"))).toBe("fg=muted bg=— · whole");
    expect(duration(head("● ps · 4 of 11"))).toBe(ABSENT);
  });
});
