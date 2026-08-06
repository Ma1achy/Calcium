/**
 * `pull` `push` `build` — the verbs that take time and show it.
 *
 * ## The far side, measured before anything was designed
 *
 * | | |
 * |---|---|
 * | `docker pull --format json` | **does not exist.** `-q` is the only output flag |
 * | `pull`, piped | a flat event log: `<layer>: <phase>`, then `Digest:`, then `Status:` |
 * | `build --progress=rawjson` | **real NDJSON**: `{vertexes:[…]}` and `{statuses:[…]}` |
 * | a cached step | `vertexes[].cached === true`, name `[2/3] RUN echo one > /one` |
 * | a failed step | `vertexes[].error`, exit 1, plus a trailing non-JSON `ERROR:` line |
 *
 * The plan expected `pull --format json` and there is none, so pull is parsed
 * from its text. That is Ruling D's shape without the shim: these are local
 * verbs, nothing appends `--json`, and there is nothing for the shim to
 * translate.
 *
 * ## How progress reaches the screen, and the finding underneath it
 *
 * `LiveSpec` offers `fetch` **or** `stream`, and `b.live` throws unless exactly
 * one is given — so `stream` reads as the arm written for exactly this. It is
 * never driven: `partOf` maps `fetch: spec.fetch ?? (() => Promise.resolve(null))`
 * and nothing reads `spec.stream`, so a streamed part renders `render(null)` once
 * and the generator is never invoked. FINDINGS F78, and it was chosen first here.
 *
 * So progress is `fetch` plus `every`, polling a buffer the spawned process
 * fills. **That is the dashboard's ring a fourth time** — the pattern gap 1
 * named, and the reason all three of these verbs are local (F77).
 *
 * ## Cached is a kind, not a grade
 *
 * A cached step and a step that ran are **different kinds of thing**, not
 * different degrees of good. `Tone` is a goodness axis — `ok`, `warn`, `error` —
 * and reaching for it here would say a cache hit is *better* than work, which is
 * not what a reader wants to know. They want to know which steps ran. So the
 * distinction is carried in a column, in words, and `Tone` is left alone. This is
 * F30/F49/F51's fourth consumer, filed as **F81** rather than worked around.
 *
 * **That citation was absent for a step**, and this comment claimed the filing
 * without it — which is F81's own second half: a comment is the right place for
 * the decision and the wrong place for the gap, and the two read identically at
 * the point of writing.
 */

import { spawn } from "node:child_process";
import { b } from "@fmx/calcium";
import type { Block, LocalContext, ViewDocument } from "@fmx/calcium";

/** One build step, as buildkit reports it. */
export type Step = {
  name: string;
  cached: boolean;
  started?: string;
  completed?: string;
  error?: string;
};

/** One pull layer, as docker's text reports it. */
export type Layer = { id: string; phase: string };

export type Progress = {
  steps: Map<string, Step>;
  layers: Map<string, Layer>;
  lines: string[];
  done: boolean;
  failed: boolean;
  summary: string;
};

const emptyProgress = (): Progress => ({
  steps: new Map(),
  layers: new Map(),
  lines: [],
  done: false,
  failed: false,
  summary: "",
});

export type Spawner = (
  argv: readonly string[],
  onLine: (line: string) => void,
) => Promise<number>;

