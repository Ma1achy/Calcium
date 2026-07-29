// C04 tier 4 — integration. Real components, no real terminal.
//
// C04's integration partners are C07 (produces documents), C09 (measures them),
// C13 (holds them and applies patches) and C14 (virtualises by measured height).
// None of the four exists yet, so every T4 in the spec names its blocker.
//
// What can be integrated today is C04 with itself across a realistic sequence:
// the document lifecycle a streaming verb actually produces. That is not a
// substitute for T4.3, but it is the part of T4.3 that does not need C13.
import { describe, expect, it } from "vitest";
import {
  applyPatch,
  block,
  validateDocument,
  type Table,
  type ViewDocument,
} from "../../src/data/viewmodel/index.js";
import { doc, tableOf } from "../support/blocks.js";

function unwrap(r: ReturnType<typeof applyPatch>): ViewDocument {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error.message}`);
  return r.doc;
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
      blocks: [block({ kind: "notice", id: "n", tone: "error", glyph: "✗", text: "Could not connect." })],
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

  it.todo(
    "T4.1: a fallback-adapted arbitrary JSON object produces a document passing every T2 contract test — waits on C07",
  );
  it.todo(
    "T4.2: registering a custom block kind adds it to the T2.1 corpus automatically — the suite discovers it rather than being extended by hand — waits on C09",
  );
  it.todo(
    "T4.3: appending fifty documents and applying two hundred patches leaves every document valid and frozen — waits on C13",
  );
  it.todo(
    "T4.4: virtualising a 10,000-block transcript selects a range whose summed measured heights equal the viewport height exactly — waits on C09 and C14",
  );
  it.todo(
    "T4.5: expanding a row mid-transcript shifts subsequent blocks by exactly the height delta, with no drift — waits on C09 and C14",
  );
  it.todo(
    "T4.6: the same document under both themes produces identical line counts — waits on C09 and C10",
  );
});
