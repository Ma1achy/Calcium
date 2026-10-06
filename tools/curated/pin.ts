/**
 * Re-take the curated pin (C10 I44) — `--write` — or read what has moved since
 * it was taken, which is the default.
 *
 *     npx tsx tools/curated/pin.ts            # what moved, and exit 1 if anything did
 *     npx tsx tools/curated/pin.ts --write    # re-take it, then read the git diff
 *
 * **The write path is deliberately not in the test.** A snapshot with an update
 * flag records what the code does; a pin records what was chosen, and the
 * difference is whether re-taking it is an act or a keystroke. So the row fails
 * with the entries that moved, and a person decides whether those entries were
 * supposed to move before running this.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical, entryDiff } from "../../test/support/curated.js";

const here = dirname(fileURLToPath(import.meta.url));
const path = resolve(here, "../../test/support/curated-pinned.json");
const write = process.argv.includes("--write");

const now = canonical();
const serialised = `${JSON.stringify(now, null, 1)}\n`;

let was: Record<string, unknown> | undefined;
try {
  was = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
} catch {
  was = undefined;
}

if (was === undefined) {
  if (!write) {
    console.error(`FAIL · no pin at ${path} — take one with --write`);
    process.exit(1);
  }
  writeFileSync(path, serialised);
  console.log(`took the pin · ${String(Object.keys(now).length)} tables`);
  process.exit(0);
}

const moved: string[] = [];
for (const name of [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()) {
  for (const line of entryDiff(was[name], now[name])) moved.push(`  ${name} · ${line}`);
}

if (moved.length === 0) {
  console.log(`the pin holds · ${String(Object.keys(now).length)} tables, nothing moved`);
  process.exit(0);
}

// **Capped, because a failure nobody reads is a failure nobody acts on.** The
// first run printed 142 entries; the number that fits on a screen is the number
// that gets read, and the count above it says how much was left out.
const SHOWN = 40;
console.log(`${String(moved.length)} entries moved:`);
for (const line of moved.slice(0, SHOWN)) console.log(line);
if (moved.length > SHOWN) console.log(`  … and ${String(moved.length - SHOWN)} more`);

if (!write) {
  console.error("\nFAIL · nothing written. If these were meant to move, re-take the pin with --write.");
  process.exit(1);
}
writeFileSync(path, serialised);
console.log(`\nre-took the pin · ${String(Object.keys(now).length)} tables. Read the diff.`);
