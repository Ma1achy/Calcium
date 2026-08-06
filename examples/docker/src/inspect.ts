/**
 * S5 — `/inspect <c>`, structured and `--raw`.
 *
 * The first consumer of the pushed view with **more content than region**: a real
 * `docker inspect` is 245 rows against a 37-row region. S3 filled the region
 * exactly and never asked what happens past it, so everything here is new
 * ground and INSPECT_WALK.md is where it was ruled.
 *
 * **Two rulings that only work as a pair** (C22 I47). The producer splits what
 * it can; the view reports what could not be split. Neither is sufficient —
 * split alone leaves a silent residue, and the indicator alone leaves a document
 * nothing can cross.
 */

import { cells } from "@fmx/calcium";
import type { AdapterDocument, Adapter, Block, ViewDocument } from "@fmx/calcium";
import { b } from "@fmx/calcium";
import { str, type Row } from "./ndjson.ts";

/**
 * The row budget a raw block is split down to.
 *
 * **The walk ruled *the region* and the code says otherwise.** `AdapterContext`
 * carries `width` and no height, `LocalContext` carries only `command`, and
 * reading the terminal is forbidden outside `terminal/lifecycle.ts` — so the
 * threshold the ruling named is unreachable from either place that builds a
 * document. FINDINGS F37.
 *
 * What is reachable is a **declared floor**, and the asymmetry is what makes it
 * defensible rather than the fixed constant the walk rejected: over-splitting
 * costs granularity, under-splitting strands rows a reader cannot reach. So a
 * floor is correct at every region above it and honest below, where I47's
 * indicator carries the residue.
 *
 * 21 is the region of a 24-row terminal — B04's smallest supported. Measured on
 * a real container: 114 blocks, **0 rows stranded at a 40-row terminal and 3 at
 * a 24-row one**, against 208 stranded by no split at all. The 3 are a leaf that
 * cannot be divided further, which is the floor the walk found (B2).
 */
export const SPLIT_FLOOR = 21;

/** How deep the split will go before it stops dividing (walk B2's floor). */
const MAX_DEPTH = 3;

/**
 * The rows a `code` block will occupy — the app's own arithmetic, because there
 * is none to borrow.
 *
 * `createBlockRegistry` is not public, so a consumer that must decide *how to
 * divide content* cannot measure the result (FINDINGS F37). `cells` is public
 * and is the same implementation the measurer uses, which is the sanctioned half
 * of this: a `.length` here would disagree with the measurer on every wide
 * character. The other half — that a wrapped code block is the sum of its
 * wrapped lines — is an assumption, and T5.x pins it against the real registry
 * rather than letting it drift silently.
 */
export function codeRows(text: string, width: number): number {
  // **`width`, not `width - 2`.** A code block wraps at the full width — it has
  // no border to pay for — and the first version of this assumed an inset,
  // which the pin caught on its first run: 69 against the measurer's 68.
  const limit = Math.max(1, Math.floor(width));
  // **A trailing newline terminates the last line rather than starting a blank
  // one.** `"a\n"` is one row, and counting two makes every value that ends
  // tidily a row too tall — the measurer says so explicitly and the arithmetic
  // has to agree.
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return Math.max(
    1,
    body.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(cells(line) / limit)), 0),
  );
}

/**
 * The document, split into blocks no taller than `floor` where it can be.
 *
 * Recursive by keys, and it stops on three conditions rather than one: the block
 * fits, the node has no children to divide by, or the depth cap is reached. The
 * middle one is walk B2 — a leaf has no smaller form that is still that leaf,
 * so *split until it fits* does not terminate and the honest thing is to emit
 * the block and let the view say it was cut.
 */
export function splitRaw(
  value: unknown,
  width: number,
  floor: number = SPLIT_FLOOR,
): readonly Block[] {
  const out: Block[] = [];
  const walk = (path: string, node: unknown, depth: number): void => {
    const text = `"${path}": ${JSON.stringify(node, null, 2)}`;
    const children =
      node !== null && typeof node === "object" ? Object.entries(node as Record<string, unknown>) : [];
    if (codeRows(text, width) <= floor || children.length === 0 || depth >= MAX_DEPTH) {
      // **`wrap: true`, against the builder's default.** `--raw` exists so the
      // reader has the bytes; seven lines of a real inspect exceed 120 columns
      // and the longest is 2862 characters, so cutting them discards ~2.7KB
      // from the one mode whose promise is fidelity. Measured cost: 245 → 274
      // rows, 11% (walk B3).
      out.push(b.code("json", text, { id: `raw-${path}`, wrap: true }));
      return;
    }
    for (const [key, child] of children) walk(`${path}.${key}`, child, depth + 1);
  };
  const top =
    value !== null && typeof value === "object" ? Object.entries(value as Record<string, unknown>) : [];
  for (const [key, child] of top) walk(key, child, 0);
  return out;
}

