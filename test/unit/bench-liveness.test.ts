// The bench's liveness guard, verified — group 9, instrument 3 of 15.
//
// The guard is what stands between a timing number and a blank screen, and it
// had a defect of its own: the label said `patch lines` during a `logs` run.
// **Every fabrication below is the real occasion** (A03 commitment 14a), and
// each is transcribed from the comment the script carries above the line it
// broke.
import { describe, expect, it } from "vitest";

import { gutter, liveness, MIN_ROWS, samplesLive } from "../../tools/bench/liveness.mjs";

/** A screen with a document on it: `value` is the kind-agnostic body marker. */
const live = (n: number): string[] => [
  "docker-tui",
  ...Array.from({ length: n }, (_, i) => `  ${String(i)} | const value = ${String(i)};`),
  "",
  "",
];

describe("bench liveness", () => {
  it("BL1: the line names the kind that ran — the defect, restored", () => {
    // **The measured instance.** The marker is deliberately kind-agnostic so one
    // guard serves both fixtures, and the label beside it was the literal word
    // `patch`. A `logs` run therefore reported `patch lines` — the one line whose
    // whole job is to say the fixture responded, describing a document that had
    // not been built. Nothing about the output looked wrong.
    const { line, dead } = liveness(live(9), { marker: "value", kind: "logs" });

    expect(dead).toBe(false);
    expect(line).toContain("9 of them logs lines");
    expect(line, "the word the label used to be").not.toContain("patch");
  });

  it("BL2: and it is not a `logs` special case — the kind is carried through", () => {
    // BL1 alone passes against a label that hardcodes `logs`, which is the same
    // defect with a different constant. Two kinds through one call site is what
    // makes the row about the parameter rather than about a word.
    expect(liveness(live(9), { marker: "value", kind: "patch" }).line).toContain(
      "of them patch lines",
    );
  });

  it("BL3: a blank screen is dead, and that is the reading it exists to refuse", () => {
    // The first draft of `frame.mjs` handed the greeting a six-field `meta`, C04
    // refused the document, two bare catches swallowed it, and the bench
    // reported timings for a blank screen — flat across 100, 5,000 and 50,000
    // lines, which is the only reason it was noticed.
    const { dead, line, content, body } = liveness([" ", "", "  "], {
      marker: "value",
      kind: "patch",
    });

    expect(dead).toBe(true);
    expect([content, body]).toEqual([0, 0]);
    expect(line).toContain("FIXTURE DEAD");
    expect(line, "and it says why nothing below would mean anything").toContain(
      "did not reach the transcript",
    );
  });

  it("BL4: a bordered but empty screen is dead too — rows are not content", () => {
    // The failure between BL1 and BL3, and the one a non-blank-row count alone
    // would pass: a frame drew, the chrome is on it, and the document is not.
    // `content` is well over the floor and `body` is zero.
    const chrome = ["┌────────┐", "│        │", "│        │", "│        │", "└────────┘", "> "];

    const { dead, content, body } = liveness(chrome, { marker: "value", kind: "patch" });

    expect(content, "six rows of chrome clears the content floor").toBeGreaterThanOrEqual(
      MIN_ROWS,
    );
    expect(body).toBe(0);
    expect(dead, "and the body count is what decides it").toBe(true);
  });

  it("BL5: the floor is a floor — one row below and one row above it", () => {
    expect(liveness(live(MIN_ROWS - 1), { marker: "value", kind: "patch" }).dead).toBe(true);
    expect(liveness(live(MIN_ROWS), { marker: "value", kind: "patch" }).dead).toBe(false);
  });

  it("BL6: two dead panels agree perfectly, which is why ticks are counted", () => {
    // The pollers bench reads two samples from one frame and compares them. A
    // part that never ticked prints its loading `-`, so *both* dead reads as
    // exact agreement — a stronger-looking result than the live one.
    expect(samplesLive(["ALPHA sample -", "BETA sample -"], 4).dead).toBe(true);
    expect(samplesLive(["ALPHA sample 12.5", "BETA sample 12.5"], 0).dead, "no fetches").toBe(
      true,
    );
    expect(samplesLive(["ALPHA sample 12.5"], 4).dead, "one part of two").toBe(true);

    const ok = samplesLive(["ALPHA sample 12.5", "BETA sample 13.0"], 4);
    expect(ok.dead).toBe(false);
    expect(ok.samples).toEqual(["12.5", "13.0"]);
  });

  it("BL7: agreement is not deadness — the live pair may hold the same number", () => {
    // The row BL6 would have made vacuous on its own. F91's correctness half
    // asks whether two views of one source report different numbers, so a guard
    // that treated agreement as death would answer the question by refusing it.
    const agreeing = samplesLive(["ALPHA sample 12.5", "BETA sample 12.5"], 4);

    expect(agreeing.dead).toBe(false);
    expect(agreeing.samples).toEqual(["12.5", "12.5"]);
  });

  it("BL8: a drifted gutter fails rather than marking the output", () => {
    // **The window bench's third guard, and it used to only print.** Two of that
    // file's three exit; this one appended `← DRIFT` to a line and left it to a
    // reader. It is the more serious of the three: an empty window is obviously
    // nothing, and a drifted one is a plausible number for a path that is not
    // the one under test — C25 I21a's pin is the whole reason the bench exists.
    const bad = gutter(3, 4);

    expect(bad.drift).toBe(true);
    expect(bad.line).toContain("GUTTER DRIFT");
    expect(bad.line, "and it says why the number below is not the answer").toContain(
      "timing below is of something else",
    );

    const ok = gutter(4, 4);
    expect(ok.drift).toBe(false);
    expect(ok.line, "the quiet form still reports both widths").toBe(
      "gutter: window 4, block 4",
    );
  });
});
