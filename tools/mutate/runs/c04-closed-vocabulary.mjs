// C04 I6's exemption, mutated (ruling 44): a column's declared closed vocabulary
// lets its words carry `warn` and `error` without a glyph.
//
// **Two doors and three clauses**: the set must be checkable (non-empty,
// distinct, non-empty words), a cell must be one of its words, and only then is
// the glyph optional. Each mutation opens one clause at one door, and the
// consumer — §075's source column — is the last, because a column that stops
// declaring its words is the exemption quietly unused.
//
// The control throws from every declared vocabulary, so any column declaring
// one stops constructing: if that survives, nothing here builds one.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD = "npx vitest run test/contract/view-model.test.ts test/revert/view-model.test.ts test/unit/config-provenance.test.ts";
const CONSTRUCT = "src/data/viewmodel/construct.ts";
const VALIDATE = "src/data/viewmodel/validate.ts";
const TABLE = "src/shell/config-table.ts";

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
    file: CONSTRUCT,
    from: "    const set = new Set(words);\n    if (words.length === 0 ||",
    to: "    const set = new Set(words);\n    if (true ||",
    why: "every declared vocabulary is refused, so §075's table stops constructing — a run where this survives builds no vocabulary",
  },
  mutations: [
    {
      // **Free text takes the exemption** — the case the ruling names: a cell
      // in the column is exempt whether or not it is one of the words.
      name: "construction drops the membership check",
      file: CONSTRUCT,
      from: "          } else if (!words.has(cell.text)) {",
      to: "          } else if (false) {",
      expect: "T2.139",
    },
    {
      // **The exemption withdrawn** — C04 I6 as first written, per effect: the
      // ladder's loud rungs throw again.
      name: "construction ignores the vocabulary and asks for a glyph",
      file: CONSTRUCT,
      from: "          if (words === undefined) {\n            requireGlyph(cell.tone, cell.glyph, where);",
      to: "          if (true) {\n            requireGlyph(cell.tone, cell.glyph, where);",
      expect: "T2.139",
    },
    {
      // **A set with a word twice is accepted** — the declaration still
      // closes, and says less than it reads as saying.
      name: "construction accepts a repeated word",
      file: CONSTRUCT,
      from: "    if (words.length === 0 || set.size !== words.length ||",
      to: "    if (words.length === 0 ||",
      expect: "T2.139",
    },
    {
      // **The wire opens where construction closes** — a far side's free text
      // takes the exemption the constructor refuses.
      name: "the wire drops the membership check",
      file: VALIDATE,
      from: "          if (words !== undefined && !words.has(cell[\"text\"] as string)) {",
      to: "          if (false) {",
      expect: "T2.139",
    },
    {
      // **An empty set accepted at the wire** — every cell then fails
      // membership, which reads as a vocabulary problem in the wrong words.
      name: "the wire accepts an empty vocabulary",
      file: VALIDATE,
      from: "          !isArray(words) ||\n          words.length === 0 ||",
      to: "          !isArray(words) ||",
      expect: "T2.139",
    },
    {
      // **The consumer stops declaring** — `env` and `flag` meet C04 I6's glyph
      // again and the table throws, which is the state 44 was parked in.
      name: "the source column declares no vocabulary",
      file: TABLE,
      from: ", sortable: false, vocabulary: PROVENANCE_WORDS },",
      to: ", sortable: false },",
      expect: "T1.75",
    },
  ],
});
console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
