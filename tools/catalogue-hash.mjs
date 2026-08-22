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
 * Run: npx tsx tools/catalogue-hash.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "docs", "catalogue");
const files = readdirSync(OUT).filter((f) => f.endsWith(".txt")).sort();
const all = createHash("sha256");
for (const f of files) all.update(f).update(readFileSync(join(OUT, f)));
console.log(`${files.length} frames · ${all.digest("hex").slice(0, 16)}`);
