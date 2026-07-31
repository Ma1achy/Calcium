// C19 tier 5 — e2e. Completing at a real prompt in a real terminal.
//
// Every one of these needs a running shell: a frame to type into, a prompt at a
// real screen position for the menu to anchor against, and a terminal to show
// the spinner in. That is L4, and `LAYER_SOURCES` maps it to
// `src/shell/session.ts`, so these expire on the commit that makes it real
// rather than waiting for someone to remember them.
//
// **The properties themselves are not deferred**, and that is the reason this
// file is a list of blockers rather than a gap. Each one is asserted at tiers 1
// to 4 against the engine; what waits here is the half that can only be seen
// from outside.
//
//   - T5.1's enum values and their insertion are T1.6 and T1.15b.
//   - T5.2's discard-the-late-result is §8a trace 1, T3.10 and T6.1b, and the
//     spinner threshold is T3.9b — the part that needs a terminal is that the
//     spinner is *visible* in the prompt while typing stays responsive.
//   - T5.3's flip is T4.4, against a real C15 in a twenty-row region. What is
//     missing is a prompt actually near the bottom of a real screen.
//   - T5.4's filesystem candidates are the `pathSource` cases in tier 3, over
//     the injected reader (I17). Tier 5 is where the reader is the real one.
//   - T5.5's one-invocation-then-two is T3.8 on a fake clock.
import { describe, it } from "vitest";

describe("C19 tier 5 — at a real prompt", () => {
  it.todo(
    "T5.1: typing `/ps --status=` and pressing Tab → the statuses appear, arrow-selectable, Enter inserts — waits on L4",
  );
  it.todo(
    "T5.2: a dynamic source with a 2-second delay → the spinner appears at 500 ms, typing continues freely, and the late result never touches the buffer — waits on L4",
  );
  it.todo(
    "T5.3: Tab near the bottom of the terminal → the menu flips above the prompt and shows every candidate — waits on L4",
  );
  it.todo(
    "T5.4: completing a path with `ls ` and Tab → filesystem candidates from the real reader, not verbs — waits on L4",
  );
  it.todo(
    "T5.5: sixty seconds of repeated Tab on one dynamic slot → one source invocation, then a second after expiry — waits on L4",
  );
});
