/**
 * S8 — `/config <c> <path>`, the patch block doing its actual job.
 *
 * **Two calls and a diff**, so it is a local verb: `docker exec <c> cat <path>`
 * for the running file, and `docker run --rm <image> cat <path>` for the one the
 * image ships. An adapter is handed one result, and this needs two.
 *
 * Three of the drawing's premises failed under measurement and CONFIG_WALK.md
 * carries them. The two that shaped this file:
 *
 * - **Discovery is not rulable in.** `.Mounts` gives `Type: "bind"` for a file
 *   and for a directory with no distinguishing field, so the bare form offers
 *   the mount destinations as candidates rather than guessing (B1).
 * - **The two sides are not interchangeable.** A missing image side keeps the
 *   block; a missing running side is the whole verb's failure. The running file
 *   is the subject and the image file is the baseline, so losing the baseline
 *   degrades the answer and losing the subject removes it (A1, A2).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import type { LocalDocument, Block, Hunk, ViewDocument } from "@fmx/calcium";

import type { LocalContext } from "@fmx/calcium";
const run = promisify(execFile);

/** Lines of context either side of a change — the usual three. */
const CONTEXT = 3;

type Line = Readonly<{ kind: "add" | "remove" | "context"; text: string; oldNo?: number; newNo?: number }>;

// ── The diff ────────────────────────────────────────────────────────────────

/**
 * The app computes it, and that is a ruling rather than an omission (walk B4).
 *
 * A diff library is a dependency and a dependency is a row in
 * `DEPENDENCIES.md` with all five justification parts. These are config files —
 * tens of lines — so a plain LCS is exact and short, and the justification
 * would have been convenience, which is not one of the five.
 */
export function diffLines(before: readonly string[], after: readonly string[]): readonly Line[] {
  const n = before.length;
  const m = after.length;
  // lcs[i][j] = length of the longest common subsequence of before[i..] / after[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] =
        before[i] === after[j]
          ? (lcs[i + 1]![j + 1] as number) + 1
          : Math.max(lcs[i + 1]![j] as number, lcs[i]![j + 1] as number);
    }
  }

  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ kind: "context", text: before[i] as string, oldNo: i + 1, newNo: j + 1 });
      i += 1;
      j += 1;
    } else if ((lcs[i + 1]![j] as number) >= (lcs[i]![j + 1] as number)) {
      out.push({ kind: "remove", text: before[i] as string, oldNo: i + 1 });
      i += 1;
    } else {
      out.push({ kind: "add", text: after[j] as string, newNo: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: "remove", text: before[i] as string, oldNo: i + 1 });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "add", text: after[j] as string, newNo: j + 1 });
    j += 1;
  }
  return out;
}

/**
 * Changed runs, with `CONTEXT` lines either side, as `Hunk`s.
 *
 * **`collapsedBefore` carries what was elided above each hunk and nothing
 * carries what was elided below the last one.** `Patch.collapsedAfter` exists
 * for exactly that and `b.patch` does not pass it (FINDINGS F41), so a patch can
 * say what it skipped above and not below — which for a 44-line file with one
 * hunk near the top is about thirty lines that simply stop.
 */
export function hunksOf(lines: readonly Line[]): readonly Hunk[] {
  const changed = lines.map((l) => l.kind !== "context");
  const keep = lines.map((_, k) =>
    changed.slice(Math.max(0, k - CONTEXT), k + CONTEXT + 1).some(Boolean),
  );

  const hunks: Hunk[] = [];
  let at = 0;
  let elided = 0;
  while (at < lines.length) {
    if (!keep[at]) {
      elided += 1;
      at += 1;
      continue;
    }
    const start = at;
    while (at < lines.length && keep[at]) at += 1;
    const body = lines.slice(start, at);
    const first = body[0] as Line;
    const oldStart = first.oldNo ?? 1;
    const newStart = first.newNo ?? 1;
    hunks.push({
      header: `@@ -${String(oldStart)} +${String(newStart)} @@`,
      lines: body,
      ...(elided === 0 ? {} : { collapsedBefore: elided }),
    });
    elided = 0;
  }
  return hunks;
}

