/**
 * One digest over every catalogue frame — **because `git status` cannot see
 * them** (F257).
 *
 * `docs/catalogue/` is in `.gitignore`: it is generated output and is not
 * committed. So `git status --porcelain docs/catalogue | wc -l` returns **0
 * whether a frame moved or not**, and three commit messages in this session
 * cited it as evidence that a refactor changed nothing. It is the same bit for
 * *clean* and for *cannot see*.
 *
 * The goldens are tracked and their check was real; this is what the catalogue
 * half needed. Print before, refactor, print after, compare.
 *
 * Run: npx tsx tools/catalogue-hash.mjs [--dir <path>]
 *
 * **The `--dir` flag is `roadmap-status.mjs`'s `--file` for the same reason.**
 * The property worth asserting is *the digest moves when a frame moves*, and
 * that row cannot be written against the real directory without mutating the
 * thing being measured. A tool with no such seam gets certified by rows that
 * only ever see the answer it already prints.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_DIR = join(import.meta.dirname, "..", "docs", "catalogue");

/** `n frames · <16 hex>` over every `.txt` in `dir`, in name order. */
export function digestOf(dir = DEFAULT_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  const all = createHash("sha256");
  // **The name goes into the digest as well as the bytes**, so a frame renamed
  // and a frame rewritten are both a change. Hashing contents alone would call
  // a swapped pair identical.
  for (const f of files) all.update(f).update(readFileSync(join(dir, f)));
  return { frames: files.length, digest: all.digest("hex").slice(0, 16) };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const i = process.argv.indexOf("--dir");
  const { frames, digest } = digestOf(i === -1 ? DEFAULT_DIR : process.argv[i + 1]);
  console.log(`${frames} frames · ${digest}`);
}
