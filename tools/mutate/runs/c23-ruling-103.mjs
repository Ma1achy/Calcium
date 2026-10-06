// C23 I93, I94, I103, I60/I81 and C22 I152 — ruling 103 and F1495: a denial is
// drawn as a decision, a completion line says a code only of a child's own
// ending, a stall is said only of an entry waiting on output, and `esc` resolves
// a safe answer or the question is not asked (T6.121–T6.125, C22 T6.157).
//
// **One mutation per site, each what shipped or its nearest neighbour**: the
// denial back in the `failed` state, the parent counting it as `cancelled`, the
// watch armed at dispatch, the stall row kept on the malformed patch and the
// throw, the no-answer refusal and the stand-in's refusal removed, the approval
// branch's catch and `approvalPrompt`'s `deny` check removed, and the completion
// line reading `outcomeOf` alone, reading the state alone, and reading one
// alphabet's separator.
//
// **The verdict is read from the FAIL lines** (F1472): only *caught by the named
// row* counts as the row seeing it.
//
// A mutation that fails nothing indicts the tests or the prose, not the code.
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const EXECUTION = "src/shell/execution.ts";
const DOCUMENTS = "src/shell/documents.ts";
const CHOICES = "src/shell/choice-selection.ts";
const LINEAR = "src/shell/linear.ts";
const STAND_IN = "src/testing/producer-context.ts";
const FILES = [
  "test/unit/question-queue.test.ts",
  "test/unit/linear.test.ts",
  "test/contract/call-state.test.ts",
  "test/integration/settlement-code.test.ts",
  "test/integration/app-cancel.test.ts",
  "test/integration/confirm.test.ts",
].join(" ");

const { read, write } = fsIo(ROOT);
const run = () => {
  let out;
  try {
    out = execSync(`npx vitest run ${FILES} 2>&1`, { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  } catch (e) {
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    if (e.killed === true) out = `${out}\nTIMED OUT after 300000ms`;
  }
  const fails = out
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .filter((l) => /^\s*FAIL\s/.test(l));
  console.error(`  -- FAIL lines: ${fails.length === 0 ? "none" : `\n${fails.join("\n")}`}`);
  return out;
};

const results = runPass({
  read,
  write,
  run,
  control: {
    // **A change the corpus can see** (F1254): the no-answer refusal's words.
    file: CHOICES,
    from: "so none answers and esc",
    to: "so nothing answers and esc",
    why: "the refusal reads `nothing answers` — if this survives, T1.107 is not reading the message",
  },
  mutations: [
    {
      // **What shipped** (F1518): `denied` drawn `failed`.
      name: "T6.121: denied dropped from the cancelled words",
      file: DOCUMENTS,
      from: 'new Set(["cancelled", "expired", "denied"]);',
      to: 'new Set(["cancelled", "expired"]);',
      expect: "T4.105",
    },
    {
      // The head right and the parent not: a denied child counted `1 cancelled`.
      name: "T6.121: a stopped child counted as cancelled whatever its word",
      file: DOCUMENTS,
      from: "const stopped = child.outcome !== undefined && STOPPED_WORDS.has(child.outcome) ? child.outcome : \"cancelled\";",
      to: "const stopped = \"cancelled\";",
      expect: "T1.76",
    },
    {
      // **What shipped** (F1520): the watch armed at dispatch.
      name: "T6.122: the stall watch armed at dispatch again",
      file: EXECUTION,
      from: "    deps.scheduler.commit(\"input\");\n    /**\n     * The verdict, into the header, **before** `settle`",
      to: "    deps.scheduler.commit(\"input\");\n    refresh.watch(pendingId);\n    /**\n     * The verdict, into the header, **before** `settle`",
      expect: "T4.106",
    },
    {
      // **What shipped** (F1519): the malformed patch kept the card's stall row.
      name: "T6.123: the malformed patch's settle keeps the stall row",
      file: EXECUTION,
      from: "left out: the shell composed this.\n          settleKept(1, true);",
      to: "left out: the shell composed this.\n          settleKept(1);",
      expect: "T4.106",
    },
    {
      name: "T6.123: the throw's settle keeps the stall row",
      file: EXECUTION,
      from: "settleKept(1, true); /",
      to: "settleKept(1); /",
      expect: "T4.106",
    },
    {
      // **What shipped** (F1495): a set with nothing that answers, asked.
      name: "T6.124: the no-answer refusal removed",
      file: CHOICES,
      from: "  if (choices.every((c) => c.reply === true || c.inspect === true)) {",
      to: "  if (choices.length < 0) {",
      expect: "T1.107",
    },
    {
      // The shell right and the stand-in not: a handler's test passes on a set
      // the shell throws on.
      name: "T6.124: the stand-in's refusal removed",
      file: STAND_IN,
      from: "      if (invalid !== null) return Promise.reject(new Error(invalid));\n",
      to: "",
      expect: "T1.107",
    },
    {
      // **What shipped** (A6.11 row 5): the rejection unwound past the card.
      name: "T6.125: the approval branch's catch rethrows",
      file: EXECUTION,
      from: "      } catch (cause) {\n        // **A refused question settles this card",
      to: "      } catch (cause) {\n        if (cause !== null) throw cause;\n        // **A refused question settles this card",
      expect: "T4.107",
    },
    {
      // **What shipped** (A6.11 row 6): `allow` marked default, and `esc` ran the tool.
      name: "T6.125: approvalPrompt's deny check removed",
      file: DOCUMENTS,
      from: "  if (safe?.key !== DENY_KEY) {",
      to: "  if (safe === null) {",
      expect: "T4.107",
    },
    {
      // **What shipped** (F1517): `outcomeOf` alone — `failed, exit 126`.
      name: "C22 T6.157: the verdict reads outcomeOf alone",
      file: LINEAR,
      from: "  const word = head?.kind === \"notice\" ? shellWord(head.text) : null;",
      to: "  const word: string | null = head === null ? \"\" : null;",
      expect: "T1.186",
    },
    {
      // The word read and the state kept: `cancelled, denied`.
      name: "C22 T6.157: a cancelled head's word follows the state instead of replacing it",
      file: LINEAR,
      from: "  const parts = [word !== null && state === \"cancelled\" ? word : state];",
      to: "  const parts = [state];",
      expect: "T1.186",
    },
    {
      // One alphabet: the ASCII head's `:` is never found, and its line says `exit 126`.
      name: "C22 T6.157: shellWord reads the Unicode separator alone",
      file: DOCUMENTS,
      from: "  glyphs({ unicode: \"ascii\", ambiguousWidth: \"narrow\" }).separator,\n",
      to: "",
      expect: "T1.186",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