// ── The structured mode ─────────────────────────────────────────────────────

const short = (id: string): string => (id.length > 12 ? id.slice(0, 12) : id);

const portRows = (inspected: Row): readonly string[] => {
  const host = inspected["HostConfig"] as Row | undefined;
  const bindings = (host?.["PortBindings"] ?? {}) as Record<string, unknown>;
  const published = Object.entries(bindings).flatMap(([port, list]) => {
    const first = Array.isArray(list) ? (list[0] as Row | undefined) : undefined;
    const at = first === undefined ? "" : str(first, "HostPort");
    return at === "" ? [] : [`${port} → ${at}`];
  });
  if (published.length > 0) return published;
  // **Falls back to the declaration, in the image's own words.** An exposed
  // port that is not published is still a fact about the container, and
  // reporting nothing there says the opposite. `/drift`'s B3, same shape.
  const config = inspected["Config"] as Row | undefined;
  const exposed = Object.keys((config?.["ExposedPorts"] ?? {}) as Record<string, unknown>);
  return exposed.map((port) => `${port} exposed, not published`);
};

const mountRows = (inspected: Row): readonly string[] => {
  const mounts = (inspected["Mounts"] ?? []) as readonly Row[];
  return mounts.map((m) => `${str(m, "Source")} → ${str(m, "Destination")} (${m["RW"] === false ? "ro" : "rw"})`);
};

const envRows = (inspected: Row): readonly string[] => {
  const config = inspected["Config"] as Row | undefined;
  return ((config?.["Env"] ?? []) as readonly string[]).map((e) => e);
};

/** `—` rather than an omitted row: this transcribes, so absence is a fact (walk B5). */
const listOf = (values: readonly string[]): string => (values.length === 0 ? "—" : values.join("\n"));

export function structuredBlocks(inspected: Row): readonly Block[] {
  const state = (inspected["State"] ?? {}) as Row;
  const config = (inspected["Config"] ?? {}) as Row;
  const net = (inspected["NetworkSettings"] ?? {}) as Row;
  const running = state["Running"] === true;

  return [
    b.kv(
      {
        Id: short(str(inspected, "Id")),
        Name: str(inspected, "Name").replace(/^\//u, ""),
        State: `${running ? "running" : str(state, "Status")}  pid ${str(state, "Pid")}`,
        Image: str(config, "Image"),
        Ports: listOf(portRows(inspected)),
        Mounts: listOf(mountRows(inspected)),
        Network: `${str(net, "IPAddress") || "—"}  gateway ${str(net, "Gateway") || "—"}`,
        Env: listOf(envRows(inspected)),
      },
      { id: "inspect-structured" },
    ),
  ];
}

// ── The adapter ─────────────────────────────────────────────────────────────

/**
 * `docker inspect` answers a **JSON array**, not NDJSON, so `parseNdjson` does
 * not apply — the one place in this app it would be reached for by habit.
 */
const parseInspect = (raw: string): Row | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const first = Array.isArray(parsed) ? (parsed[0] as unknown) : parsed;
    return first !== null && typeof first === "object" ? (first as Row) : null;
  } catch {
    return null;
  }
};

export function createInspectAdapter(): Adapter {
  return {
    schema: "tui.view/1",
    adapt(result, ctx): AdapterDocument {
      const failed = result.exitCode !== 0;
      const inspected = failed ? null : parseInspect(result.stdoutRaw);
      // **A container that answered nothing is a failure, not an empty view.**
      // The exit code alone would miss it: `docker inspect` on a name it half
      // resolves can exit 0 with `[]`.
      const failure = failed
        ? result.stderr.trim() || `docker exited ${String(result.exitCode)}`
        : inspected === null
          ? "docker inspect returned nothing that could be read"
          : "";

      // `ctx.flags`, not `result.argv`: a shellOnly flag is absent from argv by
      // construction, which is the whole of what F39 asked for (C05 I21).
      const raw = ctx.flags["raw"] === true;

      return {
        schema: "tui.view/1",
        command: ctx.command,
        status: failure === "" ? "ok" : "error",
        // C04 I3 — required when `status` is `error`, and its absence is
        // silent: C13 throws and C23 discards, so the reader gets no entry at
        // all rather than this notice. FINDINGS F35, closed as a class.
        ...(failure === "" ? {} : { error: { message: failure, stage: "adapter" as const } }),
        blocks:
          failure !== "" || inspected === null
            ? [b.notice.error(failure)]
            : raw
              ? splitRaw(inspected, ctx.width)
              : structuredBlocks(inspected),
        meta: { adapter: "inspect", truncated: false },
      };
    },
  };
}
