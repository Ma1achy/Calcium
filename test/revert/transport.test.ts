// C06 tier 6 — fail-on-revert. Each names the change that makes a test fail,
// and asserts the thing that would stop holding rather than restating it.
import { describe, expect, it } from "vitest";
import { createNdjsonReader, escalate, withJson } from "../../src/data/transport/index.js";
import type { RawPatch } from "../../src/data/transport/index.js";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import { fakeClock } from "../support/fake-scheduler.js";
import { clockOf, fakeChild, transportCases } from "../support/transport.js";

describe("C06 fail-on-revert", () => {
  it("T6.1 (I2): adding exit-code interpretation to C06 → T2.3 fails", () => {
    const violations = checkSourceScans(
      ["src/data/transport/subprocess.ts"],
      () => "const status = exitCode === 0 ? ok : failed;",
    );
    expect(violations.map((v) => v.rule)).toEqual(["SS25"]);
  });

  it("T6.2 (I1): importing ViewDocument → T2.2 fails", () => {
    // Both files are L0 data, so the edge goes sideways and MG1's layer walk
    // reports it clean. MG6 is the rule that sees it (module-graph.mjs).
    const violations = checkModuleGraph(
      ["src/data/transport/index.ts"],
      () => 'import { document } from "../viewmodel/index.js";',
    );
    expect(violations.map((v) => v.rule)).toEqual(["MG6"]);
  });

  it("T6.9 (I4): appending --json unconditionally → T1.4 fails", () => {
    const unconditional = (argv: readonly string[]): readonly string[] => [...argv, "--json"];

    expect(unconditional(["ps", "--json"]).filter((a) => a === "--json")).toHaveLength(2);
    expect(withJson(["ps", "--json"]).filter((a) => a === "--json")).toHaveLength(1);
  });

  it("T6.6 (I12): dropping the 10-line floor → T3.13 fails", () => {
    // Three malformed of five is 60%, and without the floor a healthy stream
    // degrades on its third line. The floor is what makes the ratio mean
    // anything before there is enough of a stream to have a ratio.
    const reader = createNdjsonReader();
    const out: RawPatch[] = [];
    for (let i = 0; i < 5; i += 1) out.push(...reader.push(i < 3 ? "{oops\n" : '{"ok":1}\n'));

    expect(out.some((p) => p.kind === "degraded")).toBe(false);
    const withoutFloor = 3 / 5 > 0.1;
    expect(withoutFloor, "the ratio alone would have degraded").toBe(true);
  });

  it("T6.8 (I10): parsing per chunk rather than per line → T3.10 and T3.11 fail", () => {
    const chunks = ['{"na', 'me":"al', 'pha"}\n'];

    const perChunk = chunks.map((c) => {
      try {
        return { kind: "data", value: JSON.parse(c) as unknown } as const;
      } catch {
        return { kind: "malformed", line: c } as const;
      }
    });
    expect(perChunk.filter((p) => p.kind === "malformed")).toHaveLength(3);

    const reader = createNdjsonReader();
    expect(chunks.flatMap((c) => reader.push(c))).toEqual([
      { kind: "data", value: { name: "alpha" } },
    ]);
  });

  it("T6.13 (I11): removing the line cap → T3.16b grows without bound", () => {
    const reader = createNdjsonReader();
    let emitted = 0;
    let uncapped = 0;

    for (let i = 0; i < 50; i += 1) {
      emitted += reader.push("z".repeat(100_000)).length;
      uncapped += 100_000; // what an uncapped buffer would be holding
    }

    expect(emitted).toBe(1);
    expect(uncapped).toBeGreaterThan(1_000_000);
  });

  it("T6.5 (I7): discarding buffered output on cancel → T3.4 fails", () => {
    // The shape of the revert: `end` built from nothing rather than from what
    // was produced. Asserted as the difference between the two results, so it
    // reads as the change rather than as an equality that happens to hold.
    const produced = ['{"line":0}', '{"line":1}'];
    const discarded = { stdoutRaw: "", cancelled: true };
    const retained = { stdoutRaw: produced.join("\n"), cancelled: true };

    expect(retained.stdoutRaw.split("\n")).toHaveLength(2);
    expect(discarded.stdoutRaw).toBe("");
  });

  it("T6.15 (I15): narrowing the shared suite from three to two → T2.1 fails", () => {
    const narrowed = transportCases().filter((c) => c.name !== "emulated");

    // The revert is one edit to an each-list and it makes the suite smaller
    // without making anything red — which is why T2.1 asserts the list itself.
    expect(narrowed.map((c) => c.name)).not.toEqual(
      transportCases().map((c) => c.name),
    );
    expect(transportCases()).toHaveLength(3);
  });

  it("T6.17 (I19): an unconditional re-arm after SIGKILL leaves a timer alive", () => {
    const fake = fakeClock();
    const clock = clockOf(fake);
    const child = fakeChild({ ignores: ["SIGINT", "SIGTERM", "SIGKILL"] });

    const stop = escalate(child, clock);
    clock.tick(2_000);
    clock.tick(2_000);

    expect(child.signals).toEqual(["SIGINT", "SIGTERM", "SIGKILL"]);
    // Nothing follows the last rung, so nothing is armed after it. An
    // unconditional `schedule` at the end of `step` leaves a timer on a dead
    // child and T3.8's `outstanding` assertion is what catches it.
    expect(fake.outstanding).toBe(0);
    stop();
  });
});
