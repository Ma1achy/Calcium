import { describe, it } from "vitest";

/**
 * A block kind's own data as a measured input.
 *
 * The rows land with the gauges themselves; this file is the spec commit's half,
 * so the invariant is named by something before the code that satisfies it
 * exists (A03 §7a, F814).
 *
 * **The invariant is deliberately not cited outside the `it.todo` titles.** The
 * coverage signal strips the todos and then asks whether anything still names
 * it; a citation in a `describe` title or in this comment answers *yes* while
 * nothing runs, which is the state the signal exists to report (F907).
 */
describe("per-kind input gauges", () => {
  it.todo(
    "T1.77 (C28 I45): every kind in DEFAULT_DEFINITIONS against the first segment of every gauge name under src/presentation/ → the sets agree, and the count is asserted too — not deferred on a component: lands with the gauges themselves",
  );
  it.todo(
    "T1.78 (C28 I45): a rule with a 4 000-character label at width 80 → rule.label is 4 000 while measure is 1 — not deferred on a component: lands with the gauges themselves",
  );
  it.todo(
    "T1.79 (C28 I45): a 1-row notice with 200 spans against a 200-row notice with none → notice.spans separates them and notice.rows does not, and the converse — not deferred on a component: lands with the gauges themselves",
  );
  it.todo(
    "T1.80 (C28 I45): an image with a 40 000-character payload on a terminal with no image protocol → image.bytes, image.pixels and decode.entries as the control — not deferred on a component: lands with the gauges themselves",
  );
});
