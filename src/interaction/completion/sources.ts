/**
 * The sources that ship with the framework.
 *
 * C19 §3 — see spec. Static ones read only C05; the two dynamic ones read a
 * directory through an injected seam (I17).
 *
 * **Nothing here names a verb, a flag or an enum value** (I4, SS22). Every
 * candidate is a projection of the manifest, which is what makes T4.1 true: a
 * flag added on the far side becomes completable with no TypeScript change. A
 * literal list here is how that stops being true, and it looks harmless.
 */

import { visibleTools, type Manifest, type ToolDef } from "./deps.js";
import type { Candidate, CompletionSource } from "./types.js";

/**
 * What the filesystem sources are given (I17).
 *
 * Narrow on purpose: a name and whether it is a directory is the whole of what
 * completion needs, and taking a `Dirent` would let a later edit reach for a
 * mode bit without anyone noticing the seam had grown.
 */
export type DirEntry = Readonly<{ name: string; directory: boolean }>;
export type ReadDir = (path: string) => Promise<readonly DirEntry[]>;

function starts(value: string, prefix: string): boolean {
  return value.startsWith(prefix);
}

/** Sub-verbs are spaces in a tool name (C05 §2), so the depth is a word count. */
function words(name: string): readonly string[] {
  return name.split(" ");
}

/**
 * `/` completes the manifest (I14).
 *
 * Offers the next word of each visible tool name rather than the whole name, so
 * `serving scale` completes as `serving` and then `scale` — the shape the
 * manifest already declares, read one level at a time.
 *
 * `visibleTools` rather than `manifest.tools`: a `hidden` tool still resolves
 * and still runs, and dropping it here is the whole of what `hidden` means
 * (C05 I11, T4.2).
 */
export function verbSource(manifest: () => Manifest | null): CompletionSource {
  return {
    id: "verbs",
    slots: ["verb"],
    dynamic: false,
    complete(ctx) {
      const m = manifest();
      if (m === null) return [];
      const typed = ctx.prefix.startsWith("/") ? ctx.prefix.slice(1) : ctx.prefix;
      const seen = new Map<string, Candidate>();
      for (const tool of visibleTools(m)) {
        const head = words(tool.name)[0] as string;
        if (!starts(head, typed)) continue;
        const leaf = words(tool.name).length === 1; // graphemes-ok: a word count, not text
        seen.set(head, {
          value: `/${head}`,
          ...(leaf ? { detail: tool.summary } : {}),
          // A tool with sub-verbs is unfinished, so its delimiter is a space and
          // the next `Tab` completes the sub-verb (I16).
          delimiter: " ",
        });
      }
      return [...seen.values()];
    },
  };
}

/** `--` completes the resolved tool's flags, exactly (I4, T1.5). */
export function flagNameSource(): CompletionSource {
  return {
    id: "flags",
    slots: ["flagName"],
    dynamic: false,
    complete(ctx) {
      if (ctx.tool === null) return [];
      const typed = ctx.prefix.slice(2);
      return ctx.tool.flags
        .filter((f) => starts(f.name, typed))
        .map((f) => ({
          value: `--${f.name}`,
          detail: f.summary,
          // The `--flag=value` form arrives here rather than as a rule of its
          // own (§5): a flag that takes a value is unfinished, and `=` is the
          // form that cannot be misread as a flag followed by a positional.
          delimiter: f.type === "bool" ? " " : "=",
        }));
    },
  };
}

/** Enum values come from the flag's own `values` (I4, T1.6). */
export function flagValueSource(): CompletionSource {
  return {
    id: "flag-values",
    slots: ["flagValue"],
    dynamic: false,
    complete(ctx) {
      if (ctx.slot.kind !== "flagValue") return [];
      // `ctx.prefix` is already the value, not the whole `--flag=value` token
      // (§2): the context makes the value its own sub-token, so this source and
      // the engine's filter agree about what a candidate is matched against.
      const values = ctx.slot.flag.values ?? [];
      return values.filter((v) => starts(v, ctx.prefix)).map((v) => ({ value: v, delimiter: " " }));
    },
  };
}

