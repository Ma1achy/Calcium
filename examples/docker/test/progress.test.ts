/**
 * `pull` `push` `build` — parsed from what the far side was measured to emit.
 *
 * Every fixture line below was copied out of a real run, not written from the
 * documentation: `docker build --progress=rawjson` on a three-line Dockerfile,
 * cold and warm, and `docker pull busybox:musl` piped.
 *
 * **The failure arms come first**, and the two that matter are the ones a green
 * suite is least likely to be about: a build whose step fails, and a pull of an
 * image that does not exist.
 */

import { describe, expect, it } from "vitest";
import {
  createProgressHandler,
  feedBuildLine,
  feedPullLine,
  renderBuild,
  renderPull,
  type Progress,
} from "../src/progress.ts";
import type { Block, LocalContext } from "@fmx/calcium";

const fresh = (): Progress => ({
  steps: new Map(),
  layers: new Map(),
  lines: [],
  done: false,
  failed: false,
  summary: "",
});

const ctx = { command: "/build .", ask: () => Promise.resolve("y") } as unknown as LocalContext;

/** The first `table` block anywhere in a tree, so an assertion can read cells. */
function findTable(block: Block): Extract<Block, { kind: "table" }> {
  if (block.kind === "table") return block;
  const kids = (block as { children?: readonly Block[] }).children ?? [];
  for (const k of kids) {
    try {
      return findTable(k);
    } catch {
      continue;
    }
  }
  throw new Error("no table in this block tree");
}

/** Measured: a cold build of `FROM busybox / RUN echo one / RUN echo two`. */
const COLD = [
  '{"vertexes":[{"digest":"sha256:9b","name":"[internal] load build definition from Dockerfile","started":"2026-08-06T11:13:41.245094Z"}]}',
  '{"vertexes":[{"digest":"sha256:a1","name":"[2/3] RUN echo one > /one","started":"2026-08-06T11:13:42.000Z"}]}',
  '{"vertexes":[{"digest":"sha256:a1","name":"[2/3] RUN echo one > /one","started":"2026-08-06T11:13:42.000Z","completed":"2026-08-06T11:13:42.500Z"}]}',
  '{"statuses":[{"id":"transferring dockerfile:","vertex":"sha256:9b","current":29}]}',
];

/** Measured: the same build warm. `cached` is the only signal. */
const WARM = [
  '{"vertexes":[{"digest":"sha256:a1","name":"[2/3] RUN echo one > /one","cached":true,"completed":"2026-08-06T11:20:00.100Z","started":"2026-08-06T11:20:00.000Z"}]}',
  '{"vertexes":[{"digest":"sha256:a2","name":"[3/3] RUN echo two > /two","cached":true,"completed":"2026-08-06T11:20:00.200Z","started":"2026-08-06T11:20:00.100Z"}]}',
];

/** Measured: `RUN exit 7`. The vertex carries `error`; a bare `ERROR:` follows. */
const FAILED = [
  '{"vertexes":[{"digest":"sha256:b1","name":"[3/3] RUN exit 7","started":"2026-08-06T11:30:00.000Z","error":"process \\"/bin/sh -c exit 7\\" did not complete successfully: exit code: 7"}]}',
  "ERROR: failed to build: failed to solve: process \"/bin/sh -c exit 7\" did not complete successfully: exit code: 7",
];

/** Measured: `docker pull busybox:musl`, piped. */
const PULL = [
  "musl: Pulling from library/busybox",
  "7e75e6d7d7c9: Pulling fs layer",
  "7e75e6d7d7c9: Download complete",
  "7e75e6d7d7c9: Pull complete",
  "Digest: sha256:32b5cdad7cce41dfd53d0ae06baebcf8357a147ee7694dc706911c373bc30c37",
  "Status: Downloaded newer image for busybox:musl",
];

describe("build — the failure arms first", () => {
  it("T1: a failed step keeps docker's own sentence", () => {
    const p = fresh();
    for (const l of FAILED) feedBuildLine(p, l);
    p.done = true;
    p.failed = true;

    const json = JSON.stringify(renderBuild(p));
    expect(json).toContain("exit code: 7");
    // The step is toned, and the tone is about failure rather than about cache.
    expect(json).toContain('"tone":"error"');
  });

  it("T2: a build reporting no steps says so rather than rendering an empty table", () => {
    const p = fresh();
    p.done = true;
    expect(JSON.stringify(renderBuild(p))).toContain("no steps reported");
  });

  it("T3: a pull that fails shows what docker said, not a generic message", () => {
    const p = fresh();
    feedPullLine(p, "Error response from daemon: pull access denied for nope");
    p.done = true;
    p.failed = true;
    expect(JSON.stringify(renderPull(p))).toContain("pull access denied");
  });
});

