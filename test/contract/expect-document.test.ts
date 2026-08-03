// C24 §7 — `expectDocument`, the published document assertions.
//
// **Every assertion here is paired with a document that must fail it.** A
// fluent API whose methods all return `this` is the easiest thing in the world
// to write vacuously: six methods that validate nothing return `this` exactly
// as six that validate everything do, and a suite that only ever passes good
// documents cannot tell the two apart. So each `it` asserts both directions,
// and the failing direction is the one carrying the weight.
//
// **Two failure paths are unreachable from here, and the reason is the same
// for both.** Mutating `measuresCorrectly` to discard the conformance report,
// and `degradesTo1Bit` to skip its geometry check, both fail nothing — because
// each can only fail when the *renderer* misbehaves, and `expectDocument` owns
// its registry so that a consumer never has to hold a `BlockRegistry` (§3, I2).
// Nothing outside can inject a broken one.
//
// That is a limit of this suite, not evidence the methods are wired: what does
// stand behind them is that `checkMeasurement` is driven directly with
// fabricated failures by C09's own tests, and that the positive case here
// caught a real defect in the wrapper on first run — it fed the suite the
// *sequence* renderer for a single block, so every gapped block measured one
// row short (C04 §3a). The remedy that would close the gap properly is an
// options parameter taking extra `BlockDefinition`s, which a consumer with a
// custom kind needs anyway (F1); it is not built, and saying so here is
// cheaper than a comment that implies these two lines are tested.
import { describe, expect, it } from "vitest";
import { block, document } from "../../src/data/viewmodel/index.js";
import type { Block, ViewDocument } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { expectDocument } from "../../src/testing/index.js";

const docOf = (blocks: readonly Block[]): ViewDocument =>
  document({
    schema: "tui.view/1",
    command: "ps",
    status: "ok",
    blocks,
    meta: {
      verb: "ps",
      adapter: "docker",
      exitCode: 0,
      durationMs: 1,
      truncated: false,
      argv: ["docker", "ps"],
      stderr: "",
      transport: "subprocess",
      origin: "user",
    },
  });

