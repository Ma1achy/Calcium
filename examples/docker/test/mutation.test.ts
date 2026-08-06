/**
 * The mutation family's document shapes — failure arms first.
 *
 * **Every arm here is reached by driving the handler, with a fake `ask` that
 * records what it was asked.** The confirm's *routing* is Calcium's and is tested
 * against a real router in `test/integration/confirm.test.ts`; what this file
 * owns is the app's half — which verbs ask, what the question says, and what the
 * document looks like on each of the four outcomes.
 *
 * The four outcomes, and three of them are not the happy path:
 *
 *   1. no such container      → `error`
 *   2. a no-op precondition   → `ok`, a warn notice, **and no question asked**
 *   3. declined               → `ok`, unchanged, and docker never invoked
 *   4. confirmed              → `ok`, and docker invoked exactly once
 */

import { describe, expect, it, vi } from "vitest";
import { createMutationHandler } from "../src/mutation.ts";
import type { AskOptions, LocalContext } from "@fmx/calcium";

const RUNNING = "/api-gateway\tnginx:alpine\trunning\ttrue\tfalse";
const STOPPED = "/api-gateway\tnginx:alpine\texited\tfalse\tfalse";
const PAUSED = "/api-gateway\tnginx:alpine\tpaused\ttrue\ttrue";

/** A runner whose inspect answer is scripted and whose other calls are recorded. */
function runnerFor(inspect: string | null) {
  const calls: string[][] = [];
  const runner = async (args: readonly string[]) => {
    calls.push([...args]);
    if (args[0] === "inspect") {
      if (inspect === null) throw new Error("No such object");
      return { stdout: inspect, stderr: "" };
    }
    return { stdout: "api-gateway\n", stderr: "" };
  };
  // Everything after the leading `inspect`, which every verb makes.
  const mutations = () => calls.filter((c) => c[0] !== "inspect");
  return { runner, calls, mutations };
}

function ctxWith(answer: string): LocalContext & { asked: AskOptions[] } {
  const asked: AskOptions[] = [];
  return {
    command: "/stop api-gateway",
    asked,
    ask: (opts: AskOptions) => {
      asked.push(opts);
      return Promise.resolve(answer);
    },
  } as LocalContext & { asked: AskOptions[] };
}