/**
 * The whole file as a single hunk of context — walk A1's rendering.
 *
 * `hunksOf` keeps only what sits near a change, so a file with no baseline to
 * compare against yields **no hunks at all** and an empty patch block. That is
 * precisely the failure A1 rules out, arriving through the function written to
 * serve it.
 */
export function wholeFile(path: string, lines: readonly Line[]): readonly Hunk[] {
  if (lines.length === 0) return [];
  return [
    {
      header: `${path} — the running file, with no baseline to compare against`,
      lines: lines.map((l) => ({ ...l, kind: "context" as const })),
    },
  ];
}

// ── The far side ────────────────────────────────────────────────────────────

export type Facts = Readonly<{ image: string; mounts: readonly string[] }>;

/**
 * The two readers and the inspect, as one injectable seam.
 *
 * **A seam because walk A1's state is not otherwise reachable**, and because the
 * mutation pass has demanded one on every verb so far: a row that calls the
 * mechanism verifies the mechanism and never the wiring. `/drift`'s `Lookup` is
 * the same parameter for the same reason.
 */
export type Far = Readonly<{
  facts: (container: string) => Promise<Facts | null>;
  running: (container: string, path: string) => Promise<string | null>;
  fromImage: (image: string, path: string) => Promise<string | null>;
}>;

const realFar: Far = {
  async facts(container) {
    try {
      const { stdout } = await run("docker", ["inspect", container], { maxBuffer: 8 << 20 });
      const parsed: unknown = JSON.parse(stdout);
      const first = Array.isArray(parsed) ? (parsed[0] as Record<string, unknown>) : null;
      if (first === null || typeof first !== "object") return null;
      const config = (first["Config"] ?? {}) as Record<string, unknown>;
      const mounts = (first["Mounts"] ?? []) as readonly Record<string, unknown>[];
      return {
        image: typeof config["Image"] === "string" ? config["Image"] : "",
        // **Bind destinations only.** A named volume's destination is a
        // directory by construction and would pad the list with things no
        // `cat` will read.
        mounts: mounts
          .filter((m) => m["Type"] === "bind")
          .map((m) => (typeof m["Destination"] === "string" ? m["Destination"] : ""))
          .filter((d) => d !== ""),
      };
    } catch {
      return null;
    }
  },
  async running(container, path) {
    try {
      const { stdout } = await run("docker", ["exec", container, "cat", path], {
        maxBuffer: 8 << 20,
      });
      return stdout;
    } catch {
      return null;
    }
  },
  async fromImage(image, path) {
    // **442ms, measured** — a container created, started, read and removed. Named
    // in the surfaces doc rather than hidden, because it makes this verb an
    // order of magnitude slower than `/drift` and a reader deserves to know why.
    try {
      const { stdout } = await run("docker", ["run", "--rm", image, "cat", path], {
        maxBuffer: 8 << 20,
      });
      return stdout;
    } catch {
      return null;
    }
  },
};

const errorDoc = (command: string, text: string, extra: readonly Block[] = []): LocalDocument => ({
  schema: "tui.view/1",
  command,
  status: "error",
  // C04 I3 — required, and its absence is silent (F35).
  error: { message: text, stage: "local" },
  blocks: [b.notice.error(text), ...extra],
  meta: { adapter: "config" },
});

/** The candidate list, which is what the verb offers instead of guessing (B1). */
export function candidates(mounts: readonly string[]): readonly Block[] {
  return mounts.length === 0
    ? [b.notice.info("this container has no bind mounts, so there is nothing to suggest")]
    : [
        b.notice.info("bind mounts on this container — one of these is probably the file:"),
        b.kv(Object.fromEntries(mounts.map((m, i) => [`mount ${String(i + 1)}`, m])), {
          id: "config-candidates",
        }),
      ];
}

const split = (text: string): readonly string[] => {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return body === "" ? [] : body.split("\n");
};

/** nginx conf, JSON, YAML — enough to pick a highlighter, and honest when it cannot. */
const languageOf = (path: string): string => {
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".conf")) return "nginx";
  return "text";
};

