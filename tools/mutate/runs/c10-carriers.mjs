// C10 I56 — the carrier table, mutated.
//
// **The subject is a document, so the mutations edit the document.** §4k.5 is
// the declaration and `calcium-registry.json` is the population; the gate holds
// them to each other and checks the one property a table of carriers can get
// wrong, which is that `tone` and `ground` are one carrier written twice.
//
// **Why this gate did not exist before.** `R-COR-003` is the largest rule in the
// contract — *every actionable, status, and interaction distinction has two
// independent carriers and survives without colour* — and it was enumerated over
// no population. I52 held the axes to the registry and nothing said which two
// carriers held each one, so the sentence had nothing to be wrong about: A03 §2's
// vacuity class, at the top of the contract rather than the bottom.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SPEC = "docs/components/C10_theme_resolution.md";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync("npx vitest run test/contract/theme.test.ts 2>&1", { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SPEC,
    // The section's heading gone, so the table cannot be found at all. A run
    // where this survives is reading nothing and every row below is noise.
    from: "### 4k.5 — the carrier table: what holds each axis, and at which rung",
    to: "### 4k.5x — the carrier table: what holds each axis, and at which rung",
    why: "with the section unfindable the table parses empty; a run where this survives cannot see a kill",
  },
  mutations: [
    {
      // **THE DEFECT the rule is written about.** A fact held by a tone and a
      // ground has one carrier written twice, and both are gone at 1-bit. It
      // reads as two because they are two *channels* — which is exactly why
      // `R-COR-003` names independence rather than count.
      name: "THE DEFECT: an axis held by tone and ground, which is one carrier written twice",
      file: SPEC,
      from: "| **ownership** | the router's owner rung | the footer's owner line (`chrome.ts:97`, `R-KEY-004`) | word + border | word and border |",
      to: "| **ownership** | the router's owner rung | the footer's owner line (`chrome.ts:97`, `R-KEY-004`) | tone + ground | word and border |",
      expect: "T2.57",
    },
    {
      // A row dropped. The equality arm — a subset test passes this, which is
      // why every exemption and declaration list in this repository is compared
      // by equality rather than by membership.
      name: "an axis loses its row — the equality arm",
      file: SPEC,
      from: "| **disclosure** | `TableRow.expanded`, and the count",
      to: "| **disclosurex** | `TableRow.expanded`, and the count",
      expect: "T2.57",
    },
    {
      // **A single-carrier exception taken by writing one.** Re-pointed when
      // `selection` took its rail (C14 I58, ruling 68): it was the last axis
      // written `alone`, and the row that demanded a citation of each then ran
      // over an empty set. So the mutation constructs the subject: a row
      // declared single-carrier with no citation, which the arm must refuse.
      name: "an axis is declared single-carrier — disclosure before ruling 69",
      file: SPEC,
      // Re-anchored for C10 I71: the gate counts carriers, so `alone` is no
      // longer a word it reads — a single carrier fails whatever it is called.
      from: "| mark + word | mark and word — `▹+N` against a leaf's blank",
      to: "| mark | mark — `▹+N` against a leaf's blank",
      expect: "T2.57",
    },
    {
      // An axis with no subject given one, which is the day a field arrives —
      // the row must go red rather than stay quiet, because a carrier claim for
      // a fact nothing can express is an assertion over an empty set.
      name: "an axis with no subject acquires a field, and the row stays quiet",
      file: SPEC,
      // On `resolution`, the axis that keeps no subject longest: availability's
      // row gained its field (C04 I140), and pointer's is next (review batch 1).
      from: "| **resolution** | — | — | **no subject** |",
      to: "| **resolution** | `Question.resolved` | — | **no subject** |",
      expect: "T2.57",
    },
    {
      // **I71's count, removed**: the arm that asks for two distinct carriers.
      // The fabricated `mark` row passes and so does disclosure written alone —
      // the shape the pre-I71 gate had, satisfied by a single carrier not spelled `alone`.
      name: "the gate accepts one carrier",
      file: "test/contract/theme.test.ts",
      from: '      if (new Set(named).size < 2) return "fewer than two distinct carriers";',
      to: "",
      expect: "T2.57",
    },
    {
      // **The survives column read as `both`** — any row passes the naming arm.
      name: "the surviving carrier need not be named",
      file: "test/contract/theme.test.ts",
      from: '      if (surviving.length === 0) return "no carrier that survives 1-bit is named as surviving";',
      to: "",
      expect: "T2.57",
    },
    {
      // **`both` restored** — the word the survives column held before I71.
      // It names no carrier, so a row written with it must fail the naming arm.
      name: "the survives column says both",
      file: SPEC,
      from: "| word + border | word and border |",
      to: "| word + border | both |",
      expect: "T2.57",
    },
    {
      // **A second exception, joining quietly** — the equality arm.
      name: "a second site on the exception list",
      file: SPEC,
      from: "| **prompt selection** | selection |",
      to: "| **table selection** | selection | `x` | `y.ts:1` | ground | inverse |\n| **prompt selection** | selection |",
      expect: "T2.57",
    },
    {
      // **The exception carried and still listed** — the site given a second
      // carrier; the list must now fail rather than keep a name it no longer needs.
      name: "the exception carried, and the list keeps it",
      file: SPEC,
      from: "| ground | inverse — the ground's own rung, with the caret at one end |",
      to: "| ground + mark | mark and inverse — the ground's own rung, with the caret at one end |",
      expect: "T2.57",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
