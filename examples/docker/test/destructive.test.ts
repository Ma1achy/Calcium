/**
 * The destructive family — Ruling C's weight, and the arms that must not run.
 *
 * **Nothing in this file touches a real daemon.** Every runner is scripted. The
 * live checks are frame-reads, and they use `dtui-throwaway-*` containers that
 * the test creates and removes — never the standing `dtui-fixture-*` set, and
 * never a bare `prune`. `examples/docker/Makefile` carries the two-prefix rule
 * and `make throwaway-sweep` clears what a crashed run left.
 *
 * The order below is the order that matters: the arms where **nothing should
 * happen** come first, because those are the ones a green suite is least likely
 * to be about.
 */

import { describe, expect, it } from "vitest";
import {
  createPruneHandler,
  createRmHandler,
  createRmiHandler,
} from "../src/destructive.ts";
import type { AskOptions, LocalContext } from "@fmx/calcium";

const RUNNING = "/api-gateway\tnginx:alpine\trunning\ttrue\tfalse";
const STOPPED = "/api-gateway\tnginx:alpine\texited\tfalse\tfalse";

function ctxWith(answer: string): LocalContext & { asked: AskOptions[] } {
  const asked: AskOptions[] = [];
  return {
    command: "/rm api-gateway",
    asked,
    ask: (opts: AskOptions) => {
      asked.push(opts);
      return Promise.resolve(answer);
    },
  } as LocalContext & { asked: AskOptions[] };
}

/** `script` maps a leading argv token to stdout, or throws what it is given. */
function runnerFor(script: Record<string, string | Error>) {
  const calls: string[][] = [];
  const runner = async (args: readonly string[]) => {
    calls.push([...args]);
    const key = args[0] === "inspect" ? "inspect" : args.slice(0, 2).join(" ");
    const one = script[key] ?? script[args[0]!];
    if (one instanceof Error) throw one;
    return { stdout: one ?? "", stderr: "" };
  };
  return { runner, calls };
}

const conflict = (msg: string) => Object.assign(new Error("x"), { stderr: msg });

/**
 * The removal call — the one that carries `--force`.
 *
 * **Twice wrong before this, and both were vacuous rather than failing.** First
 * `c[1] === "prune"`, which matches `volume prune` and never matches `/prune`,
 * so three `toHaveLength(0)` assertions passed against something that could not
 * match. Then a match on the manifest verb, which broke the moment `/prune`
 * correctly started spawning `docker container prune`.
 *
 * Both were positional guesses about an argv this file does not own. The
 * removal is the call with `--force` in it; the listings never carry one. That
 * is a property of the thing rather than of its shape.
 */
const removalCallsIn = (calls: readonly (readonly string[])[]) =>
  calls.filter((c) => c.includes("--force"));

describe("destructive — the arms where nothing should happen", () => {
  it("T1: declining `/rm` removes nothing", async () => {
    const r = runnerFor({ inspect: STOPPED, rm: "api-gateway\n" });
    const ctx = ctxWith("n");
    const doc = await createRmHandler(r.runner)(["api-gateway"], ctx);

    expect(ctx.asked).toHaveLength(1);
    expect(doc.status).toBe("ok");
    expect(r.calls.filter((c) => c[0] === "rm")).toHaveLength(0);
  });

  it("T2 (Ruling C): a prune with nothing to take does not ask at all", async () => {
    // The zero case is a ruling, not an optimisation: a confirm for an operation
    // with no effect trains people to answer without reading.
    const r = runnerFor({ ps: "" });
    const ctx = ctxWith("y");
    const doc = await createPruneHandler("prune", r.runner)([], ctx);

    expect(ctx.asked).toHaveLength(0);
    expect(doc.status).toBe("ok");
    expect(JSON.stringify(doc.blocks)).toContain("nothing to remove");
    expect(removalCallsIn(r.calls)).toHaveLength(0);
  });

  it("T3: declining a prune with twenty items removes nothing", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `c${String(i)}\tExited (0)`).join("\n");
    const r = runnerFor({ ps: many });
    const ctx = ctxWith("n");
    const doc = await createPruneHandler("prune", r.runner)([], ctx);

    expect(ctx.asked).toHaveLength(1);
    expect(doc.status).toBe("ok");
    expect(removalCallsIn(r.calls)).toHaveLength(0);
  });

  it("T4: a listing that fails does not become 'nothing to remove'", async () => {
    // **The arm that would otherwise report an empty set about a question never
    // asked.** An error here is not a reason to refuse the verb, but it is a
    // reason not to claim the set is empty.
    const r = runnerFor({ ps: new Error("daemon unreachable") });
    const ctx = ctxWith("y");
    const doc = await createPruneHandler("prune", r.runner)([], ctx);

    expect(doc.status).toBe("error");
    expect(ctx.asked).toHaveLength(0);
    expect(removalCallsIn(r.calls)).toHaveLength(0);
  });
});

