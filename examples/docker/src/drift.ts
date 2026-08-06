/**
 * S7 `/drift <c>` and S6 `/compare A B`. Every ruling here is DRIFT_WALK.md's.
 *
 * The comparison block at its best: a genuine before/after, `a` = the image's
 * declared default and `b` = the container actually running, with the rows that
 * differ carrying the verdict tone.
 *
 * **Local verbs, and that is forced rather than chosen.** `/drift` runs
 * `docker inspect <c>` and *then* `docker image inspect` on the image that
 * reports — two calls where the second depends on the first, and an adapter is
 * handed one result. A01 D4 makes them transcript entries rather than views: no
 * letter keys, no claim on the whole screen.
 *
 * **A semantic field map, not a diff, and the walk measured why.** A container's
 * `Config` is the image's inherited and then filled with runtime fields — zero
 * image-only keys and twelve container-only, on every pair measured — so a
 * key-union diff invents a `changed` row for each of the twelve, none of which
 * is drift. And the row the surface leads with is not in `Config` at all:
 * `ExposedPorts` is inherited *identically*, and the published binding lives in
 * `HostConfig.PortBindings`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import type { LocalDocument, Block, ComparisonRow, ViewDocument } from "@fmx/calcium";
import type { Row } from "./ndjson.ts";

const run = promisify(execFile);

/** One `docker inspect` object — a container's or an image's. */
type Insp = Row;

const obj = (v: unknown): Row => (typeof v === "object" && v !== null ? (v as Row) : {});

/** `—`, the way every other block in this app says *nothing here*. */
const NONE = "—";

// ── The map ─────────────────────────────────────────────────────────────────

/**
 * A field, with **its own reader per side**.
 *
 * **`derived` was a fourth kind in the walk and is not one here** (DRIFT_WALK
 * B3). The walk ruled `ports` distinct because its two sides come from different
 * paths; once every field reads through a per-side function that distinction
 * costs nothing to express, so `ports` is an ordinary keyed field whose two
 * readers happen to disagree. The walk was right that the row is different and
 * wrong that the difference is a kind — worth recording, because a fourth arm
 * would have been carried in every `switch` for one field.
 *
 * The readers **normalise as they read**, returning a canonical shape per kind.
 * That is DRIFT_WALK B1: `nginx:alpine` has **no `User` key at all** and its
 * container has `User: ""`, both meaning *no user set*, and any comparison built
 * on `!==` reports drift on a container that has drifted in no way.
 */
type Field =
  | Readonly<{
      label: string;
      kind: "scalar";
      image: (i: Insp) => string | null;
      container: (c: Insp) => string | null;
    }>
  | Readonly<{
      label: string;
      kind: "keyed";
      image: (i: Insp) => Readonly<Record<string, string>>;
      container: (c: Insp) => Readonly<Record<string, string>>;
    }>;

/** A scalar, absent when `null`, `undefined` or `""` (B1). */
const scalar = (v: unknown): string | null => {
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

/** A list, rendered as one cell. Absent when `null` or empty. */
const list = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const parts = v.filter((x): x is string => typeof x === "string");
  return parts.length === 0 ? null : parts.join(" ");
};

/** `["K=V", …]` — docker's env shape — as a map. */
const envMap = (v: unknown): Record<string, string> => {
  if (!Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const entry of v) {
    if (typeof entry !== "string") continue;
    const at = entry.indexOf("=");
    if (at === -1) out[entry] = "";
    else out[entry.slice(0, at)] = entry.slice(at + 1);
  }
  return out;
};

const strMap = (v: unknown): Record<string, string> => {
  const src = obj(v);
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(src)) out[k] = typeof val === "string" ? val : "";
  return out;
};

const cfg = (i: Insp): Insp => obj(i["Config"]);

/**
 * The published bindings, from `HostConfig.PortBindings` (B3).
 *
 * `{"80/tcp": [{"HostIp":"","HostPort":"8080"}]}` → `{"80/tcp": "→ 8080"}`.
 */
