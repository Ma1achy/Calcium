/**
 * The file-transfer tail. **The guard comes first**, because it is the only
 * behaviour here a green suite would not otherwise be about.
 */

import { describe, expect, it } from "vitest";
import { createTransferHandler } from "../src/transfer.ts";
import type { LocalContext } from "@fmx/calcium";

import { localContext } from "@fmx/calcium/testing";
// **The cast is gone with the hand-built context.** It read
// `as unknown as LocalContext`, which satisfied the type by erasure — the
// double narrower than the interface it stands for, which is the shape that
// cost four diagnoses in this tree. `localContext()` is the real record.
const ctx: LocalContext = { ...localContext(), command: "/save x", ask: () => Promise.resolve("y") };

function runnerFor(stdout = "") {
  const calls: string[][] = [];
  return {
    calls,
    runner: async (args: readonly string[]) => {
      calls.push([...args]);
      return { stdout, stderr: "" };
    },
  };
}

describe("transfer — the guard", () => {
  it("T1: `/save` with no --output refuses and never spawns", async () => {
    // Measured: `docker save` with no `-o` writes a multi-megabyte tar to
    // stdout. A transcript is not a pipe.
    const r = runnerFor();
    const doc = await createTransferHandler("save", r.runner)(["nginx:alpine"], ctx);

    expect(doc.status).toBe("error");
    expect(r.calls, "nothing may be spawned").toHaveLength(0);
    const json = JSON.stringify(doc.blocks);
    expect(json).toContain("transcript");
    // And it offers the invocation that works, as a fill.
    expect(json).toContain("--output");
    expect(json).toContain('"kind":"fill"');
  });

  it("T2: `/export` carries the same guard", async () => {
    const r = runnerFor();
    const doc = await createTransferHandler("export", r.runner)(["api"], ctx);
    expect(doc.status).toBe("error");
    expect(r.calls).toHaveLength(0);
  });

  it("T3: with --output it runs, and `-o` counts too", async () => {
    for (const flag of [["--output", "/tmp/x.tar"], ["-o", "/tmp/x.tar"], ["--output=/tmp/x.tar"]]) {
      const r = runnerFor();
      const doc = await createTransferHandler("save", r.runner)(["nginx", ...flag], ctx);
      expect(doc.status, flag.join(" ")).toBe("ok");
      expect(r.calls).toHaveLength(1);
    }
  });

  it("T4: `/load` needs --input, because it cannot read a terminal", async () => {
    const r = runnerFor();
    const doc = await createTransferHandler("load", r.runner)([], ctx);
    expect(doc.status).toBe("error");
    expect(r.calls).toHaveLength(0);
  });
});

describe("transfer — silence is the success case", () => {
  it("T5: `/cp` prints nothing and still reports what it did", async () => {
    // Three of these six emit no output at all when they work, so a handler
    // reporting stdout would report an empty document for every success.
    const r = runnerFor("");
    const doc = await createTransferHandler("cp", r.runner)(["c:/etc/hostname", "/tmp/h"], ctx);
    expect(doc.status).toBe("ok");
    expect(JSON.stringify(doc.blocks)).toContain("copied");
  });

  it("T6: `/commit` shows the digest it made, which is its only output", async () => {
    const r = runnerFor("sha256:de2b8d1890f290f972d1fcb90006f2860076f6c85bb0a2a4e1c450a6c22fa8dc\n");
    const doc = await createTransferHandler("commit", r.runner)(["api", "snap:v1"], ctx);
    expect(doc.status).toBe("ok");
    expect(JSON.stringify(doc.blocks)).toContain("sha256:de2b8d1890");
  });

  it("T7: a missing positional never spawns", async () => {
    const r = runnerFor();
    const doc = await createTransferHandler("cp", r.runner)(["only-one"], ctx);
    expect(doc.status).toBe("error");
    expect(JSON.stringify(doc.blocks)).toContain("usage:");
    expect(r.calls).toHaveLength(0);
  });

  it("T8: a flag's value is not counted as a positional", async () => {
    // `--output /tmp/x.tar` is two tokens and neither is the image.
    const r = runnerFor();
    const doc = await createTransferHandler("save", r.runner)(["--output", "/tmp/x.tar"], ctx);
    expect(doc.status, "no image was given").toBe("error");
    expect(JSON.stringify(doc.blocks)).toContain("usage:");
  });

  it("T9: docker's own message survives a failure", async () => {
    const runner = async () => {
      throw Object.assign(new Error("x"), {
        stderr: "Error response from daemon: Could not find the file /nope in container c",
      });
    };
    const doc = await createTransferHandler("cp", runner)(["c:/nope", "/tmp/x"], ctx);
    expect(doc.status).toBe("error");
    expect(doc.error?.message).toContain("Could not find the file");
  });
});
