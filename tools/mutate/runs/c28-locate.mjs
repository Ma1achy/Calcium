// C28 I65 — a sampled frame is located through its chunk's source map when the
// profile is folded, and a frame with no map keeps its URL. Mutated (T6.20,
// F1193).
//
// **The control is a locator that never answers.** T1.129's located arm reads
// the chunk's URL where the source's was expected.
//
// **Blind spot, stated.** *Read at start rather than at the fold* is a
// duration and no row here sees it; I65 states it and A04 §5 carries the
// measured cost. The `file:` guard is mutated by no row either: a `node:` URL
// handed to `fileURLToPath` throws, which the try around the read turns into
// `null` — the same answer by a worse route.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/unit/profiling-locate.test.ts test/e2e/profiling-locate.test.ts";
const L = "src/shell/profiling/locate.ts";
const S = "src/shell/profiling/stacks.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const BUFFER = 256 * 1024 * 1024;
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: BUFFER });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: L,
    from: "    const map = mapFor(url);\n    if (map === null) return null;",
    to: "    const map = mapFor(url);\n    if (map === null || map !== null) return null;",
    why: "the locator never answers: T1.129's located arm reads the chunk's URL",
  },
  mutations: [
    {
      // **The map read on every frame.** Three frames, three reads.
      name: "NO-CACHE: the parsed map is not held between frames",
      file: L,
      from: "    maps.set(url, map);\n    return map;",
      to: "    return map;",
      expect: "T1.129",
    },
    {
      // **One line out.** The card names the line after the one sampled.
      name: "LINE-OFF: the located line is one past the map's",
      file: L,
      from: "line: entry.originalLine });",
      to: "line: entry.originalLine + 1 });",
      expect: "T1.129",
    },
    {
      // **The column ignored.** Two segments on one generated line collapse to
      // the first, and (0,2) answers line 0 where the map says 1.
      name: "COLUMN-IGNORED: findEntry is asked at column 0",
      file: L,
      from: "    const entry: Partial<Readonly<{ originalSource: string; originalLine: number }>> = map.findEntry(line, column);",
      to: "    const entry: Partial<Readonly<{ originalSource: string; originalLine: number }>> = map.findEntry(line, 0);",
      expect: "T1.129",
    },
    {
      // **An empty entry read as a hit.** A position before the first mapping
      // answers `{}`, and a URL built from `undefined` throws out of the fold.
      name: "EMPTY-IS-HIT: the empty-entry guard is dropped",
      file: L,
      from: '    if (typeof entry.originalSource !== "string" || entry.originalSource === "") return null;\n',
      to: "",
      expect: "T1.129",
    },
    {
      // **An unlocated frame dropped.** The fold answers `null` for `at` where
      // V8 gave a URL, and the plain fold's arm reads nothing.
      name: "FOLD-DROPS-UNLOCATED: a frame the locator cannot name loses its URL",
      file: S,
      from: "  return found === null ? `${url}:${String(line + 1)}` : `${found.url}:${String(found.line + 1)}`;",
      to: "  return found === null ? null : `${found.url}:${String(found.line + 1)}`;",
      expect: "T1.129",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