describe("the mutation family — failure arms first", () => {
  it("T1 (C04 I3): no such container is an error carrying `error`", async () => {
    const r = runnerFor(null);
    const doc = await createMutationHandler("stop", r.runner)(["nope"], ctxWith("y"));

    expect(doc.status).toBe("error");
    // C04 I3 — required when the status is `error`, and its absence is silent:
    // C13 throws and the reader gets no entry at all (F35).
    expect(doc.error?.message).toContain("no such container");
    expect(r.mutations()).toHaveLength(0);
  });

  it("T2: a missing argument is an error and never touches docker", async () => {
    const r = runnerFor(RUNNING);
    const doc = await createMutationHandler("stop", r.runner)([], ctxWith("y"));
    expect(doc.status).toBe("error");
    expect(doc.error?.message).toContain("usage:");
    expect(r.calls).toHaveLength(0);
  });

  it("T3: `/stop` on a stopped container does not ask and does not run", async () => {
    // **The measured far-side row that shaped the design.** `docker stop` on a
    // stopped container exits 0 and echoes the name, so without the state read
    // this arm reports a stop that never happened — and asks a question whose
    // answer changes nothing.
    const r = runnerFor(STOPPED);
    const ctx = ctxWith("y");
    const doc = await createMutationHandler("stop", r.runner)(["api-gateway"], ctx);

    expect(doc.status).toBe("ok");
    expect(JSON.stringify(doc.blocks)).toContain("already stopped");
    expect(ctx.asked).toHaveLength(0);
    expect(r.mutations()).toHaveLength(0);
  });

  it("T4: declining leaves the container alone and is not an error", async () => {
    const r = runnerFor(RUNNING);
    const ctx = ctxWith("n");
    const doc = await createMutationHandler("stop", r.runner)(["api-gateway"], ctx);

    expect(ctx.asked).toHaveLength(1);
    // **`ok`, not `error`.** Nothing failed; the user was asked and said no.
    expect(doc.status).toBe("ok");
    expect(JSON.stringify(doc.blocks)).toContain("unchanged");
    expect(r.mutations()).toHaveLength(0);
  });

  it("T5: confirming runs docker exactly once, with the verb and the ref", async () => {
    const r = runnerFor(RUNNING);
    const ctx = ctxWith("y");
    const doc = await createMutationHandler("stop", r.runner)(["api-gateway"], ctx);

    expect(doc.status).toBe("ok");
    expect(r.mutations()).toEqual([["stop", "api-gateway"]]);
    expect(JSON.stringify(doc.blocks)).toContain("stopped");
  });

  it("T6: the question carries a detail block naming what resolved", async () => {
    const r = runnerFor(RUNNING);
    const ctx = ctxWith("y");
    await createMutationHandler("stop", r.runner)(["api-gateway"], ctx);

    const q = ctx.asked[0]!;
    expect(q.question).toContain("api-gateway");
    // Ruling C's payload: the confirm shows the read that already happened, so
    // the user is not trusting that the name resolved to what they meant.
    expect(JSON.stringify(q.detail)).toContain("nginx:alpine");
    // For a destructive verb the safe option is the default (Ruling A).
    expect(q.choices.find((c) => c.default === true)?.key).toBe("n");
  });

  it("T7: the reversible verbs do not ask at all", async () => {
    for (const [verb, state] of [
      ["start", STOPPED],
      ["unpause", PAUSED],
    ] as const) {
      const r = runnerFor(state);
      const ctx = ctxWith("n"); // would decline if asked
      const doc = await createMutationHandler(verb, r.runner)(["api-gateway", "x"], ctx);

      expect(ctx.asked, `${verb} must not ask`).toHaveLength(0);
      expect(doc.status).toBe("ok");
      expect(r.mutations(), `${verb} must run`).toHaveLength(1);
    }
  });

  it("T8: `--force` skips the question and still runs", async () => {
    const r = runnerFor(RUNNING);
    const ctx = ctxWith("n");
    const doc = await createMutationHandler("stop", r.runner)(["api-gateway", "--force"], ctx);

    expect(ctx.asked).toHaveLength(0);
    expect(doc.status).toBe("ok");
    expect(r.mutations()).toEqual([["stop", "api-gateway"]]);
  });

  it("T9: `kill` names the signal, because that is what makes it not `stop`", async () => {
    const r = runnerFor(RUNNING);
    const ctx = ctxWith("y");
    await createMutationHandler("kill", r.runner)(["api-gateway"], ctx);
    expect(ctx.asked[0]!.question).toContain("SIGKILL");

    const r2 = runnerFor(RUNNING);
    const ctx2 = ctxWith("y");
    await createMutationHandler("kill", r2.runner)(["api-gateway", "--signal", "TERM"], ctx2);
    expect(ctx2.asked[0]!.question).toContain("SIGTERM");
    expect(r2.mutations()).toEqual([["kill", "--signal", "TERM", "api-gateway"]]);
  });

  it("T10: docker's stderr reaches the document rather than a generic message", async () => {
    const calls: string[][] = [];
    const runner = async (args: readonly string[]) => {
      calls.push([...args]);
      if (args[0] === "inspect") return { stdout: RUNNING, stderr: "" };
      throw Object.assign(new Error("x"), {
        stderr: "Error response from daemon: cannot stop container",
      });
    };
    const doc = await createMutationHandler("stop", runner)(["api-gateway"], ctxWith("y"));

    expect(doc.status).toBe("error");
    expect(doc.error?.message).toContain("Error response from daemon");
  });

  it("T11: `rename` needs two arguments and reports the new name", async () => {
    const r = runnerFor(RUNNING);
    const bad = await createMutationHandler("rename", r.runner)(["api-gateway"], ctxWith("y"));
    expect(bad.status).toBe("error");

    const r2 = runnerFor(RUNNING);
    const ctx = ctxWith("y");
    const doc = await createMutationHandler("rename", r2.runner)(["api-gateway", "edge"], ctx);
    expect(ctx.asked).toHaveLength(0);
    expect(r2.mutations()).toEqual([["rename", "api-gateway", "edge"]]);
    expect(JSON.stringify(doc.blocks)).toContain("edge renamed");
  });

  it("T12: every confirming verb refuses to act when declined", async () => {
    for (const verb of ["stop", "restart", "kill", "pause", "update"] as const) {
      const state = verb === "pause" ? RUNNING : RUNNING;
      const r = runnerFor(state);
      const ctx = ctxWith("n");
      await createMutationHandler(verb, r.runner)(["api-gateway"], ctx);

      expect(ctx.asked, `${verb} must ask`).toHaveLength(1);
      expect(r.mutations(), `${verb} must not run when declined`).toHaveLength(0);
    }
  });
});