export function createConfigHandler(
  far: Far = realFar,
): (argv: readonly string[], ctx: LocalContext) => Promise<LocalDocument> {
  return async (argv, ctx) => {
    const container = argv[0];
    if (container === undefined || container === "") {
      return errorDoc(ctx.command, "usage: /config <container> <path>");
    }

    const facts = await far.facts(container);
    if (facts === null) return errorDoc(ctx.command, `no such container: ${container}`);

    const path = argv[1];
    if (path === undefined || path === "") {
      // **Candidates, not a guess** (B1). `.Mounts` cannot tell a file bind from
      // a directory bind, so the honest answer is the set.
      return errorDoc(
        ctx.command,
        `usage: /config ${container} <path> — which file?`,
        candidates(facts.mounts),
      );
    }

    /**
     * **The running side first, and the order is the ruling** (A2).
     *
     * `docker exec` fails on a stopped container where `docker inspect` answers
     * for one, so this is where `/config` is exposed and `/drift` was not.
     * Fetching it first means a stopped container fails before the image call's
     * 442ms is spent, and its failure is the whole verb's — there is no useful
     * patch of the image's file against nothing.
     */
    const running = await far.running(container, path);
    if (running === null) {
      return errorDoc(ctx.command, `cannot read ${path} in ${container} — is it running?`);
    }

    const original = facts.image === "" ? null : await far.fromImage(facts.image, path);
    const lines = diffLines(split(original ?? running), split(running));
    const hunks = hunksOf(lines);
    const language = languageOf(path);

    /**
     * **A missing image side keeps the block** (A1), matching `/drift`'s A1 —
     * or the app means two things by *a missing side* and a reader has to learn
     * which verb they are in.
     *
     * With no baseline there is nothing to diff, so what renders is the running
     * file as context lines: the file, unannotated, and a notice beside it
     * rather than instead of it.
     */
    const missing =
      original === null
        ? [
            b.notice.warn(
              `the image's copy of ${path} is unavailable — showing the running file only`,
            ),
          ]
        : [];

    /**
     * **Files that agree still render a block** (B3), which is `/drift`'s B4
     * arriving in an unrelated verb. An empty block is indistinguishable from a
     * call that failed, and this is the second verb to need the same sentence —
     * which is what makes it a class rather than a fact about comparisons.
     */
    const agree = original !== null && hunks.length === 0;
    const added = lines.filter((l) => l.kind === "add").length;
    const removed = lines.filter((l) => l.kind === "remove").length;

    return {
      schema: "tui.view/1",
      meta: { adapter: "config" },
      command: ctx.command,
      status: "ok",
      blocks: [
        ...missing,
        b.patch({
          id: "config-patch",
          path,
          language,
          // **With no baseline the whole file is one hunk of context.** Not
          // `hunksOf`, which keeps only what is near a change and would return
          // *nothing* here — an empty patch block, which is the exact failure
          // A1 rules against. Caught by writing the row for it.
          hunks: original === null ? wholeFile(path, lines) : hunks,
          // **Unified always, rather than C25's width default.**
          //
          // `layoutFor` picks split at 100 columns and above, which is a
          // reasonable default for a framework and the wrong one for this verb.
          // A config file is read as a *sequence* — a directive and the two
          // lines around it — and split breaks that reading in half: the eye
          // has to pair rows across a gutter to reconstruct an order the file
          // already has. Split earns its place where the two sides are
          // independent objects, which is `/drift`'s shape and not this one.
          //
          // It is the app's call because C25 exposes it as one: `layout` is on
          // the block and `b.patch` passes it. The default is not wrong; it is
          // a default, and this verb knows something the framework does not.
          layout: "unified",
        }),
        agree
          ? // **The glyph is given rather than left to the tone**, and the
            // reason is F34's rather than C04 I6's. I6 requires one for `error`
            // and `warn` only, which is a defensible line: those are urgent and
            // a reader must not miss them. But this notice is the *verdict of
            // the verb*, and F34's lesson is that a verdict carried by colour
            // alone survives neither 1-bit nor a colour-blind reader. The
            // sentence carries it too, so this is belt and braces — and the
            // glyph column is the first thing a reader scans.
            b.notice("ok", `no drift — ${path} is the file the image ships`, "ok", {
              gapBefore: true,
            })
          : b.notice(
              "muted",
              `${String(hunks.length)} hunk${hunks.length === 1 ? "" : "s"} · +${String(added)} -${String(removed)}`,
              undefined,
              { gapBefore: true },
            ),
      ],
    };
  };
}
