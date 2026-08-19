/**
 * DC1–DC7: default categorical colouring.
 */
import { describe, expect, it } from "vitest";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { FULL_CAPS, MONO_CAPS, measurable } from "../support/render.js";
import { block } from "../../src/data/viewmodel/index.js";

const kit = (caps = FULL_CAPS) => measurable({ definitions: [plotDefinition], capabilities: caps });

const SGR = /\x1b\[38;2;(\d+;\d+;\d+)m/g;

function extractColours(lines: readonly string[]): Set<string> {
  const colours = new Set<string>();
  for (const l of lines) {
    for (const m of l.matchAll(SGR)) colours.add(m[1]!);
  }
  return colours;
}

/**
 * The colours the *data* is drawn in — the frame, gutter and labels removed.
 *
 * Measured rather than listed: a block with no series renders nothing but
 * furniture, so its colour set **is** the chrome, and subtracting it needs no
 * constant that goes stale when C10 moves a slot.
 */
const CHROME: Set<string> = extractColours(
  kit().renderToLines(block({ kind: "plot", id: "chrome", form: "bar", height: 3, axes: true, categories: ["a", "b", "c"], series: [] }), 60),
);

function dataColours(lines: readonly string[]): Set<string> {
  return new Set([...extractColours(lines)].filter((c) => !CHROME.has(c)));
}

describe("DC1: pie with 4 segments renders 4 different SGR colours", () => {
  it("four distinct foreground colours appear", () => {
    const b = block({
      kind: "plot", id: "dc1", form: "pie", height: 8, series: [],
      segments: [
        { label: "A", value: 30 },
        { label: "B", value: 25 },
        { label: "C", value: 25 },
        { label: "D", value: 20 },
      ],
    });
    const lines = kit().renderToLines(b, 40);
    const colours = extractColours(lines);
    expect(colours.size).toBeGreaterThanOrEqual(4);
  });
});

describe("DC2 (C12 I38): a grouped bar's colours count its series, not its rows", () => {
  // **The row it built was not the row its name claimed.** DC2 read *grouped
  // bar with 3 categories renders 3 colours* and constructed a plain
  // single-series bar — so it asserted the palette cycling per category while
  // reading as a statement about series, and passed for both reasons at once.
  it("two series across three categories draw two colours, not six and not three", () => {
    const b = block({
      kind: "plot", id: "dc2", form: "bar", height: 6, axes: true,
      layout: "grouped",
      categories: ["X", "Y", "Z"],
      series: [{ values: [10, 20, 30], label: "before" }, { values: [15, 25, 35], label: "after" }],
    });
    const data = dataColours(kit().renderToLines(b, 60));
    expect(data.size).toBe(2);
  });
});

describe("DC3: waffle with 3 segments renders 3 colours", () => {
  it("three distinct foreground colours appear at 24-bit", () => {
    const b = block({
      kind: "plot", id: "dc3", form: "waffle", series: [],
      segments: [
        { label: "A", value: 40 },
        { label: "B", value: 30 },
        { label: "C", value: 30 },
      ],
    });
    const lines = kit().renderToLines(b, 20);
    const colours = extractColours(lines);
    expect(colours.size).toBeGreaterThanOrEqual(3);
  });
});

describe("DC4: at 1-bit, categorical forms render without error", () => {
  it("waffle with 3 segments renders correctly at 1-bit", () => {
    const b = block({
      kind: "plot", id: "dc4", form: "waffle", series: [],
      segments: [
        { label: "A", value: 40 },
        { label: "B", value: 30 },
        { label: "C", value: 30 },
      ],
    });
    const lines = kit(MONO_CAPS).renderToLines(b, 20);
    expect(lines.length).toBeGreaterThan(0); // cells-ok — a row count
    const stripped = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const hasContent = stripped.some((r) => r.trim().length > 0); // cells-ok — checking non-empty
    expect(hasContent).toBe(true);
  });
});

describe("DC6: explicit tone overrides the default assignment", () => {
  it("a series with tone 'error' uses a different colour than categorical", () => {
    const b1 = block({
      kind: "plot", id: "dc6a", form: "bar", height: 2, axes: true,
      categories: ["X", "Y"],
      series: [{ values: [10, 20] }],
    });
    const b2 = block({
      kind: "plot", id: "dc6b", form: "bar", height: 2, axes: true,
      categories: ["X", "Y"],
      series: [{ values: [10, 20], tone: "error" }],
    });
    const lines1 = kit().renderToLines(b1, 60).join("\n");
    const lines2 = kit().renderToLines(b2, 60).join("\n");
    expect(lines1).not.toBe(lines2);
  });
});

describe("DC7 (C12 I38): a named row keeps its slot, a sliced one does not", () => {
  // **The rule is the row axis and not the series count**, which is the
  // correction this row was rewritten for: a bar's categories are things the
  // caller named, a histogram's bins are cuts this renderer made. Asserted by
  // growing the row count — under one arm the colour set grows with it, under
  // the other it cannot, and one fixture shape drives both.
  const at = (form: "bar" | "histogram", n: number): Set<string> => dataColours(kit().renderToLines(block({
    kind: "plot", id: `dc7-${form}-${String(n)}`, form, height: n, axes: true, binning: "sturges",
    ...(form === "bar"
      ? { categories: Array.from({ length: n }, (_c, i) => `cat ${String(i)}`), // cells-ok — a category count
          series: [{ values: Array.from({ length: n }, (_v, i) => 10 + i * 5) }] } // cells-ok — a category count
      : { series: [{ values: Array.from({ length: 120 }, (_v, i) => (i * 37) % 89) }] }), // cells-ok — a sample count
  }), 60));

  it("a bar's named categories take a slot each", () => {
    expect(at("bar", 2).size).toBe(2);
    expect(at("bar", 6).size).toBe(6);
  });

  it("a histogram's bins do not, however many rows it is given", () => {
    expect([...at("histogram", 4)]).toEqual([...at("histogram", 9)]);
    expect(at("histogram", 9).size).toBe(1);
  });

  it("a histogram and a line of one series draw the same colour", () => {
    const values = Array.from({ length: 120 }, (_v, i) => (i * 37) % 89); // cells-ok — a sample count
    const hist = dataColours(kit().renderToLines(block({
      kind: "plot", id: "dc7-hist", form: "histogram", height: 8, axes: true, series: [{ values }],
    }), 60));
    const line = dataColours(kit().renderToLines(block({
      kind: "plot", id: "dc7-line", form: "line", height: 8, axes: true, series: [{ values }],
    }), 60));
    expect([...hist]).toEqual([...line]);
  });
});

describe("DC8 (C12 I38): a histogram's bins are one distribution", () => {
  it("eight bins draw one colour", () => {
    const b = block({
      kind: "plot", id: "dc8", form: "histogram", height: 8, axes: true, binning: "sturges",
      series: [{ values: Array.from({ length: 120 }, (_v, i) => (i * 37) % 89) }], // cells-ok — a sample count
    });
    const lines = kit().renderToLines(b, 80);
    // The fixture is shown to make eight bins before its colour is asserted:
    // a histogram that binned to one row would satisfy *one colour* for the
    // wrong reason. `test/support/README.md` carries that rule.
    const bins = lines.filter((l) => l.includes("\u2524") && /\u2588/u.test(l)); // cells-ok — a bin count
    expect(bins.length).toBeGreaterThanOrEqual(6); // cells-ok — a bin count
    expect(dataColours(lines).size).toBe(1);
  });
});

describe("DC9 (C12 I38): a timeline's rows are series, so they keep the palette", () => {
  // The one cell where the correction would break something, and it would
  // break silently — three tracks in one colour, every count in the frame
  // still right. C12 §3t's table is what named it before the edit landed.
  it("three tracks draw three colours", () => {
    const b = block({
      kind: "plot", id: "dc9", form: "timeline", height: 3, axes: true,
      series: [
        { values: [1, 4, 9], label: "deploy" },
        { values: [2, 6], label: "incident" },
        { values: [3, 8], label: "rollback" },
      ],
    });
    expect(dataColours(kit().renderToLines(b, 60)).size).toBe(3);
  });

  // **The row that says why the `refFor` is there at all**, and the first form
  // of it could not tell the two apart. Once a named row keeps its slot, the
  // default gives a timeline three distinct colours too — so *each track has
  // its own colour and no other row has it* is satisfied by both arms, and the
  // mutation that removes the declaration walked past sixteen green assertions.
  //
  // What separates them is **which** colour: the declaration reads *this
  // track's* tone, the default reads the first track's. So the fixture is a
  // pair — the same timeline with and without a tone on the middle track —
  // and the claim is that the tone moves that row and leaves the others where
  // they were.
  it("a tone on the second track colours the second track and only it", () => {
    const tracks = [
      { values: [1, 4, 9], label: "deploy" },
      { values: [2, 6], label: "incident" },
      { values: [3, 8], label: "rollback" },
    ];
    const render = (toned: boolean): readonly string[] => kit().renderToLines(block({
      kind: "plot", id: `dc9b-${String(toned)}`, form: "timeline", height: 3, axes: true,
      series: tracks.map((t, i) => (toned && i === 1 ? { ...t, tone: "error" as const } : t)), // cells-ok — a track index
    }), 60);
    const plain = render(false).map((l) => l.replace(/\x1b\[[0-9;]*m/gu, ""));
    const row = plain.findIndex((l) => l.includes("incident")); // cells-ok — a track index
    expect(row).toBeGreaterThanOrEqual(0); // cells-ok — a track index

    const before = render(false), after = render(true);
    const colours = (ls: readonly string[], i: number): string[] => [...dataColours([ls[i] ?? ""])];
    expect(colours(after, row)).not.toEqual(colours(before, row));
    for (let i = 0; i < before.length; i += 1) { // cells-ok — a row count
      if (i !== row) expect(colours(after, i)).toEqual(colours(before, i));
    }
  });
});

describe("DC10 (C12 I38): a band is a name the caller chose, so it keeps its slot", () => {
  // Its data is in `quartiles` and there is no series to index, which is what
  // made this look like the histogram's case for one commit. It is not:
  // `control` is a thing and `[15.4, 24.1)` is a cut.
  it("three box-plot bands draw three colours", () => {
    const b = block({
      kind: "plot", id: "dc10", form: "boxplot", height: 9, axes: true,
      categories: ["control", "dose-a", "dose-b"],
      series: [],
      quartiles: [
        { min: 1, q1: 3, median: 5, q3: 7, max: 9 },
        { min: 2, q1: 4, median: 6, q3: 8, max: 10 },
        { min: 0, q1: 2, median: 4, q3: 6, max: 8 },
      ],
    });
    expect(dataColours(kit().renderToLines(b, 60)).size).toBe(3);
  });
});

describe("DC12 (C12 I38): the vertical arm is the same rule stood up", () => {
  // `categoricalColumnForm` is a separate renderer rather than a flag — C12 §3j —
  // so it holds its own copy of the decision and would have kept cycling with
  // the horizontal arm fixed. Two arms, two edits, two rows.
  it("six named vertical bars draw six colours", () => {
    const b = block({
      kind: "plot", id: "dc12", form: "bar", height: 9, axes: true, orientation: "vertical",
      categories: ["a", "b", "c", "d", "e", "f"],
      series: [{ values: [10, 25, 15, 30, 20, 5] }],
    });
    expect(dataColours(kit().renderToLines(b, 60)).size).toBe(6);
  });

  it("a vertical histogram's bins draw one colour", () => {
    const b = block({
      kind: "plot", id: "dc12h", form: "histogram", height: 9, axes: true, orientation: "vertical",
      binning: "sturges",
      series: [{ values: Array.from({ length: 120 }, (_v, i) => (i * 37) % 89) }], // cells-ok — a sample count
    });
    expect(dataColours(kit().renderToLines(b, 60)).size).toBe(1);
  });
});

describe("DC13 (C12 I38): a correlogram's lags are offsets, not names", () => {
  // The second form on the sliced side of the partition, and the reason it is
  // a `Record` rather than a special case for `histogram`.
  it("nine lags draw one colour", () => {
    const b = block({
      kind: "plot", id: "dc13", form: "autocorrelation", height: 9, axes: true,
      series: [{ values: [1, 0.8, 0.55, 0.3, -0.1, -0.35, -0.2, 0.05, 0.25] }],
    });
    expect(dataColours(kit().renderToLines(b, 60)).size).toBe(1);
  });
});

describe("DC11 (C12 I38): a row's interior identities keep their owners' colours", () => {
  // The guard against the fix over-reaching: a stacked bar's layers are inside
  // one row and `ownedSpans` colours each by its series. One colour there
  // would be the same defect pointing the other way.
  it("three stacked layers draw three colours across two categories", () => {
    const b = block({
      kind: "plot", id: "dc11", form: "bar", height: 2, axes: true, layout: "stacked",
      categories: ["X", "Y"],
      series: [{ values: [10, 12] }, { values: [20, 18] }, { values: [30, 25] }],
    });
    expect(dataColours(kit().renderToLines(b, 60)).size).toBe(3);
  });
});
