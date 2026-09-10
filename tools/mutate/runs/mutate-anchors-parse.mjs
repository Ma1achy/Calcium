// `tools/mutate/anchors.mjs` — the parse arms (F997, F1030).
//
// **The sweep is the thing you run instead of the pass**, so its own blind spots
// are worth a pass. This one is about the question a text sweep cannot answer
// for itself: `anchorsOf` matches a `from:` out of a file that is not a program,
// and `silenceOf` reads its tail, and both are perfectly happy — so a run with a
// `const` declared twice reported *1005 anchors · 937 expectations · no run
// drifted from what the list says* while dying before its first mutation.
//
// Five mutations and a control, each a clause of MA8 rather than a restatement
// of it: the arm being off, the counter that proves it ran at all, the exit path,
// the location in the message, and the abandonment of a file that cannot start.
//
// `process.execPath → "node"` is **not** here and is recorded in MA8's stead: it
// is an expected survivor in this container, where `node` on the PATH is the same
// binary, and a row that cannot fail is worse than no row. What it guards is a
// second runtime on a developer's PATH answering for the one that runs the pass.
//
// **And the second parse arm** (F279, F1030): the sweep read `{file, from}` and
// never the `to` beside it, so a re-anchoring that left the old replacement
// behind spliced a statement into an object literal and reported `no drift`
// minutes before every suite failed to transform. Three rows below are that arm
// — the check off, the counter, and the replacement quoted in the message.
//
// **The fourth clause has no row and the reason is the residue, not an
// oversight.** `parseOf(body) === null` keeps the blame on the mutation rather
// than on a source that was already broken, and no fixture here can break a
// source: `--dir` fabricates a *runs* directory and every `file:` in it still
// resolves against the real tree. A mutation nothing can catch survives exactly
// like a test gap, so it is recorded here instead of shipped as a row.
//
// Anchors checked for uniqueness before the pass (F219); the atomic `fsIo` (F237).
import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SWEEP = "tools/mutate/anchors.mjs";

const FILES = "test/unit/mutate-anchors.test.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    return e.killed === true ? `${out}\nTIMED OUT after 300000ms` : out;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SWEEP,
    from: "    const hits = body.split(from).length - 1;",
    to: "    const hits = 1;",
    why:
      "every anchor resolves exactly once by fiat, so the stale arm and the " +
      "ambiguous arm both go quiet and MA2 stops seeing its own fabrication",
  },
  mutations: [
    {
      // **The arm off.** The shape F997 is about: the sweep reads the run as
      // text and never asks node whether the text is a program.
      name: "no run is handed to node --check",
      file: SWEEP,
      from: '  const r = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });\n  if (r.status === 0) return null;',
      to: '  const r = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });\n  if (r.status !== null) return null;',
      expect: "MA8",
    },
    {
      // **The counter.** A gate's exit status is one bit and it is the same bit
      // for *clean* and for *did not run*; without this the row above passes on
      // a checker that reads an empty corpus.
      name: "the parsed count is not incremented",
      file: SWEEP,
      from: "  parsed += 1;\n",
      to: "",
      expect: "MA8",
    },
    {
      // **The exit path.** The message can be composed perfectly and dropped
      // before `problems`, which is F768's shape one arm over: the report is
      // right and the status is zero.
      name: "a parse error is composed and never gated on",
      file: SWEEP,
      from: "const problems = [...unparseable, ...malformed, ...splices, ...unresolvable, ...unreachable];",
      to: "const problems = [...malformed, ...splices, ...unresolvable, ...unreachable];",
      expect: "MA8",
    },
    {
      // **The location.** A count that says one run is broken sends the reader
      // to a second tool to learn where — `missingWhat`'s argument, which this
      // file already lost once and repaired.
      name: "the parse error drops the line it is on",
      file: SWEEP,
      from: "  return at === null ? why : `${why} (line ${at[1]})`;",
      to: "  return why;",
      expect: "MA8",
    },
    {
      // **The arm off** (F1030). `parseOf` stays correct, the counter keeps
      // counting, and every mutation whose `to` is not a program is reported as
      // clean — which is the whole of F279.
      name: "the applied result is never handed to the parser",
      file: SWEEP,
      from: "        const why = parseOf(body.replace(from, to));",
      to: "        const why = null;",
      expect: "MA9",
    },
    {
      // **The counter**, on the row above's own argument one step out: an arm
      // that applies nothing exits 0 exactly as a clean one does, and MA9's
      // control is the number rather than the absence of a complaint.
      name: "the applied count is not incremented",
      file: SWEEP,
      from: "        applied += 1;\n",
      to: "",
      expect: "MA9",
    },
    {
      // **The replacement quoted.** A message naming the run and not the pair
      // sends the reader to a file of thirty mutations to find which one — the
      // `missingWhat` argument this file has already paid for once.
      name: "the splice message drops the replacement it is about",
      file: SWEEP,
      from: "              `${why}\\n      to ${JSON.stringify(to).slice(0, 88)}`,",
      to: "              `${why}`,",
      expect: "MA9",
    },
    {
      // **The abandonment.** Reading on through a file that cannot start stacks
      // its stale anchors on top of the one thing that must be fixed first, and
      // invites the re-anchoring nobody ran — `KNOWN_STALE`'s own hazard.
      name: "a run that cannot parse is read on through",
      file: SWEEP,
      from: "(F997)`);\n    continue;\n  }",
      to: "(F997)`);\n  }",
      expect: "MA8",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
