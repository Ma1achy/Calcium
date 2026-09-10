// F999, F1000 and F1001 mutated — three findings whose defects were all of one
// shape: **a thing that is complete on every side and reaches nobody.**
//
// F999's `Camera` resolved, compiled and was used in nine files, and was missing
// only from the one surface a consumer can see. F1000's barrel line had a
// consumer and MG25 could not say which. F1001's `debug` sink had seven writers,
// two forwards and no argument at the call site that starts the chain — every
// hop optional, every hop correct, and a no-op in every real session.
//
// So the rows below are indexed by **what a green suite cannot tell apart**: an
// export removed while every example still compiles; a residue list that still
// reads as deliberate with a name missing from it; a sink that records the last
// N instead of the first, or drains one statement too early. Three of them are
// mutations of the *instruments* rather than of `src/`, because two of the four
// defects found while building these rows were in the resolver and not in the
// tree — a rule that works on the corpus and fails its own fabrication is a rule
// whose fabrication is vacuous.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/public-surface.test.ts test/unit/public-surface-barrels.test.ts test/integration/session-debug-sink.test.ts";

const ENTRY = "src/index.ts";
const SURFACE = "test/contract/public-surface.test.ts";
const BARREL = "src/presentation/image/index.ts";
const BARRELS = "test/unit/public-surface-barrels.test.ts";
const SESSION = "src/shell/session.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

/**
 * Survivors with a reason.
 *
 * **The residue row watches the consumers, not the surface**, which was measured
 * rather than assumed: removing `Camera` from the entry leaves *no app indexes
 * for a name `src/` declares* green, because closing F999 deleted the index
 * expressions and its population no longer holds them. That is the right shape
 * for a residue and the wrong one for a gate, and it is why the resolution row
 * exists beside it — so the mutation below is expected to be caught by the
 * second row and not the first.
 *
 * Nothing here is expected to survive outright. An entry that starts being
 * caught fails the pass, which is the arm that stops a list outliving its
 * reason.
 */
