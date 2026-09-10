// The JSON tokens, mutated — and the rows are indexed by *what a green suite
// cannot tell apart* (F1).
//
// **Three states that share their spelling.** `undefined`, `[]` and `["--json"]`
// all resolve to *something is appended or nothing is*, and two of the three
// pairs are indistinguishable to a row that asserts only one of them. So the
// mutations here collapse the states onto each other rather than breaking the
// append: an implementation that conflates absent with empty passes every
// assertion about a declared sequence, and one that merges instead of replacing
// passes every assertion about a verb that declares nothing.
//
// The control empties the append entirely: if that survives, no row here is
// earned.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/transport.test.ts test/unit/manifest.test.ts test/contract/transport.test.ts test/contract/manifest.test.ts";
const ARGV = "src/data/transport/argv.ts";
const FIND = "src/data/manifest/find.ts";
const PARSE = "src/data/manifest/parse.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: ARGV,
    from: "  return argv.includes(first) ? [...argv] : [...argv, ...tokens];",
    to: "  return [...argv];",
    why: "nothing is ever appended, so no far side is ever asked for JSON — a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **The dedupe widened to the whole sequence** (C05 §8c row 5). A user who
      // typed `-o yaml` gets `-o json` appended after it and is silently
      // overridden; with a single-token flag the two readings agree, which is
      // why the row that catches this has to use a valued one.
      name: "the dedupe matches the sequence rather than its first token",
      file: ARGV,
      from: "  return argv.includes(first) ? [...argv] : [...argv, ...tokens];",
      to: "  return tokens.every((t) => argv.includes(t)) ? [...argv] : [...argv, ...tokens];",
      expect: "T1.15",
    },
    {
      // **Empty collapsed onto absent.** A verb that already emits JSON can no
      // longer say so, and every assertion about a *declared* sequence still
      // passes — which is the whole reason the three states are one row.
      name: "an empty declaration falls back to the default",
      file: ARGV,
      from: "  const tokens = flag ?? DEFAULT_JSON_FLAG;\n  const first = tokens[0];\n  if (first === undefined) return [...argv];",
      to: "  const tokens = flag === undefined || flag.length === 0 ? DEFAULT_JSON_FLAG : flag;\n  const first = tokens[0];\n  if (first === undefined) return [...argv];",
      expect: "T1.14",
    },
    {
      // **The resolution inverted**: the manifest wins over the verb. Every
      // parse assertion stays green, because the parser is not what resolves —
      // this is the seam row's whole subject.
      name: "the manifest's tokens win over the verb's",
      file: FIND,
      from: "  return tool.jsonFlag ?? manifest.jsonFlag;",
      to: "  return manifest.jsonFlag ?? tool.jsonFlag;",
      expect: "T1.20b",
    },
    {
      // **The two merged rather than replaced.** A verb overriding `--format
      // json` with `--format {{json .}}` would spawn both, and a verb that
      // declares nothing is unaffected — so a row driving only the inherit case
      // agrees with this.
      name: "a verb's tokens are appended to the manifest's",
      file: FIND,
      from: "  return tool.jsonFlag ?? manifest.jsonFlag;",
      to: "  return tool.jsonFlag === undefined\n    ? manifest.jsonFlag\n    : [...(manifest.jsonFlag ?? []), ...tool.jsonFlag];",
      expect: "T1.20b",
    },
    {
      // **The parser conflates absent with malformed**, which is
      // `takeStringArray`'s behaviour and is right for a member whose two
      // states are *given* and *not given*. Here it makes a bad declaration
      // read as no declaration, so the verb silently inherits.
      name: "a malformed declaration parses as an absent one",
      file: PARSE,
      from: '  const v = src["jsonFlag"];\n  if (v === undefined) return undefined;\n  if (!Array.isArray(v)) {',
      to: '  const v = src["jsonFlag"];\n  if (v === undefined || !Array.isArray(v)) return undefined;\n  if (!Array.isArray(v)) {',
      expect: "T1.21",
    },
    {
      // **The refusal on a local verb dropped.** A declaration that cannot take
      // effect parses, and an author reads the manifest back and believes it.
      name: "a local verb may declare tokens it can never use",
      file: PARSE,
      from: "  if (local && jsonFlag !== undefined) {",
      to: "  if (false && local && jsonFlag !== undefined) {",
      expect: "T1.21",
    },
    {
      // **The default written into the parser.** *Declared as `--json`* and
      // *not declared* become the same value, so the round trip holds about a
      // manifest the app did not write — T2.7's own shape, one member along.
      name: "the parser writes the default in rather than leaving it absent",
      file: PARSE,
      from: '  const jsonFlag = takeJsonFlag(raw, e, "");',
      to: '  const jsonFlag = takeJsonFlag(raw, e, "") ?? ["--json"];',
      expect: "T1.20",
    },
    {
      // **An empty token admitted.** `["--format", ""]` spawns a bare empty
      // argument, which most far sides read as a positional and none reads as
      // nothing.
      name: "an empty token is admitted",
      file: PARSE,
      from: '    if (typeof item !== "string" || item.length === 0) {',
      to: '    if (typeof item !== "string") {',
      expect: "T1.21",
    },
  ],
});

console.log(report(results));

// **A run says what it found and exits on it** (F768): a pass that prints
// nothing and exits 0 is indistinguishable from one that never ran.
const survivors = results.filter((r) => !r.killed);
process.exit(survivors.length > 0 ? 1 : 0);
