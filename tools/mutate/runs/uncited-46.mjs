// The forty-six invariants left uncited after the C24/C04/C25/C26 pass, mutated.
//
// **Eighteen of the forty-six were closed by a citation rather than a row** —
// ten by a citation added to an existing row's title, nine by a string in the
// equality-compared `RULE_INVARIANTS` map, and `C09 I15` by both — and that is
// exactly the disposition this pass exists to test. (This line read *thirty-two*
// until the split was measured against the diff rather than estimated from it:
// 46 entries left the list, 28 gained a new row and 18 a citation. A figure
// written before its measurement reads exactly like one taken from it.) SP9 checks that
// an invariant is *named*; it cannot check that the row naming it *checks* it,
// and a citation added to an existing row is the cheapest way to satisfy SP9
// while changing nothing. So the mutations below are aimed at the invariants'
// subjects, and a citation whose row does not fail here was a citation and not
// a coverage claim.
//
// **Two are a finding put back.** `URL-EXEMPT` reverts F931's fix — a secret in
// a URL query, never scanned because the whole URL was exempt — and `URL-OFFSET`
// puts back the off-by-one the fix's first version had, which the text came
// through unharmed and only the rule list could see.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/contract/lifecycle.test.ts test/contract/frame-scheduler.test.ts " +
  "test/contract/manifest.test.ts test/unit/manifest.test.ts test/contract/transport.test.ts " +
  "test/contract/adapters.test.ts test/contract/fixtures.test.ts test/contract/theme.test.ts " +
  "test/contract/table.test.ts test/contract/viewport.test.ts test/unit/router-dispatch.test.ts " +
  "test/contract/parser.test.ts test/contract/history.test.ts test/contract/process.test.ts " +
  "test/unit/session.test.ts test/unit/session-frame.test.ts test/unit/session-composite.test.ts " +
  "test/unit/session-keys.test.ts test/integration/session.test.ts test/unit/execution.test.ts";