const EXPECTED_SURVIVORS = new Map();

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SESSION,
    from: "  #recordDebug(chunk: string): void {\n    for (const line of chunk.split(\"\\n\")) {",
    to: "  #recordDebug(chunk: string): void {\n    if (chunk !== undefined) return;\n    for (const line of chunk.split(\"\\n\")) {",
    why: "nothing is ever recorded, so the sink is empty in every session — a run where this survives cannot see a kill",
  },
  mutations: [
    // --- F999 — the two names, and the resolver that finds them -------------
    {
      // **The export removed and nothing else breaks.** The framework compiles,
      // both examples compile, and the only evidence is an alias coming back
      // into an app file under a framework name. C24 T6.17.
      name: "F999: `Camera` leaves the runtime entry",
      file: ENTRY,
      from: "  Block,\n  Camera,\n  Cell,\n",
      to: "  Block,\n  Cell,\n",
      expect: "the two clearances are two arms",
    },
    {
      name: "F999: `PlotForm` leaves the runtime entry",
      file: ENTRY,
      from: "  Plot,\n  PlotForm,\n  Progress,\n",
      to: "  Plot,\n  Progress,\n",
      expect: "the two clearances are two arms",
    },
    {
      // **The resolver's first defect, restored.** Taking the first capitalised
      // token answers `Partial` for `camera?: Partial<Camera>` — the finding's
      // own instance — so the row would have reported a wrapper as the member's
      // type and cleared it as unpublished-but-builtin.
      name: "F999: the resolver takes the first capitalised token, wrapper included",
      file: SURFACE,
      from: '      if (!WRAPPER.test(named[1] ?? "")) return named[1];',
      to: "      return named[1];",
      expect: "the two clearances are two arms",
    },
    {
      // **The resolver's second defect, restored.** Every type in `src/` spans
      // lines, so a line-start anchor resolves the whole corpus and misses a
      // one-line declaration — which is exactly what a fabricated surface is.
      // The rule would have been green on the tree and blind to its own control.
      name: "F999: the member anchor goes back to line-start only",
      file: SURFACE,
      from: 'const at2 = new RegExp(`(?:^|[{;,])\\\\s*(?:readonly\\\\s+)?${member}\\\\??:\\\\s*([^;\\\\n]+)`, "mu").exec(body);',
      to: 'const at2 = new RegExp(`^\\\\s*(?:readonly\\\\s+)?${member}\\\\??:\\\\s*([^;\\\\n]+)`, "mu").exec(body);',
      expect: "fires against a fabricated surface",
    },

    // --- F1000 — the barrel line and its residue ----------------------------
    {
      // The disposal F625 proposed, applied: the line goes and the fixture
      // generator that gates the PNG corpus loses its decoder.
      name: "F1000: `decodePng` leaves the image barrel",
      file: BARREL,
      from: "  decodeImage,\n  decodePng,\n",
      to: "  decodeImage,\n",
      expect: "the barrel is read and the population is not empty",
    },
    {
      // **A name quietly dropped from a list that still reads as deliberate.**
      // This is the direction an allow-list fails in that membership cannot
      // see — the entry is gone and every remaining one is still true.
      name: "F1000: a name falls off the residue list",
      file: BARRELS,
      from: '  "HALF_BLOCK_LOWER",\n',
      to: "",
      expect: "the residue is three names",
    },

    // --- F1001 — the sink, and the four ways it can be subtly wrong ---------
    {
      // **F864 itself**: the optional parameter no caller supplies. Both
      // forwards take their `=== undefined` branch and all seven writers become
      // no-ops, with every hop still compiling.
      name: "F1001: the call site stops supplying `debug`",
      file: SESSION,
      from: "      debug: (line) => {\n        this.#recordDebug(line);\n      },\n",
      to: "",
      expect: "foreign output is caught by C01",
    },
    {
      // **The last N instead of the first.** A ring reads as the obvious choice
      // and discards the line that started the trouble, keeping a repeated
      // symptom — and a session under the cap cannot tell the two apart.
      name: "F1001: the cap keeps the most recent lines",
      file: SESSION,
      from: "      if (this.#debug.length >= DEBUG_LINES) {\n        this.#debugDropped += 1;\n        continue;\n      }\n",
      to: "      if (this.#debug.length >= DEBUG_LINES) {\n        this.#debugDropped += 1;\n        this.#debug.shift();\n      }\n",
      expect: "the cap drops from the tail",
    },
    {
      // **A call taken for a line.** Six of the seven writers hand over one
      // sentence, so a splitter tested only against them looks right — and C01's
      // redirect hands over `"a\nb\n"` for two `console.log`s in a row.
      name: "F1001: a call is recorded whole rather than split",
      file: SESSION,
      from: '    for (const line of chunk.split("\\n")) {',
      to: "    for (const line of [chunk]) {",
      expect: "a call is split into lines",
    },
    {
      // The empty tail every captured `console.log` produces, drained as a
      // marked blank row.
      name: "F1001: the empty-line skip goes",
      file: SESSION,
      from: '      if (line === "") continue;\n',
      to: "",
      expect: "a call is split into lines",
    },
    {
      // **What was dropped, silently absent.** The lines are capped either way
      // and the reader is told nothing about the ones that are missing — which
      // is the state a cap exists to avoid.
      name: "F1001: the dropped count is never reported",
      file: SESSION,
      from: "    if (this.#debugDropped > 0) {",
      to: "    if (this.#debugDropped < 0) {",
      expect: "the cap drops from the tail",
    },
    {
      // **One statement too early, which is F67's class and C01 I4's reason.**
      // A diagnostic written before the release goes onto the alternate screen
      // and is discarded with it: the dev sees a flash and an empty shell. The
      // lines are all produced, all correct, and all invisible — and "it appears
      // somewhere after stop() began" is satisfied by both orders.
      name: "F1001: the drain runs before the release",
      file: SESSION,
      from: "    graph.lifecycle.release();\n",
      to: "",
      also: [
        {
          file: SESSION,
          from: "    // 4 — the caller's code, returned rather than exited",
          to: "    graph.lifecycle.release();\n\n    // 4 — the caller's code, returned rather than exited",
        },
      ],
      expect: "foreign output is caught by C01",
    },
  ],
});

console.log(report(results));

for (const r of results) {
  const why = EXPECTED_SURVIVORS.get(r.name);
  if (why === undefined) continue;
  console.log(
    r.killed
      ? `\nEXEMPTION IS STALE  ${r.name}\n  now caught — remove it from EXPECTED_SURVIVORS`
      : `\nEXPECTED SURVIVOR   ${r.name}\n  ${why}`,
  );
}

const unexpected = results.filter((r) => !r.killed && !EXPECTED_SURVIVORS.has(r.name));
const stale = results.filter((r) => r.killed && EXPECTED_SURVIVORS.has(r.name));
process.exit(unexpected.length + stale.length > 0 ? 1 : 0);
