// F104 — `block()`'s excess-key guard, as fabricated violations that must not
// compile.
//
// **A type-level test, because the thing under test is a type.** Every line
// below is `@ts-expect-error`, so `tsc` fails if the guard *stops* firing — the
// same shape as a fail-on-revert row, in the one place a runtime assertion
// cannot reach. Nothing here runs; the file exists to be compiled.
//
// The finding it closes: `block<B extends Block>(spec: B)` inferred `B` from the
// argument, so the literal's own type became `B` and nothing was ever checked
// against `Block`. Commitment 29 says *"C04's constructors enforce the shape
// invariants"*, and the compiler was enforcing nothing.
import { block } from "../../src/data/viewmodel/index.js";

// The finding's own fabricated violation, kept verbatim: this compiled.
// @ts-expect-error a key of no block kind
block({ kind: "rule", id: "r", label: "x", utterGarbage: 42 });

// A key that is real, on a different kind. The interesting arm, because
// `B extends Block` was satisfied structurally and a plausible-looking key is
// what a reader would not query.
// @ts-expect-error `rows` belongs to `table`, not to `rule`
block({ kind: "rule", id: "r", label: "x", rows: [] });

// **The historical case, and it is why the finding is ★★★.** Splitting
// `Comparison`'s verdict union removed this field from a public type. `tsc` came
// back clean across 175 files with eleven fixtures still supplying it — a
// narrowing that should have broken every producer broke none, because they all
// reach the type through here.
// @ts-expect-error `comparison` was removed from the type by F30's split
block({
  kind: "comparison",
  id: "c",
  rows: [{ field: "p99", a: "120ms", b: "98ms", verdict: "better" }],
  comparison: "same",
});

// **The control, and it is what makes the three above a claim.** A guard that
// rejected everything would satisfy every `@ts-expect-error` here and be
// useless — `tsc` fails on an *unused* expect-error, so this line failing to
// compile is caught too.
block({ kind: "rule", id: "r", label: "x" });

// **The stated blind spot, asserted so it cannot drift silently.** A nested
// literal is checked against `Block` itself, and excess-property checking
// against a *union* admits any key present in any member — so this is accepted
// today. Recorded as what the guard does *not* do; the day child positions take
// the guard too, this line starts failing and the comment is where to look.
block({
  kind: "panel",
  id: "p",
  title: "T",
  children: [{ kind: "rule", id: "nested", label: "x" }],
});
