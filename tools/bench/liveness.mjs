// Is the fixture responding, and does the line that says so name what ran?
//
// **Extracted because the line lied and nothing could have caught it.** The
// bench's liveness marker is deliberately kind-agnostic — `value` appears in
// both the patch and the logs fixture — and the label beside it was the literal
// word `patch`, so a `logs` run reported `N of them patch lines`. The one line
// whose entire job is to tell the reader the fixture responded was describing a
// document the run had not built.
//
// Inline in the script, that defect is unreachable: reading it requires running
// the bench, and the bench is the thing under suspicion. Here it is a function
// over rows, so `logs` in and `patch` out is one assertion.
//
// **What this does not do.** It does not decide whether the numbers are any
// good — nothing here is a threshold, and Group 12's rule stands. It answers
// the prior question, which is whether there was a screen at all: the first
// draft of `frame.mjs` handed the greeting a six-field `meta`, C04 refused the
// document, two bare catches swallowed it, and the bench reported timings for a
// blank screen — flat across 100, 5,000 and 50,000 lines.

/** Enough rows to be a document rather than a border. */
export const MIN_ROWS = 5;

/**
 * @param {readonly string[]} rows   the screen, as `screenRows` returns it
 * @param {{marker: string, kind: string, min?: number}} opts
 *   `marker` is the text a body row carries — the *body*, not the path header,
 *   because the viewport follows the tail and the header is thousands of rows
 *   above what is on screen. `kind` is what the run actually built.
 */
export function liveness(rows, { marker, kind, min = MIN_ROWS }) {
  const content = rows.filter((r) => r.trim() !== "").length;
  const body = rows.filter((r) => r.includes(marker)).length;
  const dead = body < min || content < min;
  return {
    content,
    body,
    dead,
    line: dead
      ? `FIXTURE DEAD: ${String(content)} non-blank rows, ${String(body)} ${kind} lines on screen.\n` +
        "The document did not reach the transcript. Nothing below would mean anything."
      : `fixture live: ${String(content)} non-blank rows, ${String(body)} of them ${kind} lines`,
  };
}

/**
 * The pollers bench asks a different question of the same screen: did the parts
 * *tick*. A part that never ticked prints its loading `-`, and two dead panels
 * agree perfectly — which is the reading the guard exists to refuse.
 *
 * @param {readonly string[]} rows
 * @param {number} ticks  fetches counted in the window
 * @param {number} expected  how many parts should have reported
 */
export function samplesLive(rows, ticks, expected = 2) {
  const samples = rows.flatMap((r) => {
    const m = /sample\s+(\S+)/.exec(r);
    return m === null ? [] : [m[1]];
  });
  const dead = ticks === 0 || samples.length !== expected || samples.includes("-");
  return {
    samples,
    dead,
    line: dead
      ? `FIXTURE DEAD: ${String(ticks)} fetches, samples ${JSON.stringify(samples)}.\n` +
        "The parts did not tick. Nothing below would mean anything."
      : `fixture live: ${String(ticks)} fetches in the window`,
  };
}
