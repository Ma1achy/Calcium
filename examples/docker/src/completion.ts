/**
 * The app's own completion sources — containers, images, and paths inside a
 * container.
 *
 * C19 §3 hook 4 (A02 §6). **Calcium ships the generic sources and the app ships
 * the domain ones**, and the division is generic-versus-domain rather than
 * static-versus-dynamic: a filesystem is not a domain and a container name is.
 * Every source here is dynamic, because every one of them is a subprocess —
 * which is the whole reason C19 splits the two, and the boundary C19 T2.1a
 * keeps: no keystroke reaches any of these.
 *
 * **This file is the second consumer of the context model**, and the first that
 * needs more of it than a slot kind. `containerPathSource` answers argument two
 * by asking argument one, which is what turned C19's cache key from the slot's
 * identity into the slot plus what precedes it (C19 I24) — under the old key
 * two containers shared one directory listing.
 */

import type { Candidate, CompletionContext, CompletionSource } from "@fmx/calcium";
import { parseNdjson, str, type Row } from "./ndjson.ts";

/**
 * One `docker …` invocation, injected.
 *
 * The same shape and the same reason as C19's `ReadDir` (C19 I17): an ambient
 * call makes every test need a daemon, and the failure mode is a suite that
 * passes on the author's machine. `test/completion.test.ts` drives all three
 * from the corpus, so CI runs them with no docker at all.
 */
export type Run = (args: readonly string[]) => Promise<string>;

/**
 * The arguments that name a container, by the manifest's own names.
 *
 * **Read from the argument rather than from the verb**, which is what makes one
 * source serve nine of them: `logs`, `inspect`, `drift`, `diff`, `top`, `port`,
 * `config` and `container stats` all declare `container`, and `compare` declares
 * `a` and `b`. A list of verbs here would go stale the day a tenth is added, and
 * would go stale silently — the menu would simply be empty.
 */
const CONTAINER_ARGS = new Set(["container", "a", "b"]);

/** `dtui-web` and friends, with their state as the hint. */
export function containerSource(run: Run): CompletionSource {
  return {
    id: "docker.containers",
    slots: ["positional"],
    dynamic: true,
    // **Fifteen seconds, not sixty.** A container's existence is exactly the
    // fact that changes while a user is looking at a terminal — `docker run`
    // in the next window is the ordinary case — and a minute of a stale list
    // is a name the shell offers and the daemon refuses.
    ttlMs: 15_000,
    async complete(ctx) {
      if (ctx.slot.kind !== "positional" || !CONTAINER_ARGS.has(ctx.slot.arg.name)) return [];
      const { rows } = parseNdjson(await run(["ps", "-a", "--format", "json"]));
      return rows.map(containerCandidate);
    },
  };
}

/**
 * The state is a tone and the status is the hint (C04 I6).
 *
 * No glyph and no colour: a `Candidate` carries a `Tone`, which is a palette
 * slot, so a stopped container reads as stopped in every theme and at every
 * colour depth — including the one where it reads as nothing at all, where the
 * status text still says it.
 */
function containerCandidate(row: Row): Candidate {
  const state = str(row, "State");
  return {
    value: str(row, "Names"),
    detail: str(row, "Status"),
    tone: state === "running" ? "ok" : state === "exited" ? "muted" : "warn",
  };
}

/** `nginx:alpine`, for the argument that filters the image list. */
export function imageSource(run: Run): CompletionSource {
  return {
    id: "docker.images",
    slots: ["positional"],
    dynamic: true,
    ttlMs: 60_000,
    async complete(ctx) {
      if (ctx.slot.kind !== "positional" || ctx.slot.arg.name !== "repository") return [];
      const { rows } = parseNdjson(await run(["images", "--format", "json"]));
      const seen = new Set<string>();
      const out: Candidate[] = [];
      for (const row of rows) {
        const repository = str(row, "Repository");
        // A dangling image has `<none>` for both name columns, and there is
        // nothing to type that would select it.
        if (repository === "" || repository === "<none>") continue;
        if (seen.has(repository)) continue;
        seen.add(repository);
        out.push({ value: repository, detail: str(row, "Size"), tone: "identifier" });
      }
      return out;
    },
  };
}