const LIFECYCLE = "src/terminal/lifecycle.ts";
const SCHEDULER = "src/terminal/frame-scheduler.ts";
const FIND = "src/data/manifest/find.ts";
const EMULATED = "src/data/transport/emulated.ts";
const REGISTRY = "src/data/adapters/registry.ts";
const PROVENANCE = "src/data/fixtures/provenance.ts";
const PLAN = "src/presentation/table/plan.ts";
const VIEWPORT = "src/viewport/viewport/viewport.ts";
const ROUTER = "src/interaction/router/router.ts";
const REDACT = "src/interaction/history/redact.ts";
const RUNNER = "src/data/process/runner.ts";
const FRAME = "src/shell/render-frame.ts";
const CONSTRUCT = "src/shell/construct.ts";
const EXECUTION = "src/shell/execution.ts";

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
    file: LIFECYCLE,
    from: "  SIGINT: 130,",
    to: "  SIGINT: 0,",
    why: "a clean exit on Ctrl-C fails the shutdown rows outright; a run where this survives is not executing C01's suites at all",
  },
  mutations: [
    {
      // I17 — one shutdown *code*, which is D54's named failure. Two existing
      // rows assert one code each and both survive this.
      name: "every signal exits 130",
      file: LIFECYCLE,
      from: "  SIGTERM: 143,",
      to: "  SIGTERM: 130,",
      expect: "T2.11",
    },
    {
      // I11 — the injected seam ignored. Every coalescing row still passes,
      // because a duplicate timer firing at the same moment changes nothing
      // they read.
      name: "the scheduler ignores the injected schedule",
      file: SCHEDULER,
      from: "  const schedule = opts.schedule ?? defaultSchedule;",
      to: "  const schedule = defaultSchedule;",
      expect: "T2.9",
    },
    {
      // C05 I14 — the citation's own test. A hidden tool that is offered is
      // the whole of the invariant, and this is what makes T1.15 a coverage
      // claim rather than a name.
      name: "a hidden tool is offered",
      file: FIND,
      from: "  return Object.freeze(m.tools.filter((t) => t.hidden !== true));",
      to: "  return Object.freeze(m.tools);",
      expect: "T1.15",
    },
    {
      // C06 I23 — the world stops being the app's. A canned reply satisfies
      // any row that only checks a result came back.
      name: "the emulated transport ignores its handler",
      file: EMULATED,
      from: "export function createEmulatedTransport(handler: FixtureHandler): VerbTransport {",
      to: "export function createEmulatedTransport(_handler: FixtureHandler): VerbTransport {\n  const handler = () => ({ items: [] });",
      expect: "T2.12",
    },
    {
      // C07 I16 — the identity route trusting the far side, which is the
      // regression the invariant was written from.
      name: "the identity route keeps the far side's command",
      file: REGISTRY,
      from: "        ...candidate,\n        command: ctx.command,",
      to: "        ...candidate,",
      expect: "T2.8",
    },
    {
      // C08 I16 — a derived fixture no longer needs the recording behind it,
      // which is the whole distinction between derived and composed.
      name: "a derived fixture needs no capturedAt",
      file: PROVENANCE,
      from: "    } else if (fixture.capturedAt === null) {",
      to: "    } else if (false) {",
      expect: "T2.12",
    },
    {
      // C11 I12 — priority inferred from the data rather than declared. The
      // existing drop-order rows pass, because on one dataset the two agree.
      name: "columns are ranked by minimum width, not by declared priority",
      file: PLAN,
      from: "    return pb - pa || a.index - b.index;",
      to: "    return a.min - b.min || a.index - b.index;",
      expect: "T2.10",
    },
    {
      // C16 I16 — Ctrl-D with text edits the line, which is the delete-forward
      // the invariant names and which reads as a working editor.
      name: "Ctrl-D with text clears the prompt",
      file: ROUTER,
      from: "        if (isCtrlC(e)) deps.clearPrompt();",
      to: "        deps.clearPrompt();",
      expect: "T1.90",
    },
    {
      // **F931 put back.** The URL exemption answers first and the entropy net
      // never looks inside the query.
      name: "URL-EXEMPT: a URL's query is not scanned by its pieces",
      file: REDACT,
      from: "    const query = queryAtomsIn(line, slot);",
      to: "    const query = [];",
      expect: "T2.13",
    },
    {
      // **The fix's own first version.** Offsets from `slot.text`, which
      // `tokenise` has already unquoted, against a `slot.start` that indexes
      // the quoted line. The text comes out right; only `fired` can see it.
      name: "URL-OFFSET: query atoms measured from the unquoted text",
      file: REDACT,
      from: "  const inner = line.slice(slot.start, slot.end);\n  const cut = inner.search(/[?#]/u);",
      to: "  const inner = slot.text;\n  const cut = inner.search(/[?#]/u);",
      expect: "T2.13c",
    },
    {
      // C21 I7 — the handoff detaches, so Ctrl-C stops reaching the child.
      name: "handoff detaches its child",
      file: RUNNER,
      from: "            stdio: \"inherit\",",
      to: "            stdio: \"inherit\",\n            detached: true,",
      expect: "T2.10",
    },
    {
      // C22 I57 — the diff's rows lose their leading reset, which no golden
      // moves for and which nothing else asserts.
      name: "a diff's rows carry no leading reset",
      file: FRAME,
      from: "    out += `${cursorTo(i, 0)}${SGR_RESET}${row}`;",
      to: "    out += `${cursorTo(i, 0)}${row}`;",
      expect: "T1.55",
    },
    {
      // C14 I22 — the terminal's height where the region's belongs. Silent in
      // both directions, which is why it survived to be an invariant.
      name: "the viewport is given the terminal's height",
      file: FRAME,
      from: "  deps.resizeViewport({ width: frame.size.columns, height: frame.region.height });",
      to: "  deps.resizeViewport({ width: frame.size.columns, height: frame.size.rows });",
      expect: "T4.11f",
    },
    {
      // C22 I39 — the printable path stops cancelling, which is the state the
      // invariant was written from: C19 complete, no caller.
      name: "a printable keystroke does not cancel a pending completion",
      file: CONSTRUCT,
      from: "      if (e.kind === \"key\" && isPrintable(e.key)) {\n        built.completion.cancel();",
      to: "      if (e.kind === \"key\" && isPrintable(e.key)) {",
      expect: "T1.13c",
    },
    {
      // C22 I39, the other caller — a paste is not a key, and one call site is
      // enough to make a row about *a keystroke* pass.
      name: "a paste does not cancel a pending completion",
      file: CONSTRUCT,
      from: "      if (e.kind === \"paste\") {\n        built.completion.cancel();",
      to: "      if (e.kind === \"paste\") {",
      expect: "T1.13d",
    },
    {
      // C23 I41 — the region's height handed down everywhere, so a transcript
      // entry is told it is bounded when it is not.
      name: "every route gets the region's height",
      file: EXECUTION,
      from: "        ...producerContext(null),",
      to: "        ...producerContext(deps.region().height),",
      expect: "T1.60",
    },
  ],
});

// `report` **returns** the lines; a bare call discards them, and the exit code
// is then the only thing left — which is one bit, and the same bit for *nine
// survived* and *the harness printed nothing*. Both were true of this file's
// first run: `r.state` is not a field `runPass` produces, so every result
// counted as unexpected and a pass that caught everything exited 1 in silence.
console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
