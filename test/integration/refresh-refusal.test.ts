// C23 I70 — a refused patch, from the public entry.
//
// **The contract rows construct the state and this one proves it is reported to
// a human.** `createRefreshDriver` takes the fault sink as a dependency, so
// every row that builds the driver itself supplies its own and passes on the day
// nothing in `src/` wires one — the shape a seam-level row fails in silently.
// What this asserts is the whole ladder: C04 refuses the patch, C23's `contain`
// records it, and C22 §8 step 3 prints it on the restored primary screen beside
// the capability warnings.
import { describe, expect, it } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import { buildSession } from "../support/session.js";
import { fakeStdin } from "../support/fake-terminal.js";
import type { ViewDocument } from "../../src/data/viewmodel/index.js";

const settle = async (turns = 4): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((r) => setImmediate(r));
};

const greetingOf = (blocks: ViewDocument["blocks"]): ViewDocument => ({
  schema: "tui.view/1",
  command: "/live",
  status: "ok",
  blocks,
  meta: {
    verb: "live",
    adapter: "live",
    exitCode: 0,
    durationMs: 0,
    truncated: false,
    argv: ["live"],
    stderr: "",
    transport: "local",
    origin: "refresh",
  },
});

describe("C23 I70 — a patch the document cannot take, from the public entry", () => {
  it("T4.69 (I70, I48, §8h H4): the refusal is on the restored screen, and the sibling kept polling", async () => {
    // **The child takes the panel's own id**, which is what a consumer writes by
    // accident (F373) and the only thing that makes C04 refuse a patch the shell
    // composed. Tick one lands; from tick two the id appears twice and there is
    // no correct target.
    let bad = 0;
    let good = 0;
    const s = await buildSession(
      {
        stdin: fakeStdin() as never,
        greeting: () =>
          greetingOf([
            b.live({
              id: "bad",
              title: "bad",
              every: 20,
              fetch: () => {
                bad += 1;
                return Promise.resolve(bad);
              },
              render: (n) => b.raw(`bad ${String(n)}`, { id: "bad" }),
              renderLoading: () => b.raw("bad -", { id: "bad-c" }),
            }),
            b.live({
              id: "good",
              title: "good",
              every: 20,
              fetch: () => {
                good += 1;
                return Promise.resolve(good);
              },
              render: (n) => b.raw(`good ${String(n)}`, { id: "good-c" }),
              renderLoading: () => b.raw("good -", { id: "good-c" }),
            }),
          ]),
      },
      { columns: 110, rows: 24 },
    );
    await settle();
    // Two clocks, and both have to move: the injected one decides `dueAt` and the
    // real one fires the timer (T4.4a's note).
    for (let i = 0; i < 5; i += 1) {
      s.clock.advance(50);
      await new Promise((r) => setTimeout(r, 30));
      await settle();
    }

    expect(bad, "the part that cannot land stops rather than polling forever").toBeLessThan(good);
    expect(good, "the control: its sibling kept its cadence").toBeGreaterThan(2);

    await s.tui.stop("exit");
    const written = s.stdout.chunks.join("");
    // **The message C04 returned, at the one place that could report it.** Before
    // the ruling this line did not exist: the outcome was read as a boolean, the
    // host was released, and the panel drew its first value for the rest of the
    // session with nothing anywhere saying why.
    expect(written, "the diagnosis reaches the reader on the primary screen").toContain(
      'live part "bad": id "bad" appears more than once in the document (C04 I14)',
    );
  });
});