describe("destructive — Ruling C's weight", () => {
  it("T5: the question carries the whole list, not a count", async () => {
    const r = runnerFor({ ps: "alpha\tExited (0)\nbeta\tExited (137)" });
    const ctx = ctxWith("y");
    await createPruneHandler("prune", r.runner)([], ctx);

    const q = ctx.asked[0]!;
    expect(q.question).toContain("2 stopped containers");
    // A count is a number to agree with; a list is something a reader can find a
    // name they did not expect in.
    const detail = JSON.stringify(q.detail);
    expect(detail).toContain("alpha");
    expect(detail).toContain("beta");
  });

  it("T6: `--filter` reaches the listing as well as the prune", async () => {
    // Without this the question shows a set the prune will not take — a confirm
    // that is wrong about its own subject, which is worse than showing nothing.
    const r = runnerFor({ ps: "alpha\tExited (0)" });
    const ctx = ctxWith("y");
    await createPruneHandler("prune", r.runner)(["--filter", "label=dtui-test"], ctx);

    const listing = r.calls.find((c) => c[0] === "ps")!;
    expect(listing).toContain("label=dtui-test");
    const prune = removalCallsIn(r.calls)[0]!;
    expect(prune).toContain("label=dtui-test");
  });

  it("T6b: each prune kind spawns the docker command that actually exists", async () => {
    // **`docker prune` is not a command.** Deriving the argv from the manifest
    // verb by splitting on a space gets three of four right and produces
    // `docker prune` for `/prune`, which exits with a usage error — after the
    // listing has succeeded and the confirm has shown the correct set. The frame
    // found it; nothing here could, because the scripted runner takes any argv.
    // So this row asserts the argv rather than the outcome.
    const expected: Record<string, readonly string[]> = {
      prune: ["container", "prune"],
      "volume prune": ["volume", "prune"],
      "network prune": ["network", "prune"],
      "system prune": ["system", "prune"],
    };
    for (const [kind, head] of Object.entries(expected)) {
      const r = runnerFor({ ps: "alpha\tx", volume: "v\tvolume", network: "n\tnetwork", images: "i\timage" });
      await createPruneHandler(kind as never, r.runner)([], ctxWith("y"));
      const call = r.calls.find((c) => c.includes("--force"));
      expect(call?.slice(0, 2), `/${kind} must spawn \`docker ${head.join(" ")}\``).toEqual([...head]);
    }
  });

  it("T7: singular and plural, because a confirm reading '1 containers' is not read", async () => {
    const r = runnerFor({ ps: "alpha\tExited (0)" });
    const ctx = ctxWith("n");
    await createPruneHandler("prune", r.runner)([], ctx);
    expect(ctx.asked[0]!.question).toContain("1 stopped container?");
  });
});

describe("destructive — the refusal, passed through and offered", () => {
  it("T8 (B03): `/rm` on a running container keeps docker's words and offers a fill", async () => {
    const said =
      'cannot remove container "api-gateway": container is running: stop the container before removing or force remove';
    const r = runnerFor({ inspect: RUNNING, rm: conflict(said) });
    const doc = await createRmHandler(r.runner)(["api-gateway"], ctxWith("y"));

    expect(doc.status).toBe("error");
    // Verbatim — docker's sentence names the remedy better than a rewrite.
    expect(doc.error?.message).toBe(said);

    const blocks = JSON.stringify(doc.blocks);
    expect(blocks).toContain('"kind":"fill"');
    expect(blocks).toContain("/rm api-gateway --force");
    // `fill`, not `exec`: force-removing a running container is a decision taken
    // at a prompt the user can still edit, not a button.
    expect(blocks).not.toContain('"kind":"exec"');
  });

  it("T9: `--force` skips the question and reaches docker with the flag", async () => {
    const r = runnerFor({ inspect: RUNNING, rm: "api-gateway\n" });
    const ctx = ctxWith("n");
    const doc = await createRmHandler(r.runner)(["api-gateway", "--force"], ctx);

    expect(ctx.asked).toHaveLength(0);
    expect(doc.status).toBe("ok");
    expect(r.calls.find((c) => c[0] === "rm")).toEqual(["rm", "--force", "api-gateway"]);
  });

  it("T10 (F66): `rmi` untagging is reported as untagged, not as removed", async () => {
    // The measured split that amended F66: removing a non-last tag exits 0 and
    // says `Untagged:`, leaving the blob. Reporting that as "removed" would be a
    // claim the daemon did not make.
    const r = runnerFor({ rmi: "Untagged: dtui-probe-tag:v1\n" });
    const doc = await createRmiHandler(r.runner)(["dtui-probe-tag:v1"], ctxWith("y"));

    expect(doc.status).toBe("ok");
    expect(JSON.stringify(doc.blocks)).toContain("untagged");
    expect(JSON.stringify(doc.blocks)).not.toContain("dtui-probe-tag:v1 removed");
  });

  it("T11 (F66): and the last tag of an in-use image refuses, with a fill", async () => {
    const said =
      "conflict: unable to delete alpine:latest (must be forced) - container 3895a65310a1 is using its referenced image";
    const r = runnerFor({ rmi: conflict(said) });
    const doc = await createRmiHandler(r.runner)(["alpine:latest"], ctxWith("y"));

    expect(doc.status).toBe("error");
    expect(doc.error?.message).toBe(said);
    expect(JSON.stringify(doc.blocks)).toContain("/rmi alpine:latest --force");
  });

  it("T12: `system prune` asks about the union and labels each row's kind", async () => {
    const r = runnerFor({
      ps: "alpha\tcontainer",
      network: "kind\tnetwork",
      images: "sha256abc\tdangling image",
    });
    const ctx = ctxWith("n");
    await createPruneHandler("system prune", r.runner)([], ctx);

    const detail = JSON.stringify(ctx.asked[0]!.detail);
    for (const word of ["alpha", "container", "kind", "network", "dangling image"]) {
      expect(detail, `the union must name ${word}`).toContain(word);
    }
  });
});