describe("build — cached is a kind, not a grade", () => {
  it("T4 (F30/F49/F51): a cache hit is a column value and never a tone", () => {
    const p = fresh();
    for (const l of WARM) feedBuildLine(p, l);
    p.done = true;

    // **Structural, because the substring version was vacuous.** It asserted
    // `not.toContain('"tone":"ok","text":"cached"')` and the builder serialises
    // `{text, tone}` in the other order, so the mutation that tones a cache hit
    // passed. An absence assertion over a string is an assertion about key
    // order; this one reads the cell.
    const table = findTable(renderBuild(p));
    const hows = table.rows.map((r) => r.cells["how"]);
    expect(hows.map((c) => c?.text)).toContain("cached");
    for (const c of hows) {
      expect(c?.tone, "`how` carries a kind, and a tone would rank it").toBeUndefined();
    }
  });

  it("T5: a cached step reports no duration, because it did not take one", () => {
    const p = fresh();
    for (const l of WARM) feedBuildLine(p, l);
    const json = JSON.stringify(renderBuild(p));
    // Not `0.1s` — buildkit stamps a cached vertex with a real interval that is
    // the cache lookup, and showing it invites a comparison with work.
    expect(json).not.toContain("0.1s");
    expect(json).toContain("—");
  });

  it("T6: the summary counts the cached ones", () => {
    const p = fresh();
    for (const l of WARM) feedBuildLine(p, l);
    p.done = true;
    expect(JSON.stringify(renderBuild(p))).toContain("2 cached");
  });
});

describe("build — what is a step", () => {
  it("T7: buildkit's internal vertexes are not steps anybody wrote", () => {
    const p = fresh();
    for (const l of COLD) feedBuildLine(p, l);
    // `[internal] load build definition` is in the stream and must not be a row:
    // a three-line Dockerfile showing eight steps is a display about buildkit.
    expect([...p.steps.keys()]).toEqual(["[2/3] RUN echo one > /one"]);
  });

  it("T8: a vertex arriving twice updates rather than duplicating", () => {
    const p = fresh();
    for (const l of COLD) feedBuildLine(p, l);
    const step = p.steps.get("[2/3] RUN echo one > /one")!;
    expect(step.started).toBeDefined();
    expect(step.completed).toBeDefined();
    expect(JSON.stringify(renderBuild(p))).toContain("0.5s");
  });

  it("T9: `statuses` lines carry no vertex names and change nothing", () => {
    const p = fresh();
    feedBuildLine(p, COLD[3]!);
    expect(p.steps.size).toBe(0);
  });
});

describe("pull — the layer log", () => {
  it("T10: each layer keeps its latest phase", () => {
    const p = fresh();
    for (const l of PULL) feedPullLine(p, l);
    expect(p.layers.get("7e75e6d7d7c9")?.phase).toBe("Pull complete");
    expect(p.layers.size).toBe(1);
  });

  it("T11: the status line becomes the settled notice", () => {
    const p = fresh();
    for (const l of PULL) feedPullLine(p, l);
    p.done = true;
    const json = JSON.stringify(renderPull(p));
    expect(json).toContain("Downloaded newer image for busybox:musl");
    expect(json).not.toContain("Status:");
  });
});

describe("the handlers", () => {
  it("T12: `/build` spawns rawjson and returns before the build finishes", async () => {
    let spawned: readonly string[] = [];
    let release: (n: number) => void = () => undefined;
    const doc = await createProgressHandler("build", (argv, onLine) => {
      spawned = argv;
      onLine(WARM[0]!);
      return new Promise<number>((r) => (release = r));
    })(["."], ctx);

    // **The document is returned while the process is still running.** That is
    // the whole shape: an adapter is handed one result and could not do this.
    expect(spawned).toContain("--progress=rawjson");
    expect(doc.status).toBe("ok");
    release(0);
  });

  it("T13: a missing argument never spawns anything", async () => {
    let spawned = false;
    const doc = await createProgressHandler("pull", () => {
      spawned = true;
      return Promise.resolve(0);
    })([], ctx);
    expect(doc.status).toBe("error");
    expect(spawned).toBe(false);
  });

  it("T14: `--tag` and `--no-cache` reach docker", async () => {
    let spawned: readonly string[] = [];
    await createProgressHandler("build", (argv) => {
      spawned = argv;
      return Promise.resolve(0);
    })([".", "--tag", "x:1", "--no-cache"], ctx);
    expect(spawned).toContain("--tag");
    expect(spawned).toContain("x:1");
    expect(spawned).toContain("--no-cache");
  });
});
