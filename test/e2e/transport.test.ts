// C06 tier 5 — e2e. Real subprocesses, which means C21, which is not built.
//
// Nothing here is written against a fake: the value of this tier is entirely in
// the interaction with the OS, and a tier-5 test that mocks the process has
// moved to tier 3 without saying so.
import { describe, it } from "vitest";

describe("C06 e2e", () => {
  it.todo("T5.1: a real binary emitting a large document → parsed and rendered within budget — waits on C21 and C22");
  it.todo("T5.2: a real streaming binary at 1,000 lines/s for sixty seconds → no memory growth, no dropped end — waits on C21");
  it.todo("T5.3: Ctrl-C during a real long-running verb → the child dies within the ladder's bounds and partial output survives — waits on C21 and L4");
  it.todo("T5.4: killing the far side externally mid-invocation → end with signal, guard released, session survives — waits on C21 and C22");
  it.todo("T5.5: one session running one verb on fixtures and another on a real binary, interleaved — waits on C21 and C22");
  it.todo("T5.6: the whole suite with the fixture transport and no far side installed — the standalone-build guarantee — waits on C22");
});
