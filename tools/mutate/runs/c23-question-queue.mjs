// C23 §7g — a question's life: the reply, the queue, the three resolutions
// (review batch 4, shell lane, group B; C23 I89–I94, C04 I149, C22 I145).
//
// **Every rule here resolves on the accepted path and on the withdrawn one**,
// and the withdrawn one is where a question leaves state behind — a borrowed
// line, a timer, a waiting question nobody will draw. Each mutation names the
// row that reads the state it would leave.
//
// **The control** is T6.107, the queue bypassed: a second `ask` pushes at once
// and C15 throws on the id, so T1.101 fails at the second question.
//
// **Anchors checked for uniqueness before the pass** (F219).
import { execSync } from "node:child_process";

import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CONFIRM = "src/shell/confirm.ts";
// `invalidChoices` moved here so the testing stand-in refuses what `ask` does (F1495).
const CHOICES = "src/shell/choice-selection.ts";
const KEYS = "src/shell/keys.ts";
const DOCUMENTS = "src/shell/documents.ts";
const EX = "src/shell/execution.ts";
const SESSION = "src/shell/session.ts";
const CONSTRUCT = "src/shell/construct.ts";
const CHROME = "src/shell/chrome.ts";
const FILES = [
  "test/unit/question-queue.test.ts",
  "test/edge/question-queue.test.ts",
  "test/integration/confirm.test.ts",
  "test/unit/prompt-live.test.ts",
  "test/contract/call-state.test.ts",
  "test/integration/overlay-displaced.test.ts",
].join(" ");

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
    // T6.107 (C23 I91) — the queue bypassed.
    file: CONFIRM,
    from: "        if (current === null) show(q);",
    to: "        if (true) show(q);",
    why: "T6.107 — a second ask pushed at once: C15 throws on the id and T1.101 fails",
  },
  mutations: [
    {
      // T6.106 (C23 I89).
      name: "esc in a reply answers with the default again",
      file: CONFIRM,
      from: '      if (is(QUESTION_KEYS.leave)) return replying !== null ? "back" : "resolve";',
      to: '      if (is(QUESTION_KEYS.leave)) return "resolve";',
      expect: "T1.99",
    },
    {
      // T6.108 (C23 I92).
      name: "a withdrawn question resolves with the first choice's key, not the default's",
      file: CONFIRM,
      from: "      settle(defaultChoice(opts.choices).key, undefined, outcome);",
      to: "      settle(opts.choices[0]!.key, undefined, outcome);",
      expect: "T1.102",
    },
    {
      // T6.109 (C23 I93).
      name: "two defaults admitted",
      file: CHOICES,
      from: "  if (defaults.length > 1) {",
      to: "  if (false) {",
      expect: "T1.104",
    },
    {
      name: "a default on reply… admitted",
      file: CHOICES,
      from: "  if (d !== undefined && (d.reply === true || d.inspect === true)) {",
      to: "  if (d !== undefined && d.inspect === true) {",
      expect: "T1.104",
    },
    {
      // C23 I89 — the composed text kept on the question.
      name: "reply… again starts from an empty line",
      file: CONFIRM,
      from: "      if (kept !== null) {",
      to: "      if (false) {",
      expect: "T1.99",
    },
    {
      // C23 I90.
      name: "the reply announced as resolved, the chip's content in the linear stream",
      file: CONFIRM,
      from: "            const said = deps.drawn?.() ?? text;",
      to: "            const said = text;",
      expect: "T1.100",
    },
    {
      name: "the reply answers with the sentinel line",
      file: CONSTRUCT,
      from: "    draft: () => stores.editor.resolved,",
      to: "    draft: () => stores.editor.text,",
      expect: "T4.90",
    },
    {
      // C23 I92.
      name: "a signal already aborted at ask is not seen",
      file: CONFIRM,
      from: "      if (opts.signal?.aborted === true) {",
      to: "      if (false) {",
      expect: "T1.102",
    },
    {
      name: "an answer leaves the expiry armed",
      file: CONFIRM,
      from: "      timer?.[Symbol.dispose]();",
      to: "",
      expect: "T1.103",
    },
    {
      name: "a withdrawal mid-reply keeps the borrowed line",
      file: CONFIRM,
      from: "      if (replying !== null) deps.restoreDraft();\n      settle(",
      to: "      settle(",
      expect: "T3.83",
    },
    {
      name: "the session stops with its questions pending",
      file: SESSION,
      from: "    graph.confirm.cancelAll();\n",
      to: "",
      expect: "T3.82",
    },
    {
      name: "the expiry toast drawn as ok",
      file: CHROME,
      from: 'glyphFor(ctx.toastMark === "expired" ? "queued" : "ok", ctx.capabilities)',
      to: 'glyphFor("ok", ctx.capabilities)',
      expect: "T1.103",
    },
    {
      // C23 I91 — a displaced panel waits for the last question.
      name: "a displaced menu restored between two questions",
      file: KEYS,
      from: "    if ((deps.questionsWaiting?.() ?? 0) > 0) return;\n",
      to: "",
      expect: "T4.91",
    },
    {
      name: "the head does not count what waits",
      file: CONFIRM,
      from: "  return more > 0 ? `Confirm ${separator} ${String(more)} more` : \"Confirm\";",
      to: "  return \"Confirm\";",
      expect: "T1.101",
    },
    {
      // C23 I94.
      name: "the approval's default is allow again",
      file: DOCUMENTS,
      from: '  { key: DENY_KEY, label: "deny", default: true },\n  { key: "y", label: "allow" },',
      to: '  { key: DENY_KEY, label: "deny" },\n  { key: "y", label: "allow", default: true },',
      expect: "T1.105",
    },
    {
      // **Re-aimed at the word, because the gate became the equivalent
      // program** (F1495). This dropped `answer.outcome !== "answered"` from the
      // branch, and was reached only by T4.92's widened set with `allow` marked
      // default, so a withdrawal resolved `y`. `approvalPrompt` refuses that set
      // now, every unanswered resolution carries `deny`'s key, and the clause
      // cannot fire — it survived. The clause stays as a second wall; the wall
      // that holds is T6.125's, in c23-ruling-103.
      name: "a withdrawn approval settles as denied",
      file: EX,
      from: '        finishCard(answer.outcome === "answered" ? "denied" : answer.outcome);',
      to: '        finishCard("denied");',
      expect: "T4.92",
    },
    {
      // C04 I149.
      name: "a call awaiting its approval reads running",
      file: DOCUMENTS,
      from: '  if (!settled) return call.waiting === true ? "waiting" : "running";',
      to: '  if (!settled) return "running";',
      expect: "T4.92",
    },
    {
      // C22 T6.146 (I145) — the selection change dropping `promptLive`.
      //
      // **Both update sites together, because each is sufficient alone**: the
      // first run mutated them one at a time and both survived. `Tab` reaches
      // `showMenu`'s update, and `countRemainder` redraws after it in the same
      // tick, so either write leaves the field right. Equivalent singly; the
      // row's subject is the pair.
      name: "a menu whose selection moves keeps promptLive",
      file: KEYS,
      from: "        promptLive: layer.promptLive ?? false,\n",
      to: "",
      also: [
        {
          file: KEYS,
          from: "{ content: windowedBlocks(), promptLive: selection.at === null }",
          to: "{ content: windowedBlocks() }",
        },
      ],
      expect: "T1.177",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