const bindings = (c: Insp): Record<string, string> => {
  const src = obj(obj(c["HostConfig"])["PortBindings"]);
  const out: Record<string, string> = {};
  for (const [port, arr] of Object.entries(src)) {
    if (!Array.isArray(arr)) continue;
    const hosts = arr
      .map((entry) => {
        const e = obj(entry);
        const ip = typeof e["HostIp"] === "string" ? e["HostIp"] : "";
        const port_ = typeof e["HostPort"] === "string" ? e["HostPort"] : "";
        return ip === "" ? port_ : `${ip}:${port_}`;
      })
      .filter((x) => x !== "");
    out[port] = hosts.length === 0 ? "published" : `→ ${hosts.join(", ")}`;
  }
  return out;
};

/** Bind mounts, keyed by destination — the path inside the container. */
const mounts = (c: Insp): Record<string, string> => {
  const src = c["Mounts"];
  if (!Array.isArray(src)) return {};
  const out: Record<string, string> = {};
  for (const entry of src) {
    const m = obj(entry);
    const dest = typeof m["Destination"] === "string" ? m["Destination"] : "";
    if (dest === "") continue;
    const source = typeof m["Source"] === "string" ? m["Source"] : "";
    out[dest] = `${source || "volume"}${m["RW"] === false ? " (ro)" : ""}`;
  }
  return out;
};

/**
 * The map. **The twelve daemon-filled keys are absent by category** (B6).
 *
 * `Hostname`, `Domainname`, the three `Attach*`, `Image`, `StopTimeout`, `Tty`,
 * `OpenStdin`, `StdinOnce`, `Volumes` are on every container and no image. They
 * are not drift — they are what running a container means — and a surface that
 * reported them would be correct on every row and useful on none.
 */
export const FIELDS: readonly Field[] = Object.freeze([
  { label: "entrypoint", kind: "scalar", image: (i) => list(cfg(i)["Entrypoint"]), container: (c) => list(cfg(c)["Entrypoint"]) },
  { label: "cmd", kind: "scalar", image: (i) => list(cfg(i)["Cmd"]), container: (c) => list(cfg(c)["Cmd"]) },
  { label: "user", kind: "scalar", image: (i) => scalar(cfg(i)["User"]), container: (c) => scalar(cfg(c)["User"]) },
  { label: "workdir", kind: "scalar", image: (i) => scalar(cfg(i)["WorkingDir"]), container: (c) => scalar(cfg(c)["WorkingDir"]) },
  { label: "stop signal", kind: "scalar", image: (i) => scalar(cfg(i)["StopSignal"]), container: (c) => scalar(cfg(c)["StopSignal"]) },
  // The two readers disagree, which is the whole of B3. The image declares a
  // port; the container publishes one, and `ExposedPorts` is inherited
  // identically so a same-path comparison sees no drift on the leading row.
  {
    label: "ports",
    kind: "keyed",
    image: (i) => {
      const out: Record<string, string> = {};
      for (const port of Object.keys(obj(cfg(i)["ExposedPorts"]))) out[port] = "exposed";
      return out;
    },
    /**
     * **A declaration and a binding are different vocabularies, and comparing
     * them directly means the row can never read `same`.** Found by writing the
     * identical-container test, which is the one frame-read 2 protects.
     *
     * The container inherits `ExposedPorts` and *may* publish. So the drift is
     * *whether it is published, and where* — and a port that is exposed and
     * unpublished has to render in the image's own words, or a container that
     * has drifted in no way reports drift on its leading row.
     */
    container: (c) => {
      const out = bindings(c);
      for (const port of Object.keys(obj(cfg(c)["ExposedPorts"]))) {
        if (!Object.hasOwn(out, port)) out[port] = "exposed";
      }
      return out;
    },
  },
  { label: "mounts", kind: "keyed", image: () => ({}), container: mounts },
  { label: "env", kind: "keyed", image: (i) => envMap(cfg(i)["Env"]), container: (c) => envMap(cfg(c)["Env"]) },
  { label: "labels", kind: "keyed", image: (i) => strMap(cfg(i)["Labels"]), container: (c) => strMap(cfg(c)["Labels"]) },
]);

// ── The rows ────────────────────────────────────────────────────────────────

/**
 * **Absence lives in the data, never in the verdict** (B2).
 *
 * `Comparison`'s union is `same | better | worse | changed` — no `added`, no
 * `removed`, though S7's drawing showed one. A field on one side only renders
 * `changed` with the absent side as `—`, which says the same thing to a reader
 * and needs no change to C04. Putting it in the `field` label instead would
 * write a verdict into the column that names the field, where it sorts and
 * truncates as part of the name.
 */
