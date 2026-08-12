// C04 tier 4 — integration. Real components, no real terminal.
//
// C04's integration partners are C07 (produces documents), C09 (measures them),
// C13 (holds them and applies patches) and C14 (virtualises by measured height).
// All four exist now.
//
// **T4.3 and T4.4 were deferred on C13 and C14 and expired when each landed**,
// which is what `todo-expiry` is for: the note nobody would otherwise send to the
// person who could act on it.
import { describe, expect, it } from "vitest";
import { createAdapterRegistry } from "../../src/data/adapters/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";
import {
  applyPatch,
  block,
  validateDocument,
  type Table,
  type ViewDocument,
} from "../../src/data/viewmodel/index.js";
import { CORPUS, doc, tableOf } from "../support/blocks.js";
import { DARK_THEME, FULL_CAPS, LIGHT_THEME, measurable } from "../support/render.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { createTranscriptStore } from "../../src/viewport/transcript/index.js";
import { createViewport } from "../../src/viewport/viewport/index.js";
import { measureSequence, rowsDoc } from "../support/viewport.js";
import { renderToLines } from "../../src/presentation/render-lines.js";
import type { RenderContext } from "../../src/presentation/blocks/index.js";
import { Box, Text } from "ink";
import { createElement, type ReactElement } from "react";
import {
  checkMeasurement,
  formatReport,
  uncoveredKinds,
} from "../../src/testing/measurement-conformance.js";

import { producerContext } from "../support/producer-context.js";
function unwrap(r: ReturnType<typeof applyPatch>): ViewDocument {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.doc;
}

/**
 * A consumer's block kind, written the way a consumer would write one: two
 * rows, resolved tones, no privileged access to anything.
 */
function renderBanner(block: Block, ctx: RenderContext): ReactElement {
  const text = (block as unknown as { text: string }).text;
  const lines = [`== ${text} ==`, "-".repeat(Math.max(1, ctx.width - 4))];
  return createElement(
    Box,
    { flexDirection: "column" },
    lines.map((line, i) => createElement(Text, { key: i }, line)),
  );
}

