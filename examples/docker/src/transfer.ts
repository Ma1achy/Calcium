/**
 * The file-transfer tail — `cp` `commit` `export` `save` `load` `import`.
 *
 * ## The far side, measured
 *
 * | | |
 * |---|---|
 * | `commit` | exit 0, stdout is `sha256:…` and nothing else |
 * | `cp`, `save -o`, `export -o` | exit 0, **no output at all** |
 * | `cp` with a bad path | exit 1, `Error response from daemon: Could not find the file …` |
 * | **`save` or `export` with no `-o`** | **writes the tar to stdout** |
 *
 * The last row is why this file has a guard in it. `docker save nginx` with no
 * `-o` emits a multi-megabyte tarball on stdout, and a transcript is not a pipe:
 * the bytes would be read into a document, measured, and drawn. Four megabytes
 * of binary is not a rendering problem to solve, it is an invocation not to make
 * — so the verb refuses and says which flag is missing.
 *
 * **That is the app's guard and not the framework's**, deliberately. C06 caps
 * what it retains, so Calcium would survive it; what it cannot know is that
 * *this particular verb* has a shape where the absence of a flag changes the
 * output from nothing to everything. Only the manifest's author knows that.
 *
 * ## Silence is the success case
 *
 * Three of these six print nothing at all when they work, so a handler that
 * reported stdout would report an empty document for every successful copy. The
 * notice is composed from what was asked for rather than from what came back —
 * which is only correct because the exit code is checked first.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { b } from "@fmx/calcium";
import type { LocalDocument, Block, LocalContext, ViewDocument } from "@fmx/calcium";
import type { Runner } from "./mutation.ts";

const run = promisify(execFile);
const realRunner: Runner = async (args) => await run("docker", [...args], { maxBuffer: 8 << 20 });

type Kind = "cp" | "commit" | "export" | "save" | "load" | "import";

const okDoc = (command: string, argv: readonly string[], blocks: readonly Block[]): LocalDocument => ({
  schema: "tui.view/1",
  meta: { adapter: "transfer" },
  command,
  status: "ok",
  blocks,
});

const errorDoc = (
  command: string,
  argv: readonly string[],
  message: string,
  extra: readonly Block[] = [],
): LocalDocument => ({
  schema: "tui.view/1",
  command,
  status: "error",
  error: { message, stage: "local" },
  blocks: [b.notice.error(message), ...extra],
  meta: { adapter: "transfer" },
});

const USAGE: Readonly<Record<Kind, string>> = {
  cp: "usage: /cp <src> <dest>  — either side may be <container>:<path>",
  commit: "usage: /commit <container> [<image>]",
  export: "usage: /export <container> --output <file.tar>",
  save: "usage: /save <image> --output <file.tar>",
  load: "usage: /load --input <file.tar>",
  import: "usage: /import <file.tar> [<image>]",
};

/** How many positional arguments each verb needs before it will run. */
const NEEDS: Readonly<Record<Kind, number>> = {
  cp: 2,
  commit: 1,
  export: 1,
  save: 1,
  load: 0,
  import: 1,
};

const hasOutput = (args: readonly string[]): boolean =>
  args.some((a) => a === "--output" || a === "-o" || a.startsWith("--output="));

const hasInput = (args: readonly string[]): boolean =>
  args.some((a) => a === "--input" || a === "-i" || a.startsWith("--input="));

const positionals = (args: readonly string[]): string[] => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a.startsWith("-")) {
      // `--output file` consumes the next token; `--output=file` does not.
      if (!a.includes("=") && (a === "--output" || a === "-o" || a === "--input" || a === "-i")) i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
};

const DONE: Readonly<Record<Kind, (pos: readonly string[]) => string>> = {
  cp: (p) => `copied ${p[0] ?? ""} → ${p[1] ?? ""}`,
  commit: (p) => `committed ${p[0] ?? ""}`,
  export: (p) => `exported ${p[0] ?? ""}`,
  save: (p) => `saved ${p[0] ?? ""}`,
  load: () => "loaded",
  import: (p) => `imported ${p[0] ?? ""}`,
};

export function createTransferHandler(
  kind: Kind,
  runner: Runner = realRunner,
): (args: readonly string[], ctx: LocalContext) => Promise<LocalDocument> {
  return async (args, ctx) => {
    const pos = positionals(args);
    if (pos.length < NEEDS[kind]) return errorDoc(ctx.command, [kind], USAGE[kind]);

    // **The guard the measurement bought.** Without `-o` these two write the
    // tarball to stdout, and a transcript is not a pipe.
    if ((kind === "save" || kind === "export") && !hasOutput(args)) {
      return errorDoc(
        ctx.command,
        [kind],
        `\`/${kind}\` writes a tar archive, and with no --output it would write it into this transcript`,
        [
          b.tip(`/${kind} ${pos[0] ?? "<ref>"} --output ./${pos[0]?.replace(/[:/]/gu, "-") ?? "out"}.tar`, [
            b.fill(
              "Use",
              `/${kind} ${pos[0] ?? "<ref>"} --output ./${pos[0]?.replace(/[:/]/gu, "-") ?? "out"}.tar`,
            ),
          ]),
        ],
      );
    }
    if (kind === "load" && !hasInput(args)) {
      return errorDoc(ctx.command, [kind], "`/load` needs --input <file.tar>; it cannot read a terminal");
    }

    const argv = [kind, ...args];
    let stdout = "";
    try {
      ({ stdout } = await runner(argv));
    } catch (cause) {
      const said = String((cause as { stderr?: string }).stderr ?? cause).trim();
      return errorDoc(ctx.command, argv, said || `\`/${kind}\` failed`);
    }

    // Silence is the success case for three of these, so the notice is composed
    // from what was asked for. `commit` is the exception and says what it made.
    const digest = /sha256:[0-9a-f]{12,}/u.exec(stdout)?.[0];
    const blocks: Block[] = [b.notice.ok(DONE[kind](pos))];
    if (digest !== undefined) blocks.push(b.kv({ image: digest.slice(0, 19) }));
    return okDoc(ctx.command, argv, blocks);
  };
}

export function transferHandlers(
  runner: Runner = realRunner,
): Record<string, (args: readonly string[], ctx: LocalContext) => Promise<LocalDocument>> {
  const kinds: readonly Kind[] = ["cp", "commit", "export", "save", "load", "import"];
  return Object.fromEntries(kinds.map((k) => [k, createTransferHandler(k, runner)]));
}
