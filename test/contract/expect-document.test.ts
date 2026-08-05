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
import { CORPUS, doc } from "../support/blocks.js";

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
        rows: [{ label: "status", value: "", tone: "error" }],
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

  it("hasNoColourOnlyDistinction: a meaning tone with no glyph and no word", () => {
    // **The rule is uniform, and it used to flag a whole schema.** This
    // asserted that every toned `keyValue` row and `pills` chip fails, because
    // neither kind has a glyph field. The first real consumer wrote
    // `b.pills([{ label: "2 running", tone: "ok" }])` — compliant, since the
    // word carries the state — and could not make the method pass. A schema gap
    // encoded as a document violation, which C04 explicitly declines to do.
    const clean = docOf([
      b.kv({ image: "nginx" }),
      block({ kind: "pills", id: "p1", chips: [{ label: "2 running", tone: "ok" }] }),
    ]);
    expect(() => expectDocument(clean).hasNoColourOnlyDistinction()).not.toThrow();

    // What does fail: a tone with nothing beside it at all.
    const bareChip = docOf([
      block({ kind: "pills", id: "p2", chips: [{ label: "", tone: "error" }] }),
    ]);
    expect(() => expectDocument(bareChip).hasNoColourOnlyDistinction()).toThrow(/empty label/);

    const bareCell = docOf([
      block({
        kind: "table",
        id: "t2",
        columns: [{ key: "s", label: "s", align: "left", priority: 50, minWidth: 4, sortable: false }],
        rows: [{ id: "r1", cells: { s: { text: "", tone: "error", glyph: "error" } } }],
      }),
    ]);
    // A glyph is a word's equal here, so this one passes.
    expect(() => expectDocument(bareCell).hasNoColourOnlyDistinction()).not.toThrow();
  });

  it("T2.13 (D29, A03 §2): every block kind is either swept or listed with a reason", () => {
    // **The sweep ended `default: break`, so four kinds were checked and eleven
    // passed in silence** — and silence in a compliance checker is
    // indistinguishable from compliance. A consumer's `comparison` block is what
    // surfaced it: a verdict rendered as a tone on one cell, in the method whose
    // job is finding meaning carried by colour alone.
    //
    // `validate.ts` has solved this since T2.10 with `Record<BlockKind,
    // KindCheck>` — *a new kind without a row here is a type error, not a silent
    // pass*. This row is that property for the sweep: a kind added tomorrow and
    // wired nowhere fails **here** rather than passing everywhere.
    //
    // Driven over `ONE_PER_KIND`, so the coverage is the corpus's rather than a
    // list maintained beside it — a hand-written set of kinds in this file would
    // go stale in exactly the way the `default` did.
    const kinds = new Set(CORPUS.map((blk) => blk.kind));
    expect(kinds.size, "the corpus must reach every kind or this proves little").toBeGreaterThan(
      14,
    );

    // Panels and groups are traversal, so nesting the corpus inside one also
    // proves the recursion reaches the same enumeration.
    const nested = doc({
      blocks: [
        ...CORPUS,
        block({ kind: "group", id: "g", direction: "column", children: [...CORPUS] }),
      ],
    });

    expect(() => expectDocument(nested).hasNoColourOnlyDistinction()).not.toThrow();
  });

  it("T2.13b: a kind the sweep has never heard of fails loudly rather than passing", () => {
    // **The property the row above cannot reach.** With every shipped kind
    // accounted for, deleting the guard changes nothing — its subject is a kind
    // that does not exist yet, so the mutation that removes it cannot be killed
    // by any document built from the union.
    //
    // An app-registered kind is that subject, today: C09's registry takes kinds
    // the union has never seen (§3), which is what makes the extension mechanism
    // real. So this is not a synthetic case — it is the one an app hits first,
    // and before this row the sweep would have reported it compliant without
    // looking at it.
    const alien = { kind: "app-gauge", id: "g1", tone: "error" } as unknown as Block;

    expect(() => expectDocument(doc({ blocks: [alien] })).hasNoColourOnlyDistinction()).toThrow(
      /neither swept .* nor listed/u,
    );
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
            rows: [{ label: "status", value: "", tone: "error" }],
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
                chips: [{ label: "", tone: "warn" }],
              }),
            ],
          },
        ],
      }),
    ]);
    expect(() => expectDocument(inDetail).hasNoColourOnlyDistinction()).toThrow(/detail-pills/);
  });
});