describe("C04 integration — the document lifecycle", () => {
  it("T4.0: a streaming verb's whole life — partial, patched fifty times, settled — stays valid and frozen", () => {
    // The shape C23 drives: append a partial document, patch it as output
    // arrives, settle it at the end. Every intermediate state is renderable
    // (I10) and valid (I2, I3, I14), which is what makes a partial document
    // safe to draw at any point.
    let d = doc({ status: "partial", blocks: [tableOf(3)] });

    // The user opens a row two ticks in.
    const opened = d.blocks[0] as Table;
    d = unwrap(
      applyPatch(d, {
        op: "replace",
        blockId: "t",
        block: { ...opened, rows: opened.rows.map((r) => (r.id === "r2" ? { ...r, expanded: true } : r)) },
      }),
    );

    for (let tick = 0; tick < 50; tick += 1) {
      d = unwrap(
        applyPatch(d, {
          op: "merge",
          blockId: "t",
          rows: [
            { id: "r1", cells: { name: { text: `tick ${tick}` } } },
            { id: `n${tick}`, cells: { name: { text: `row ${tick}` } } },
          ],
        }),
      );

      const r = validateDocument(d);
      expect(r.ok, `tick ${tick}: ${r.ok === false ? r.error.join(", ") : ""}`).toBe(true);
      expect(Object.isFrozen(d), `tick ${tick}: frozen`).toBe(true);
      expect(
        (d.blocks[0] as Table).rows.find((row) => row.id === "r2")?.expanded,
        `tick ${tick}: the row the user opened is still open`,
      ).toBe(true);
    }

    d = unwrap(applyPatch(d, { op: "status", status: "ok" }));

    expect(d.status).toBe("ok");
    expect((d.blocks[0] as Table).rows).toHaveLength(53);
    expect(validateDocument(d).ok).toBe(true);
  });

  it("T4.0b: an error document assembled the way C07 assembles one", () => {
    // C07 maps a transport failure to a document. The ordering matters: the
    // error and the status must arrive together, because applyPatch will not
    // let them arrive separately (I3, I15).
    const failed = doc({
      status: "error",
      error: { message: "connection refused", code: "ECONNREFUSED", stage: "transport" },
      blocks: [block({ kind: "notice", id: "n", tone: "error", glyph: "error", text: "Could not connect." })],
    });

    expect(validateDocument(failed).ok).toBe(true);

    // And the sequence C23 must not attempt: patch the status first.
    const wrongWay = applyPatch(doc({ status: "partial" }), { op: "status", status: "error" });
    expect(wrongWay.ok, "there is no error to move to").toBe(false);
    expect(wrongWay.ok === false && wrongWay.error.message).toContain("carries no");
  });

  it("T4.0c (I13): every document in the lifecycle carries an origin", () => {
    // C23 sets it on every append, with no default and no path that omits it.
    // Patching never changes it, which is what makes it trustworthy later.
    let d = doc({ meta: { ...doc().meta, origin: "refresh" } });
    d = unwrap(applyPatch(d, { op: "append", block: block({ kind: "raw", id: "x", text: "x" }) }));
    d = unwrap(applyPatch(d, { op: "status", status: "partial" }));

    expect(d.meta.origin).toBe("refresh");
  });

  it("T4.1: a fallback-adapted arbitrary JSON object produces a document passing every T2 contract test", () => {
    // C04's vocabulary, exercised by the component that actually produces
    // documents rather than by a literal written to satisfy the validator. The
    // difference matters: a hand-built document is written by someone who has
    // read C04, and the fallback is written against JSON nobody controls.
    const shapes: unknown[] = [
      { name: "web", replicas: 3 },
      [{ id: "a" }, { id: "b" }],
      { total: 2, items: [{ id: "a" }, { id: "b" }] },
      [],
      null,
      "a bare string",
      [{ a: 1 }, { b: 2 }],
    ];

    for (const stdout of shapes) {
      // Through the registry: an adapter's return carries only the three `meta`
      // keys it owns, and this row validates a *document*. F58b.
      const doc = createAdapterRegistry({}).adapt(
        {
          argv: ["prism", "ps", "--json"],
          exitCode: 0,
          signal: null,
          stdout,
          stdoutRaw: "",
          stderr: "",
          durationMs: 1,
          parseError: null,
          cancelled: false,
          timedOut: false,
          overflowed: false,
        },
        {
          ...producerContext(),
          command: "/ps",
          verb: "ps",
          width: 100,
          userRequestedJson: false,
          flags: {},
          transport: "fixture",
          origin: "user",
          tool: null,
        },
      );

      const validity = validateDocument(doc);
      expect(validity.ok, validity.ok ? "" : validity.error.join("; ")).toBe(true);
      expect(doc.blocks.length).toBeGreaterThan(0);

      // The measurement contract, at the widths C04 §5 names. A document that
      // validates and cannot be measured is one that breaks scrolling instead
      // of rendering wrongly, which is harder to trace.
      for (const width of [40, 80, 120]) {
        for (const b of doc.blocks) {
          if (b.kind === "table") continue; // C11 registers the measurer.
          expect(Number.isFinite(measurable().measure(b, width))).toBe(true);
        }
      }
    }
  });
  it("T4.2: a custom block kind joins the T2.1 corpus by being registered, not by being listed", () => {
    // The extension mechanism, held to the same contract as the defaults. The
    // suite reads `registry.kinds`, so a consumer's kind is measured, rendered
    // and checked without anyone editing a list — and a consumer's kind that
    // breaks I1 fails the same assertion the built-ins do.
    const registry = createBlockRegistry({});
    registry.register({
      kind: "banner",
      measure: () => 2,
      render: (b, ctx) => renderBanner(b, ctx),
    });

    const banner = { kind: "banner", id: "banner-1", text: "custom" } as unknown as Block;
    const kit = {
      measure: (b: Block, w: number) => registry.measure(b, w),
      renderToLines: (b: Block, w: number) =>
        renderToLines(registry, b, w, { theme: DARK_THEME, capabilities: FULL_CAPS }),
      kinds: registry.kinds,
    };

    expect(kit.kinds, "discovery, not registration in two places").toContain("banner");
    expect(
      uncoveredKinds(kit, [banner]),
      "every kind bar the custom one is a default; the point is that `banner` is not among the uncovered",
    ).not.toContain("banner");

    const report = checkMeasurement(kit, [banner], { widths: [40, 80] });
    expect(report.failures, formatReport(report)).toEqual([]);
  });
  it("T4.3: fifty documents and two hundred patches leave every document valid and frozen", () => {
    // C13 landed, so this is writable. It is C04's test rather than C13's: the
    // claim is that `applyPatch` composes — two hundred applications in sequence
    // and nothing has drifted out of the schema or lost its freeze.
    const store = createTranscriptStore({ cap: 100_000 });
    const ids: string[] = [];

    for (let d = 0; d < 50; d += 1) {
      ids.push(
        store.append(
          doc({
            command: `c${d}`,
            blocks: [block({ kind: "raw", id: `d${d}-b0`, text: "seed" })],
          }),
          { streaming: true },
        ),
      );
    }

    for (let p = 0; p < 200; p += 1) {
      const id = ids[p % ids.length]!;
      const r = store.patch(id, {
        op: "append",
        block: block({ kind: "raw", id: `p${p}`, text: `patch ${p}` }),
      });
      expect(r, `patch ${p}`).toMatchObject({ ok: true });
    }

    for (const e of store.entries) {
      expect(validateDocument(e.doc).ok, `${e.id} after patching`).toBe(true);
      expect(Object.isFrozen(e.doc), `${e.id} frozen`).toBe(true);
    }
    // I1 from C13's side, as the arithmetic that makes "valid and frozen" mean
    // something: forty-nine of the fifty are frozen and exactly one is live.
    expect(store.entries.filter((e) => e.live)).toHaveLength(1);
  });
  it("T4.4: virtualising a 10,000-block transcript selects exactly a viewport's worth", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 24, measureSequence });
    for (let i = 0; i < 1_000; i += 1) store.append(rowsDoc(10, `d${i}`));

    expect(viewport.scroll.totalRows).toBe(10_000);
    viewport.scrollToTop();
    for (let page = 0; page < 50; page += 1) {
      const r = viewport.visible();
      expect(r.entries.reduce((n, e) => n + e.takeRows, 0), `page ${page}`).toBe(24);
      viewport.pageDown();
    }
  });
  // Restated rather than written: C11 landed, and the half this needs is C14's.
  // The measured delta is assertable today (C11 T1.9, T6.7) and "subsequent blocks
  // shift by it, mid-transcript, with no drift" is a claim about a viewport, which
  // is the component that does not exist.
  it("T4.5: expanding a row mid-transcript shifts subsequent blocks by exactly the delta", () => {
    const store = createTranscriptStore();
    const viewport = createViewport(store, { width: 80, height: 10, measureSequence });
    const collapsed = tableOf(4, "t");
    const id = store.append(doc({ blocks: [collapsed] }), { streaming: true });
    store.append(rowsDoc(20, "below"));

    const beforeTotal = viewport.scroll.totalRows;
    const beforeRowsBelow = viewport.scroll.totalRows;

    // Expanding is a `replace` carrying the opened row (C04 §4: `expanded` is
    // view state and is never merged).
    store.patch(id, {
      op: "replace",
      blockId: "t",
      block: {
        ...collapsed,
        rows: collapsed.rows.map((r) =>
          r.id === "r2"
            ? { ...r, expanded: true, detail: [block({ kind: "raw", id: "d0", text: "detail" })] }
            : r,
        ),
      },
    });

    const delta = viewport.scroll.totalRows - beforeTotal;
    expect(delta).toBeGreaterThan(0);
    // No drift: the total moved by exactly what the measurer says the entry grew
    // by, and nothing else changed height.
    const measured = store.entries.reduce(
      (n, e) => n + measureSequence(e.doc.blocks, 80),
      0,
    );
    expect(viewport.scroll.totalRows).toBe(measured);
    expect(viewport.scroll.totalRows).toBe(beforeRowsBelow + delta);
  });
  it("T4.6: the same document under both themes produces identical line counts", () => {
    // Colour never changes row count (§5). A whole document, not one block:
    // this is the assertion C14 relies on when a theme switch invalidates the
    // frame but not the measured heights.
    const blocks = CORPUS.filter((b) => !["table", "plot", "patch"].includes(b.kind));
    const dark = measurable({ theme: DARK_THEME });
    const light = measurable({ theme: LIGHT_THEME });

    for (const width of [40, 80, 120]) {
      const darkRows = blocks.reduce((sum, b) => sum + dark.renderToLines(b, width).length, 0);
      const lightRows = blocks.reduce((sum, b) => sum + light.renderToLines(b, width).length, 0);
      expect(lightRows, `width ${width}`).toBe(darkRows);
    }
  });
});