const row = (field: string, a: string | null, bb: string | null): ComparisonRow => ({
  field,
  a: a ?? NONE,
  b: bb ?? NONE,
  // **The two members F30 asked for, now that they exist.** This row said
  // `changed` for a field the container adds and for one it drops, because the
  // union had nowhere else to put them — the finding's own words were *absence
  // goes in the data*, which left `—` in a cell and the verdict silent about
  // which side was missing. The marker now says it (C04 I35, I36).
  change:
    a === bb ? "unchanged" : a === null ? "added" : bb === null ? "removed" : "changed",
});

/**
 * One field's rows.
 *
 * A scalar always renders — there are few of them, and an unchanged
 * `entrypoint` is a fact a reader came for. A keyed field renders **only the
 * keys that differ**, plus one muted tally: a container inherits every variable
 * its image declares, so showing all of them buries the one that moved.
 *
 * **A field neither side has is omitted entirely** (B5), and the tally does not
 * count it. `7 identical` has to mean seven things that agree, or the number the
 * empty-drift frame rests on is inflated by fields nobody has.
 */
export function rowsFor(field: Field, imageSide: Insp | null, containerSide: Insp): ComparisonRow[] {
  if (field.kind === "scalar") {
    const a = imageSide === null ? null : field.image(imageSide);
    const bb = field.container(containerSide);
    if (a === null && bb === null) return [];
    return [row(field.label, a, bb)];
  }

  const a = imageSide === null ? {} : field.image(imageSide);
  const bb = field.container(containerSide);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(bb)])].sort();
  if (keys.length === 0) return [];

  const out: ComparisonRow[] = [];
  let identical = 0;
  for (const key of keys) {
    const left = Object.hasOwn(a, key) ? (a[key] as string) : null;
    const right = Object.hasOwn(bb, key) ? (bb[key] as string) : null;
    if (left === right) identical += 1;
    else out.push(row(`${field.label} ${key}`, left, right));
  }
  if (identical > 0) {
    // The tally, and it is not decoration: without it a container identical to
    // its image renders nothing for this field at all, and nothing reads exactly
    // like a lookup that failed.
    out.push({ field: field.label, a: `${String(identical)} identical`, b: "", change: "unchanged" });
  }
  return out;
}

export function driftRows(imageSide: Insp | null, containerSide: Insp): ComparisonRow[] {
  return FIELDS.flatMap((f) => rowsFor(f, imageSide, containerSide));
}

/**
 * `/compare`'s rows — the same map with the **container** reader on both sides.
 *
 * So `ports` reads `HostConfig.PortBindings` twice and the two-reader case
 * collapses, which is the whole of why `/compare` is cheap once the map exists.
 */
export function compareRows(left: Insp, right: Insp): ComparisonRow[] {
  return FIELDS.flatMap((f) => {
    if (f.kind === "scalar") {
      const a = f.container(left);
      const bb = f.container(right);
      return a === null && bb === null ? [] : [row(f.label, a, bb)];
    }
    return rowsFor({ ...f, image: f.container }, left, right);
  });
}

// ── The far side ────────────────────────────────────────────────────────────

async function inspectOne(kind: "container" | "image", ref: string): Promise<Insp | null> {
  const argv = kind === "image" ? ["image", "inspect", ref] : ["inspect", ref];
  try {
    const { stdout } = await run("docker", argv, { maxBuffer: 8 << 20 });
    const parsed: unknown = JSON.parse(stdout);
    return Array.isArray(parsed) ? (obj(parsed[0]) as Insp) : null;
  } catch {
    return null;
  }
}

/**
 * **`error` is required when `status` is `"error"`** (C04 I3), and omitting it
 * does not fail loudly — it fails *silently*.
 *
 * `transcript.append` validates and throws (C13 I10); `appendAndCommit` catches,
 * discards the outcome and commits the frame anyway — C23 §5's one stage whose
 * failure loses the outcome, documented and deliberate. For an app author the
 * effect is that a malformed document is **indistinguishable from a verb that
 * did nothing**: no entry, no notice, no diagnostic, the prompt simply clears.
 *
 * Found by reading the frame for `/drift no-such-container` and seeing an empty
 * transcript. FINDINGS F35.
 */