describe("C24 §7 — expectDocument", () => {
  it("T1.8: isValid passes a valid document and names the reason on an invalid one", () => {
    const good = docOf(b.seq([b.rule("containers"), b.notice.ok("nine running")]));
    expect(() => expectDocument(good).isValid()).not.toThrow();

    // Constructed past `document()` deliberately: the constructor is what would
    // normally refuse this, and the assertion must not be relying on it.
    const bad = { ...good, schema: "tui.view/2" } as unknown as ViewDocument;
    expect(() => expectDocument(bad).isValid()).toThrow(/not valid/);
  });

  it("is fluent: every method returns the same object, so calls chain", () => {
    const doc = docOf(b.seq([b.rule("containers"), b.raw("plain")]));
    const a = expectDocument(doc);
    expect(a.isValid()).toBe(a);
    expect(a.isValid().rendersAt([80])).toBe(a);
  });

  it("T4.2: measuresCorrectly runs the conformance suite over the document's own blocks", () => {
    const doc = docOf(
      b.seq([
        b.table({ columns: [b.col("name")], rows: [b.row("r1", { name: "web" })] }),
        b.kv({ image: "nginx", status: "running" }),
        b.plot({ series: [{ values: [1, 2, 3] }], height: 4 }),
        b.spark([1, 2, 3]),
        b.steps([{ label: "pull", state: "done" }]),
        b.progress({ label: "pull", current: 3, total: 9 }),
      ]),
    );
    expect(() => expectDocument(doc).measuresCorrectly()).not.toThrow();
  });

  it("rendersAt rejects a width nothing could render at", () => {
    const doc = docOf([b.raw("plain")]);
    expect(() => expectDocument(doc).rendersAt([80, 100])).not.toThrow();
    expect(() => expectDocument(doc).rendersAt([0])).toThrow(/not a usable width/);
    expect(() => expectDocument(doc).rendersAt([-5])).toThrow(/not a usable width/);
  });

  it("degradesToAscii passes the shipped kinds and would catch a non-ASCII survivor", () => {
    const doc = docOf(
      b.seq([b.rule("containers"), b.steps([{ label: "pull", state: "done" }]), b.notice.warn("degraded")]),
    );
    expect(() => expectDocument(doc).degradesToAscii()).not.toThrow();

    // The failing direction, and it has to come from content rather than from a
    // glyph: every glyph the theme picks already has an ASCII fallback, so a
    // document that fails this is one whose *text* is non-ASCII — which is
    // exactly the case a consumer hits and the framework cannot substitute for.
    const unicode = docOf([b.raw("café ✓ naïve")]);
    expect(() => expectDocument(unicode).degradesToAscii()).toThrow(/non-ASCII/);
  });

  it("degradesTo1Bit passes when colour is decoration and fails when it is the message", () => {
    const doc = docOf(
      b.seq([b.rule("containers"), b.notice.error("no such verb"), b.steps([{ label: "pull" }])]),
    );
    expect(() => expectDocument(doc).degradesTo1Bit()).not.toThrow();

    // The failing direction, which the first version of this method did not
    // have and could not have had: it compared frames, and a keyValue row whose
    // meaning is a tone paints identical characters at both depths.
    const colourOnly = docOf([
      block({
        kind: "keyValue",
        id: "kv1",
        rows: [{ label: "status", value: "unhealthy", tone: "error" }],
      }),
    ]);
    expect(() => expectDocument(colourOnly).degradesTo1Bit()).toThrow(/colour/i);
  });

  it("degradesTo1Bit accepts a renderer that changes layout to keep the information", () => {
    // **The case that proved frame comparison was the wrong property.** A
    // two-series plot lays out as stacked strips at `colourDepth: 1` — C12
    // substituting structure for colour, which is D29 obeyed. The earlier
    // implementation demanded the two frames match and rejected it.
    //
    // What must still hold is geometry: the same rows at both depths, because
    // C14 virtualises by measured height.
    const plot = docOf([
      b.plot({
        series: [
          { values: [1, 5, 2], tone: "ok" },
          { values: [3, 1, 4], tone: "warn" },
        ],
        height: 5,
      }),
    ]);
    expect(() => expectDocument(plot).degradesTo1Bit()).not.toThrow();
  });

  it("hasNoColourOnlyDistinction: a keyValue row toned `error` has nowhere to put a glyph", () => {
    // C04's constructor records this as a gap in the vocabulary it cannot close
    // — `keyValue` rows and `pills` chips carry a tone and have no glyph field,
    // so `block()` accepts them and D29 is unsatisfiable. This is the check that
    // can see it, because it reads a whole document rather than one block's shape.
    const clean = docOf([b.kv({ image: "nginx" })]);
    expect(() => expectDocument(clean).hasNoColourOnlyDistinction()).not.toThrow();

    const colourOnly = docOf([
      block({
        kind: "keyValue",
        id: "kv1",
        rows: [{ label: "status", value: "unhealthy", tone: "error" }],
      }),
    ]);
    expect(() => expectDocument(colourOnly).hasNoColourOnlyDistinction()).toThrow(
      /no glyph field/,
    );

    const chip = docOf([
      block({ kind: "pills", id: "p1", chips: [{ label: "degraded", tone: "warn" }] }),
    ]);
    expect(() => expectDocument(chip).hasNoColourOnlyDistinction()).toThrow(/no glyph field/);
  });

  it("hasNoColourOnlyDistinction walks into panels, groups and expanded rows", () => {
    // A container that did not recurse would pass every document whose only
    // offence is nested — which is most real ones, since a detail row is where
    // a status lands.
    const nested = docOf([
      block({
        kind: "panel",
        id: "outer",
        title: "details",
        children: [
          block({
            kind: "keyValue",
            id: "inner",
            rows: [{ label: "status", value: "unhealthy", tone: "error" }],
          }),
        ],
      }),
    ]);
    expect(() => expectDocument(nested).hasNoColourOnlyDistinction()).toThrow(/inner/);

    const inDetail = docOf([
      block({
        kind: "table",
        id: "t1",
        columns: [{ key: "n", label: "n", align: "left", priority: 50, minWidth: 8, sortable: false }],
        rows: [
          {
            id: "r1",
            cells: { n: { text: "web" } },
            detail: [
              block({
                kind: "pills",
                id: "detail-pills",
                chips: [{ label: "degraded", tone: "warn" }],
              }),
            ],
          },
        ],
      }),
    ]);
    expect(() => expectDocument(inDetail).hasNoColourOnlyDistinction()).toThrow(/detail-pills/);
  });
});