/**
 * Paths inside a container — the source that needs another argument.
 *
 * **`ls -1pL`, and the `p` is the delimiter rule paying off.** It appends `/` to
 * a directory, so the source can say a directory continues and a file is
 * finished (C19 I16) — which only the source can know, and is exactly why the
 * delimiter belongs to the candidate rather than to the engine.
 *
 * **The `L` was measured out of the corpus rather than reasoned.** `-p` marks
 * real directories and not symlinks to them, and `/etc/nginx/modules` on the
 * fixture container is a symlink — so without `-L` it is offered as a finished
 * word with a trailing space, and the one thing the user wants to do with it,
 * descend into it, is the thing it stops them doing. Nothing about the
 * candidate looks wrong; it is the delimiter, which is invisible until it is
 * typed past.
 */
export function containerPathSource(run: Run): CompletionSource {
  return {
    id: "docker.paths",
    slots: ["positional"],
    dynamic: true,
    ttlMs: 15_000,
    // **The directory, and this source is where C19 I25 came from.** The engine
    // keys the cache on the slot and the earlier arguments, which is everything
    // an answer depends on *if* the answer is the slot's — and a listing is the
    // directory's. Without it, `/etc/ngin` then `/etc/` is served the first
    // listing filtered to nothing, and the second Tab draws an empty menu. Read
    // from a frame; the framework's own path source had it too.
    cacheKey: (ctx) => directoryOf(ctx.prefix),
    async complete(ctx) {
      if (ctx.slot.kind !== "positional" || ctx.slot.arg.name !== "path") return [];
      const container = firstArgument(ctx);
      // **Nothing rather than the host's filesystem.** With no container named
      // there is no answer to give, and the wrong one here is a listing of the
      // machine the shell is running on, which reads as a working completion.
      if (container === null) return [];

      const dir = directoryOf(ctx.prefix);
      let listing: string;
      try {
        listing = await run(["exec", container, "ls", "-1pL", dir]);
      } catch {
        // A container that is not running, or a path that is not there. C19
        // drops a throwing source from the request (C19 I6), so this could be
        // left to throw — it returns empty because *no candidates* is the
        // honest answer and a thrown error writes a line to the debug sink for
        // something the user did by typing a directory that does not exist yet.
        return [];
      }

      return listing
        .split("\n")
        .map((line) => line.trim())
        .filter((name) => name !== "")
        .map((name) => ({
          value: `${dir}${name}`,
          // A directory continues; a file is a finished word.
          delimiter: name.endsWith("/") ? "" : " ",
          ...(name.endsWith("/") ? { tone: "info" as const } : {}),
        }));
    },
  };
}

/**
 * The directory the typed prefix is inside, with its trailing slash.
 *
 * `/etc/ngi` is inside `/etc/`, and `/etc` is inside `/` — the prefix names
 * what is being typed, never a directory to list, so the cut is at the last
 * separator and not at the end.
 */
function directoryOf(prefix: string): string {
  const cut = prefix.lastIndexOf("/");
  return cut === -1 ? "/" : prefix.slice(0, cut + 1); // graphemes-ok: a path offset, in the tokeniser's coordinate system
}

/**
 * The first positional argument already typed, or `null`.
 *
 * **Counted from the tool's own name**, because a verb may be several words
 * (C05 §2): `container stats web` has the container at token 2 and `logs web`
 * at token 1, and a fixed index is wrong for one of them. Flags are skipped so
 * `/config --raw web /e` still finds `web`.
 */
function firstArgument(ctx: CompletionContext): string | null {
  const words = ctx.tool === null ? 1 : ctx.tool.name.split(" ").length;
  const after = ctx.tokens.slice(words, ctx.tokenIndex); // graphemes-ok: a token array, not text
  for (const token of after) {
    if (token.text.startsWith("-")) continue;
    if (token.text !== "") return token.text;
  }
  return null;
}

/** All three, for `TuiConfig.completionSources`. */
export function dockerSources(run: Run): readonly CompletionSource[] {
  return [containerSource(run), imageSource(run), containerPathSource(run)];
}
