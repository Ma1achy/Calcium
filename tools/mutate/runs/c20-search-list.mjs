// C20 I31, I32 and C22 I157 — the history search as a list with a count (§046).
//
// Three owners of one picture: C20 computes the figures and builds the layer, L4
// draws the query on the prompt's line and wires the accept, and the footer
// names the keys. Each mutation attacks a clause that would still draw a
// plausible frame without it. A mutation that fails nothing indicts the tests or
// the prose, not the code.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/history-search-list.test.ts test/integration/history-search-frame.test.ts " +
  "test/unit/history.test.ts test/integration/history.test.ts";
const SEARCH = "src/interaction/history/search.ts";
const LAYERS = "src/interaction/history/layers.ts";
const KEYS = "src/shell/keys.ts";
const SESSION = "src/shell/session.ts";
const CHROME = "src/shell/chrome.ts";

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: SEARCH,
    from: "      total: matched.length,",
    to: "      total: 0,",
    why: "T1.22 reads `1 of 3`; a total that is always 0 reads `no match` everywhere",
  },
  mutations: [
    {
      name: "the total counts entries, not matches",
      file: SEARCH,
      from: "      total: matched.length,",
      to: "      total: entriesOf().length,",
      expect: "T1.22",
    },
    {
      name: "the rank counts from the oldest",
      file: SEARCH,
      from: "      rank: at < 0 ? 0 : matched.length - at,",
      to: "      rank: at < 0 ? 0 : at + 1,",
      expect: "T1.22",
    },
    {
      name: "the older rows are the entries beside the hit, not the matches",
      file: SEARCH,
      from: "    const older = at < 0 ? [] : matched.slice(0, at).reverse().slice(0, LIST_OLDER);",
      to: "    const older = at < 0 || hit === null ? [] : [hit.index - 1, hit.index - 2].filter((i) => i >= 0);",
      expect: "T1.22",
    },
    {
      name: "the window shows every older match",
      file: SEARCH,
      from: "const LIST_OLDER = 2;",
      to: "const LIST_OLDER = 99;",
      expect: "T1.22",
    },
    {
      name: "a query matching nothing still prints a count",
      file: LAYERS,
      from: '  if (state.total === 0) return "reverse search  no match";\n',
      to: "",
      expect: "T1.22",
    },
    {
      name: "the header edge is dropped from the list",
      file: LAYERS,
      from: "  return Object.freeze([edge, body]);",
      to: "  return Object.freeze([body]);",
      expect: "T1.22",
    },
    {
      name: "a search accepts nothing: the row is the menu's alone",
      file: KEYS,
      from: '      if (deps.overlays.top?.id === SEARCH_ID) {\n        const found = deps.history.searchEnd("accept");',
      to: '      if (false as boolean) {\n        const found = deps.history.searchEnd("accept");',
      expect: "T4.125",
    },
    {
      name: "accept leaves the layer on the stack",
      file: KEYS,
      from: '        const found = deps.history.searchEnd("accept");\n        deps.overlays.pop();',
      to: '        const found = deps.history.searchEnd("accept");',
      expect: "T4.125",
    },
    {
      name: "esc ends the search and leaves the panel drawn",
      file: KEYS,
      from: '        deps.history.searchEnd("cancel");\n        deps.overlays.pop();',
      to: '        deps.history.searchEnd("cancel");',
      expect: "T4.125",
    },
    {
      name: "the prompt's rows are the editor's while the caret is the query's",
      file: SESSION,
      from: "        const held = graph.searchShown() ?? graph.fieldHeld();\n        return held === null\n          ? graph.editor.layout",
      to: "        const held = graph.fieldHeld();\n        return held === null\n          ? graph.editor.layout",
      expect: "T4.125",
    },
    {
      name: "the caret is the editor's while the rows are the query's",
      file: SESSION,
      from: "        const held = graph.searchShown() ?? graph.fieldHeld();\n        return held === null\n          ? graph.editor.cursorCell",
      to: "        const held = graph.fieldHeld();\n        return held === null\n          ? graph.editor.cursorCell",
      expect: "T4.125",
    },
    {
      name: "the prompt is not focused under a search: the caret is hidden",
      file: SESSION,
      from: "graph.router.target === \"prompt\" || graph.promptUnderMenu() || graph.searchShown() !== null,",
      to: "graph.router.target === \"prompt\" || graph.promptUnderMenu(),",
      expect: "T4.125",
    },
    {
      name: "a search a question displaced still draws the query",
      file: "src/shell/construct.ts",
      from: "      const search = stores.overlays.top?.id === SEARCH_ID ? stores.history.searchState : null;",
      to: "      const search = stores.history.searchState;",
      expect: "T4.126",
    },
    {
      name: "the footer names the menu's keys over a search",
      file: CHROME,
      from: '            ...keyed(hints, "panel", ["searchOlder"], "older", caps),',
      to: '            ...keyed(hints, "panel", ["menuPrev", "menuNext"], "hits", caps),',
      expect: "T4.125",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