/** A positional declaring `values` is an enum in argument position. */
export function positionalSource(): CompletionSource {
  return {
    id: "positionals",
    slots: ["positional"],
    dynamic: false,
    complete(ctx) {
      if (ctx.slot.kind !== "positional") return [];
      const { arg } = ctx.slot;
      return (arg.values ?? [])
        .filter((v) => starts(v, ctx.prefix))
        .map((v) => ({ value: v, detail: arg.name, delimiter: " " }));
    },
  };
}

/**
 * Paths, over the injected reader (I3, I17).
 *
 * Dynamic because it is I/O, and the consequence is the one §3 states rather
 * than leaves to be discovered: **there is no ghost text for a path.** `Tab` is
 * required, and that is the cost of not stat-ing the filesystem on every
 * keystroke.
 *
 * A directory's delimiter is `/`, which only this source can know (I16).
 */
/** The directory a prefix is inside, with its separator — the path cache's key. */
function directoryOf(prefix: string): string {
  const cut = prefix.lastIndexOf("/");
  return cut === -1 ? "." : prefix.slice(0, cut + 1); // graphemes-ok: a path offset in the tokeniser's coordinate system
}

export function pathSource(readDir: ReadDir): CompletionSource {
  return {
    id: "paths",
    slots: ["path"],
    dynamic: true,
    // **The directory, because that is what the answer is about** (I25). Under
    // the slot's key alone, `ls /et⇥` lists `/` and `ls /etc/⇥` is served that
    // listing filtered to nothing — the second `Tab` appears to do nothing.
    // Found from a frame in the reference application, whose own path source
    // has the same shape.
    cacheKey: (ctx) => directoryOf(ctx.prefix),
    async complete(ctx) {
      const cut = ctx.prefix.lastIndexOf("/");
      const dir = cut === -1 ? "." : ctx.prefix.slice(0, cut + 1);
      const typed = cut === -1 ? ctx.prefix : ctx.prefix.slice(cut + 1);
      const entries = await readDir(dir === "" ? "/" : dir);
      return entries
        .filter((e) => starts(e.name, typed))
        .map((e) => ({
          value: `${dir === "." ? "" : dir}${e.name}`,
          display: e.name,
          delimiter: e.directory ? "/" : " ",
        }));
    },
  };
}

/**
 * Bare executables on `PATH` (I14, I3).
 *
 * The other half of D25: a leading `/` never reaches here, so the two namespaces
 * cannot both answer one keystroke.
 */
export function executableSource(readDir: ReadDir, path: () => readonly string[]): CompletionSource {
  return {
    id: "executables",
    slots: ["executable"],
    dynamic: true,
    async complete(ctx) {
      if (ctx.prefix.startsWith("/")) return [];
      const seen = new Set<string>();
      const out: Candidate[] = [];
      for (const dir of path()) {
        let entries: readonly DirEntry[];
        try {
          entries = await readDir(dir);
        } catch {
          // A directory on PATH that does not exist is normal, and it is not
          // this source's failure (I6 covers the source; this covers one entry).
          continue;
        }
        for (const e of entries) {
          if (e.directory || seen.has(e.name) || !starts(e.name, ctx.prefix)) continue;
          seen.add(e.name);
          out.push({ value: e.name, delimiter: " " });
        }
      }
      return out;
    },
  };
}

/** The framework's set, in one call. */
export function frameworkSources(
  deps: Readonly<{ manifest: () => Manifest | null; readDir: ReadDir; path: () => readonly string[] }>,
): readonly CompletionSource[] {
  return Object.freeze([
    verbSource(deps.manifest),
    flagNameSource(),
    flagValueSource(),
    positionalSource(),
    pathSource(deps.readDir),
    executableSource(deps.readDir, deps.path),
  ]);
}

export type { ToolDef };