const realSpawner: Spawner = (argv, onLine) =>
  new Promise((resolve) => {
    const child = spawn("docker", [...argv]);
    let buf = "";
    const feed = (chunk: Buffer): void => {
      buf += chunk.toString("utf8");
      const parts = buf.split(/\r?\n/u);
      buf = parts.pop() ?? "";
      for (const p of parts) if (p.trim() !== "") onLine(p);
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("close", (code) => {
      if (buf.trim() !== "") onLine(buf);
      resolve(code ?? 0);
    });
    child.on("error", () => resolve(-1));
  });

// ── parsing ─────────────────────────────────────────────────────────────────

/** buildkit's rawjson, one line. Unrecognised lines are kept as text. */
export function feedBuildLine(p: Progress, line: string): void {
  const t = line.trim();
  if (!t.startsWith("{")) {
    // The trailing `ERROR: failed to build: …` is not JSON and is the most
    // useful sentence docker emits about a failure, so it is kept.
    if (t !== "") p.lines.push(t);
    return;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(t);
  } catch {
    return;
  }
  const vertexes = (doc as { vertexes?: unknown[] }).vertexes ?? [];
  for (const raw of vertexes) {
    const v = raw as Record<string, unknown>;
    const name = typeof v["name"] === "string" ? v["name"] : "";
    // **Internal vertexes are dropped.** buildkit reports `[internal] load
    // build definition`, `load .dockerignore` and the context transfer as
    // steps, and they are not steps anybody wrote — a build of three RUN lines
    // showing eight rows is a display about buildkit rather than the Dockerfile.
    if (name === "" || name.startsWith("[internal]")) continue;
    const prev = p.steps.get(name);
    p.steps.set(name, {
      name,
      cached: v["cached"] === true || (prev?.cached ?? false),
      ...(typeof v["started"] === "string" ? { started: v["started"] } : prev?.started === undefined ? {} : { started: prev.started }),
      ...(typeof v["completed"] === "string" ? { completed: v["completed"] } : prev?.completed === undefined ? {} : { completed: prev.completed }),
      ...(typeof v["error"] === "string" && v["error"] !== "" ? { error: v["error"] } : prev?.error === undefined ? {} : { error: prev.error }),
    });
  }
}

/** `docker pull`'s text, one line: `7e75e6d7d7c9: Download complete`. */
export function feedPullLine(p: Progress, line: string): void {
  const t = line.trim();
  if (t === "") return;
  const m = /^([0-9a-f]{6,}):\s+(.*)$/u.exec(t);
  if (m !== null) {
    // The phase carries a byte count in a TTY and not when piped; either way the
    // last phase for a layer is the one worth showing.
    p.layers.set(m[1]!, { id: m[1]!, phase: (m[2] ?? "").replace(/\s+$/u, "") });
    return;
  }
  if (/^(Status|Digest):/u.test(t) || t.startsWith("ERROR") || /error/iu.test(t)) p.lines.push(t);
}

// ── rendering ───────────────────────────────────────────────────────────────

const seconds = (s: Step): string => {
  if (s.started === undefined || s.completed === undefined) return "";
  const ms = Date.parse(s.completed) - Date.parse(s.started);
  return Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(1)}s` : "";
};

const STEP_COLUMNS = [
  b.col("step", { label: "STEP", priority: 90, minWidth: 20, flex: true, truncateFrom: "end" }),
  // **A column, not a tone.** Cached and ran are different kinds of thing; a
  // tone would rank them. F30/F49/F51's fourth consumer, and F81.
  b.col("how", { label: "HOW", priority: 60, minWidth: 7, maxWidth: 7 }),
  b.col("took", { label: "TOOK", priority: 40, minWidth: 6, maxWidth: 6, align: "right" }),
];

export function renderBuild(p: Progress): Block {
  const steps = [...p.steps.values()];
  if (steps.length === 0) {
    return b.notice("dim", p.done ? "no steps reported" : "starting…");
  }
  const cached = steps.filter((s) => s.cached).length;
  const failed = steps.find((s) => s.error !== undefined);

  const rows = steps.map((s, i) =>
    b.row(`s${String(i)}`, {
      // **The glyph is required, and C04 I6 refused the block without it.**
      // An `error` tone obliges one, because colour alone survives neither a
      // 1-bit terminal nor a colour-blind reader — so the failure is legible
      // with every tone stripped. Failure *is* a goodness axis, unlike cached,
      // which is why this one takes a tone at all.
      step:
        s.error !== undefined
          ? { text: s.name, tone: "error" as const, glyph: "error" as const }
          : s.name,
      how: s.cached ? "cached" : s.completed !== undefined ? "ran" : "…",
      took: s.cached ? "—" : seconds(s),
    }),
  );

  const tail: Block[] = [];
  if (failed !== undefined) tail.push(b.notice.error(failed.error!));
  else if (p.done && !p.failed) {
    tail.push(
      b.notice.ok(
        `${String(steps.length)} step${steps.length === 1 ? "" : "s"}` +
          (cached === 0 ? "" : ` · ${String(cached)} cached`),
      ),
    );
  }
  // The trailing non-JSON `ERROR:` line, which says more than the vertex does.
  const said = p.lines.filter((l) => l.startsWith("ERROR"));
  if (p.failed && failed === undefined && said.length > 0) tail.push(b.notice.error(said[0]!));

  return b.group("column", [b.table({ id: "build-steps", columns: STEP_COLUMNS, rows }), ...tail]);
}

const LAYER_COLUMNS = [
  b.col("layer", { label: "LAYER", priority: 60, minWidth: 12, maxWidth: 14 }),
  b.col("phase", { label: "PHASE", priority: 90, minWidth: 14, flex: true }),
];

export function renderPull(p: Progress): Block {
  const layers = [...p.layers.values()];
  if (layers.length === 0) {
    return b.notice("dim", p.done ? (p.lines[0] ?? "nothing to do") : "starting…");
  }
  const rows = layers.map((l, i) => b.row(`l${String(i)}`, { layer: l.id, phase: l.phase }));
  const tail: Block[] = [];
  const status = p.lines.find((l) => l.startsWith("Status:"));
  if (p.failed) tail.push(b.notice.error(p.lines[p.lines.length - 1] ?? "pull failed"));
  else if (p.done && status !== undefined) tail.push(b.notice.ok(status.replace(/^Status:\s*/u, "")));
  return b.group("column", [b.table({ id: "pull-layers", columns: LAYER_COLUMNS, rows }), ...tail]);
}

// ── the handlers ────────────────────────────────────────────────────────────

const meta = (argv: readonly string[], exitCode: number): ViewDocument["meta"] => ({
  verb: argv[0] ?? null,
  adapter: "progress",
  exitCode,
  durationMs: 0,
  truncated: false,
  argv,
  stderr: "",
  transport: "local",
  origin: "user",
});

const errorDoc = (command: string, argv: readonly string[], message: string): ViewDocument => ({
  schema: "tui.view/1",
  command,
  status: "error",
  error: { message, stage: "local" },
  blocks: [b.notice.error(message)],
  meta: meta(argv, 1),
});

function flagValue(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}

type Kind = "pull" | "push" | "build";

export function createProgressHandler(
  kind: Kind,
  spawner: Spawner = realSpawner,
): (args: readonly string[], ctx: LocalContext) => Promise<ViewDocument> {
  return async (args, ctx) => {
    const target = args[0];
    if (target === undefined || target === "") {
      return errorDoc(ctx.command, [kind], `usage: /${kind} <${kind === "build" ? "context" : "image"}>`);
    }

    const argv: string[] = [];
    if (kind === "build") {
      argv.push("build", "--progress=rawjson");
      const tag = flagValue(args, "tag");
      if (tag !== undefined) argv.push("--tag", tag);
      const file = flagValue(args, "file");
      if (file !== undefined) argv.push("--file", file);
      if (args.includes("--no-cache")) argv.push("--no-cache");
      argv.push(target);
    } else {
      argv.push(kind, target);
    }

    const p = emptyProgress();
    const feed = kind === "build" ? feedBuildLine : feedPullLine;
    const render = kind === "build" ? renderBuild : renderPull;

    // **The process is started here and not awaited.** The document returns
    // immediately with a live part; the part polls `p`, which this closure keeps
    // filling. An adapter cannot do this — it is handed one result — which is
    // why all three of these are local (F77).
    const finished = spawner(argv, (line) => {
      feed(p, line);
    }).then((code) => {
      p.done = true;
      p.failed = code !== 0;
      return code;
    });
    void finished;

    return {
      schema: "tui.view/1",
      command: ctx.command,
      status: "ok",
      blocks: [
        b.live({
          id: `${kind}-progress`,
          title: `${kind} ${target}`,
          // **`fetch` and `every`, not `stream`.** `LiveSpec.stream` is the arm
          // this is written for and it is never driven (F78) — the generator is
          // not invoked and the part renders `render(null)` once, which looks
          // exactly like a build that produced nothing.
          every: 400,
          fetch: () => Promise.resolve(p),
          render: (data) => render(data as Progress),
        }),
      ],
      meta: meta(argv, 0),
    };
  };
}

export function progressHandlers(
  spawner: Spawner = realSpawner,
): Record<string, (args: readonly string[], ctx: LocalContext) => Promise<ViewDocument>> {
  return {
    pull: createProgressHandler("pull", spawner),
    push: createProgressHandler("push", spawner),
    build: createProgressHandler("build", spawner),
  };
}
