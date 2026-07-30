// C04 tier 5 — e2e. A real session, a real terminal, real widths.
//
// Every one of C04's tier-5 tests is a *drift* test: does the number the
// measurer returned match the rows the terminal actually shows? That needs a
// render tree, a viewport and a PTY. C09 built the first, so these three now
// wait on the viewport and the shell, which is what they were always waiting
// for: a registry measures a block, and only a viewport can drift.
//
// This file is therefore entirely deferred, and that is the honest state rather
// than a gap. A tier-5 file asserting something else would look like coverage.
import { describe, it } from "vitest";

describe("C04 e2e — the drift tests", () => {
  it.todo(
    "T5.1: a real session scrolls a 10,000-block transcript top to bottom; every block's on-screen row count matches its measured height, sampled at every screenful — the drift test — waits on C14 and L4",
  );
  it.todo(
    "T5.2: the same, at four terminal widths, with a resize between passes — waits on C14 and L4",
  );
  it.todo(
    // C13 landed and this no longer waits on it: the store applies the merges
    // today (C13 T4.1b asserts the row identity half). What is left is entirely
    // the viewport's — "does not jump" and "stays put" are claims about scroll
    // position, and there is nothing yet to hold one.
    "T5.3: a --watch stream applying merge patches for sixty seconds — the viewport does not jump, and an expanded row stays expanded and stays put — waits on C14 and L4",
  );
});
