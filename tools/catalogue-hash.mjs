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

/**
 * A digest over the `.txt` frames in `dir`, in name order.
 *
 * **`group` splits two populations that share a directory** (F264). The
 * catalogue's 890 frames are the *terminal* arm and `plot-catalogue.mjs` writes
 * them; the 66 `phase*` frames are the SVG arm's and `phase-catalogue.mjs`
 * writes them. Hashed as one, **a frame the SVG arm was meant to add is
 * indistinguishable from a terminal frame that moved** — and the gate this tool
 * exists for is *the terminal arm is untouched*.
 *
 * It happened on the first commit that added one: claiming three forms took the
 * total from `e25a2defe7da643d` to `9be0fef40a38305e` with **every one of the
 * 890 byte-identical**, measured by stashing and regenerating. A digest that
 * cannot tell an addition from a change reports the gate failing when it held.
 */
export function digestOf(dir = DEFAULT_DIR, group = "all") {
  const keep = group === "catalogue" ? (f) => !f.startsWith("phase")
    : group === "phase" ? (f) => f.startsWith("phase")
    : () => true;
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt") && keep(f)).sort();
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
  const dir = i === -1 ? DEFAULT_DIR : process.argv[i + 1];
  // **Both, always.** A single line is what conflated them, and a flag would
  // make the split something a caller has to remember at the moment it matters.
  for (const group of ["catalogue", "phase"]) {
    const { frames, digest } = digestOf(dir, group);
    console.log(`${group.padEnd(9)} ${String(frames).padStart(4)} frames · ${digest}`);
  }
}