const errorDoc = (command: string, verb: string, text: string): LocalDocument => ({
  schema: "tui.view/1",
  command,
  status: "error",
  error: { message: text, stage: "local" },
  blocks: [b.notice.error(text)],
  meta: { adapter: "drift" },
});

// ── The handlers ────────────────────────────────────────────────────────────

/** How the handler reaches docker. Injected so walk A1 has a way to happen. */
export type Lookup = (kind: "container" | "image", ref: string) => Promise<Insp | null>;

/**
 * **`lookup` is a seam, and the mutation pass is what demanded it.**
 *
 * Walk A1 rules that a failed image lookup keeps the block and empties the
 * column. The row covering it called `driftRows(null, container)` directly — so
 * replacing the handler's whole branch with an error document killed nothing.
 * *A test that calls the mechanism verifies the mechanism, never the wiring*,
 * and this is that recurrence for the third time in this project.
 *
 * It could not be driven any other way: docker **refuses** to remove an image a
 * running container references — `cannot be forced` — so the state walk A1
 * describes is not reachable by removing anything. It is reachable by a daemon
 * that fails the second call, which is what this parameter lets a test be.
 */
export function createDriftHandler(
  lookup: Lookup = inspectOne,
): (argv: readonly string[], ctx: { command: string }) => Promise<LocalDocument> {
  return async (argv, ctx) => {
    const ref = argv[0];
    if (ref === undefined || ref === "") {
      return errorDoc(ctx.command, "drift", "usage: /drift <container>");
    }

    const container = await lookup("container", ref);
    if (container === null) return errorDoc(ctx.command, "drift", `no such container: ${ref}`);

    const imageRef = typeof container["Image"] === "string" ? container["Image"] : "";
    const imageSide = imageRef === "" ? null : await lookup("image", imageRef);

    /**
     * **A failed image lookup keeps the block** (DRIFT_WALK A1).
     *
     * The container's own facts are still perfectly good, and the thing that
     * reports the absence must not replace the thing that would have explained
     * it — S3's `renderError` lesson pointed at a two-source block. Every `a`
     * becomes `—`, every verdict `changed`, and the notice says why.
     */
    const missing =
      imageSide === null
        ? [
            b.notice.warn(
              `the image is unavailable, so every row reads as changed — showing what ${ref} is`,
            ),
          ]
        : [];

    const tagged = obj(imageSide ?? {})["RepoTags"];
    const label =
      Array.isArray(tagged) && typeof tagged[0] === "string" && tagged[0] !== ""
        ? tagged[0]
        : imageRef.replace(/^sha256:/u, "").slice(0, 12) || "unknown";

    // **The head block is gone: the columns say it themselves now** (F33). It
    // named the two sides one block above the columns it explained, which was
    // the workaround F33 recorded as *not the same thing*.
    const blocks: Block[] = [
      ...missing,
      b.comparison(driftRows(imageSide, container), {
        id: "drift-rows",
        labels: [label, ref],
      }),
    ];

    return {
      schema: "tui.view/1",
      meta: { adapter: "drift" },
      command: ctx.command,
      status: "ok",
      blocks,
    };
  };
}

export function createCompareHandler(): (
  argv: readonly string[],
  ctx: { command: string },
) => Promise<LocalDocument> {
  return async (argv, ctx) => {
    const [left, right] = argv;
    if (left === undefined || right === undefined) {
      return errorDoc(ctx.command, "compare", "usage: /compare <a> <b>");
    }

    const [a, bb] = await Promise.all([
      inspectOne("container", left),
      inspectOne("container", right),
    ]);
    const absent = [a === null ? left : "", bb === null ? right : ""].filter((x) => x !== "");
    if (a === null || bb === null) {
      return errorDoc(ctx.command, "compare", `no such container: ${absent.join(", ")}`);
    }

    return {
      schema: "tui.view/1",
      meta: { adapter: "drift" },
      command: ctx.command,
      status: "ok",
      blocks: [
        b.comparison(compareRows(a, bb), { id: "compare-rows", labels: [left, right] }),
      ],
    };
  };
}
