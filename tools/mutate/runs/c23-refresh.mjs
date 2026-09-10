// C23 §3b — part refresh, stall detection and the teardown set.
//
// **The mechanism this file mutates was mutated into existence.** Two defects in
// shipped code were found by running a truthful clock against it — a timer armed
// once, and a notice whose block id was already taken — and a third by the row
// that asserts a stagger is *spent* rather than computed. Each has a mutation
// here, because the thing that found them once is what keeps them found.
//
// ---
//
// **Re-anchored 2026-09-10 (F1011), and the count is why this header now says
// so.** `tools/mutate/anchors.mjs` carried this run at **10 stale of 19,
// including the control**, and a stale control is not a degraded run: `runPass`
// applies the control before the first mutation, `apply` throws `AnchorError`,
// and the pass stops. Measured before the repair — `node
// tools/mutate/runs/c23-refresh.mjs`, exit 1, `AnchorError: mutation anchor not
// found in src/shell/refresh.ts` — **nought of eighteen mutations ran**, one
// clean suite invocation and nothing else. The nineteenth anchor is the
// control's, which is why ten stale reads as *nine rows short* and means *no
// run*. This is `c26-address.mjs`'s shape, the instance `anchors.mjs` was built
// for.
//
// **All ten were stale at HEAD as well as in the working tree**, measured both
// ways, so none of them is an artefact of work in flight beside this. What moved
// them is C23 §3c: *the thing that polls is the source, not the part*. `dueAt`,
// `failures`, `inFlight` and `done` left `Part` for `Source`; `assignOffsets`
// became generic over sources and renamed its parameter; and F1002/C23 I70 then
// turned `put`'s boolean into a four-armed `PatchOutcome` and joined every write
// through one `write(part, …)` (C23 I70). Nine of the ten are that one rework,
// and each row below records the anchor it used to hold.
//
// The tenth is not a re-anchoring at all — see the removed `b.live: accept both
// fetch and stream` note at the foot of the list. Its subject was deleted and
// the guarantee is now the type's, which is an instrument this run does not
// invoke.
//
// **Re-anchoring is not a repair until the pass has run**, which is the rule at
// the head of `KNOWN_STALE`: a mutation that applies and asserts nothing reads
// as coverage from the summary line.
//
// **Run, 2026-09-10: 17 of 17 caught by name, no survivors, exit 0** — clean
// suite 163 tests over 3 files, control killed (a control that is not killed
// throws `BlindHarnessError` and there is no report at all, which is what makes
// the seventeen lines above mean anything). Nineteen suite invocations —
// clean, control, seventeen mutations — 01:08:42 to 01:27:58, **19m 16s wall
// at 60.8 s each**, against 55.2 s for the same suite run alone beforehand:
// another agent was running `test/unit test/contract test/edge` in the same
// container throughout, which is 10 % of contention and no failures.
// Nothing here is a listed survivor and nothing is excused.
//
// **No survivors is a weaker result than it reads as, and the reason is worth
// keeping.** Every row is a re-anchored or untouched mutation of a rule the
// rows were *already* written against — this pass says the repair points at
// live subjects, not that the rows are strong at inputs nobody drives. The
// class it cannot see is F1007's: a mutation with nothing to be wrong about at
// the frame the corpus renders comes back `caught` if some *other* row happens
// to fail, and `caught` by name is the only thing checked here.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/contract/refresh.test.ts",
  "test/unit/execution.test.ts",
  "test/contract/builders.test.ts",
].join(" ");

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/refresh.ts",
    // **Re-anchored (F1011).** It held
    // `if (put(host, part, child)) deps.commit("stream");` — one line that
    // short-circuited the patch *and* the commit together, on the fetch's
    // success path. §3c split that line in two: the success path is now
    // `runSource`'s `.then`, which renders every part referring to the source
    // and commits **once** for the whole set (C23 I44, T2.23), so the commit is
    // no longer inside the `if`. F1002/C23 I70 then routed every patch through
    // `write`, which is the descendant of the `put(…)` half.
    //
    // The commit half would be the weaker control of the two and it is worth
    // saying why it was not taken: `if (any) deps.commit("stream")` → `if
    // (false)` leaves the patch landing, so T1.35's content and `rev`
    // assertions both still pass and only a commit-counting row could see it. A
    // control has to be a mutation whose kill is not in doubt.
    from: "    part.lastOk = deps.elapsed();\n    part.stale = false;\n    return write(part, child);",
    to: "    part.lastOk = deps.elapsed();\n    part.stale = false;\n    return true;",
    why: "T1.35 asserts a successful fetch replaces the part's child",
  },
  mutations: [
    // --- the two defects that shipped ----------------------------------------
    {
      name: "stall: arm the timer once instead of re-arming",
      file: "src/shell/refresh.ts",
      from: "      deps.schedule(() => {\n        tick();\n        arm();\n      }, STALL_MS / 4),",
      to: "      deps.schedule(() => {\n        tick();\n      }, STALL_MS / 4),",
      expect: "T1.30",
    },
    {
      name: "stall: always append the notice, never replace",
      file: "src/shell/refresh.ts",
      from: "        state.hasNotice\n          ? { op: \"replace\", blockId: STALL_BLOCK, block: notice }\n          : { op: \"append\", block: notice },",
      to: "        { op: \"append\", block: notice },",
      expect: "T1.30",
    },
    // --- the stagger the loop could not spend --------------------------------
    {
      name: "parts: sweep on the stall timer instead of arming to the next due part",
      file: "src/shell/refresh.ts",
      from: "    partTimer = deps.schedule(() => {\n      sweepParts();\n      armParts();\n    }, Math.max(0, soonest - now));",
      to: "    partTimer = deps.schedule(() => {\n      sweepParts();\n      armParts();\n    }, STALL_MS / 4);",
      expect: "T1.31",
    },
    {
      // **Re-anchored (F1011)**, one token. It held
      // `return parts.map((p, i) => …)`; §3c made `assignOffsets` generic over
      // *sources* rather than parts — the set that is staggered is the set that
      // polls — and the parameter went with it, `parts` → `items`. The
      // statement is otherwise the same statement and the mutation is the same
      // mutation: give every one of them offset zero and C23 I20's *no two
      // things that poll fire in the same tick* has nothing left to be true
      // about.
      name: "parts: assign every offset zero",
      file: "src/shell/refresh.ts",
      from: "  return items.map((p, i) => ({ ...p, offsetMs: step * i }));",
      to: "  return items.map((p) => ({ ...p, offsetMs: 0 }));",
      expect: "T1.31",
    },
    // --- A02 §7's rules ------------------------------------------------------
    {
      // **Re-anchored (F1011).** It held
      // `put(host, part, part.spec.renderError(shown, null));` — the render
      // throw's own patch, in the days when `renderError` was read off the spec
      // at the call site and `put` was called directly. Three things moved it:
      // F407 resolved the error arm through `errorArm(part)`, which falls back
      // to the framework's box when the declarer supplied none; the arm gained
      // an `attempt` parameter; and C23 I70 put every patch through `write`.
      //
      // The mutation is unchanged in what it asserts — **rule 2 says a render
      // throw is deterministic**, so it must not be counted as a failure and
      // must not offer a countdown to a retry that will not happen. Counting it
      // does both at once: the box gains `retrying in 60s` and the source's
      // `dueAt` moves onto the backoff.
      name: "rule 2: retry a render throw by counting it as a failure",
      file: "src/shell/refresh.ts",
      from: "      return write(part, errorArm(part)(shown, null, src.failures));",
      to: "      src.failures += 1;\n      return write(part, errorArm(part)(shown, backoffOf(src.intervalMs, src.failures), src.failures));",
      expect: "T1.33",
    },
    {
      // **Re-anchored (F1011)**, two tokens: `part.spec.intervalMs` →
      // `src.intervalMs` and `part.done` → `src.done`. §3c moved the whole
      // schedule onto the source and the statement moved into `settleSource`
      // with it. Same rule 3, same mutation.
      name: "rule 3: let a one-shot part retry",
      file: "src/shell/refresh.ts",
      from: "    if (src.intervalMs === 0) src.done = true;",
      to: "    if (false) src.done = true;",
      expect: "T1.34",
    },
    {
      // **Re-anchored (F1011)**, one token: `part.failures` → `src.failures`,
      // §3c again — the count belongs to the thing that polls, so one fetch
      // behind two panels backs off once rather than once per referrer (§8d D6).
      name: "backoff: do not reset on success",
      file: "src/shell/refresh.ts",
      from: "          src.failures = 0;",
      to: "          src.failures = src.failures;",
      expect: "T1.32",
    },
    // --- the in-flight guard --------------------------------------------------
    {
      // **Re-anchored (F1011), and the anchor deliberately carries the line
      // above it.** It held `if (part.done || part.inFlight) continue;`; §3c
      // moved both flags to the source, and the resulting
      // `if (src.done || src.inFlight) continue;` now occurs **twice** — once in
      // the sweep over `sources` and once in the countdown loop over `hosts`,
      // at different indentation. `apply` replaces the *first* match and a
      // shorter-indented anchor is a substring of the longer one, so an anchor
      // on the statement alone would have been the ambiguous kind `anchors.mjs`
      // lists by count: it resolves, and nothing says which site it mutated.
      // The `for` header pins it to the sweep, which is the guard that decides
      // whether a second fetch starts.
      name: "overlap: start a tick while the previous fetch is in flight",
      file: "src/shell/refresh.ts",
      from: "    for (const src of sources.values()) {\n      if (src.done || src.inFlight) continue;",
      to: "    for (const src of sources.values()) {\n      if (src.done) continue;",
      expect: "T3.40",
    },
    // --- the teardown set (C23 I33) ----------------------------------------------
    {
      name: "teardown: ignore eviction and clear",
      file: "src/shell/refresh.ts",
      from: "    else if (change.kind === \"evict\") {",
      to: "    else if (change.kind === \"never\") {",
      expect: "T3.30b",
    },
    {
      name: "teardown: release on settle *and* on the arrival of a newer entry",
      file: "src/shell/refresh.ts",
      from: "    if (change.kind === \"settle\") release({ kind: \"entry\", id: change.id });",
      to: "    if (change.kind === \"settle\" || change.kind === \"append\") hosts.clear();",
      expect: "T2.21",
    },
    {
      // `dispose` stops several ways — the `stopped` flag, the part timer, the
      // host map and (since §3c) the source map — and any one suffices, so no
      // single-line removal can die. This leaves only `stopped`, which does not
      // disarm a timer that is already pending: one more sweep runs before
      // anything notices, and `sweepParts` gates on `deps.stopping()` rather
      // than on `stopped`, so nothing there stops it either.
      //
      // **Re-anchored (F1011)**, one inserted line: `sources.clear()` joined
      // `hosts.clear()` when §3c gave the driver a second map to drop. The
      // mutation is the same removal and it is now strictly larger — which is
      // the direction a re-anchoring is allowed to move in, since the row's
      // claim is that *no one of these alone* is what stops the driver.
      name: "teardown: dispose relies on the stopped flag alone",
      file: "src/shell/refresh.ts",
      from: "      hosts.clear();\n      sources.clear();\n      partTimer?.[Symbol.dispose]();\n      partTimer = null;",
      to: "",
      expect: "T2.20",
    },
    // --- staleness (C23 I35) -----------------------------------------------------
    {
      name: "staleness: drop the marker",
      file: "src/shell/refresh.ts",
      from: "    if (!part.stale) return part.spec.title;",
      to: "    return part.spec.title;",
      expect: "T1.36",
    },
    {
      // **Re-anchored (F1011), and the shape changed rather than the wording.**
      // It held one conjunction —
      // `part.lastOk !== null && now - part.lastOk >= part.spec.staleAfterMs` —
      // and the sweep now spends it as two guard clauses, with the second
      // measured on the monotonic clock (`mono`, F973) rather than on `now`.
      //
      // The mutation is what it always was: **drop the never-succeeded arm**,
      // so a part still waiting on its first fetch is called stale and the title
      // says `· 300s ago` about data that never arrived. `?? 0` is kept in the
      // `to` for the reason the old `to` kept it — `mono - part.lastOk` on a
      // nullable is the same arithmetic and a type error, and a mutation that
      // does not build is measured by nothing (`DID NOT BUILD`).
      name: "staleness: call a part that has never succeeded stale",
      file: "src/shell/refresh.ts",
      from: "        if (part.stale || part.lastOk === null) continue;\n        if (mono - part.lastOk < part.spec.staleAfterMs) continue;",
      to: "        if (part.stale) continue;\n        if (mono - (part.lastOk ?? 0) < part.spec.staleAfterMs) continue;",
      expect: "T1.36b",
    },
    {
      // **Re-anchored (F1011)**, and the `to` moved with the field rather than
      // the `from`: the anchor lost two spaces of indentation when the sweep
      // gained its outer loop over sources, and `done` is the *source's* now, so
      // stopping the refresh is `part.source.done = true`. Writing `part.done`
      // would have been a mutation that does not build — measured by nothing
      // and reported as a finding about the tests.
      //
      // C23 I35 is *staleness never stops a refresh*: the marker is a thing the
      // title says, not a reason to give up.
      name: "staleness: stop refreshing once stale",
      file: "src/shell/refresh.ts",
      from: "        part.stale = true;",
      to: "        part.stale = true;\n        part.source.done = true;",
      expect: "T1.36",
    },
    {
      name: "rhythm: drop the declared block's gapBefore on the first patch",
      file: "src/shell/refresh.ts",
      from: "      existing?.gapBefore === true ? ({ ...base, gapBefore: true } as Block) : base;",
      to: "      base;",
      expect: "T1.35b",
    },
    // --- C23 I34, one block one patch --------------------------------------------
    {
      name: "atomicity: patch the child directly instead of the panel",
      file: "src/shell/refresh.ts",
      from: "    const base = livePanel(part.spec.id, titleOf(part), child);",
      to: "    const base = child as Panel;",
      expect: "T1.35",
    },
    // --- b.live's declaration errors -----------------------------------------
    {
      name: "b.live: accept a staleAfter below every",
      file: "src/shell/builders/index.ts",
      from: "  if (spec.every !== undefined && spec.staleAfter !== undefined && spec.staleAfter < spec.every) {",
      to: "  if (false) {",
      expect: "T3.6",
    },
    // **Removed 2026-09-10 (F1011): `b.live: accept both fetch and stream`.**
    //
    // It held
    // `if (spec.fetch !== undefined && spec.stream !== undefined) {` → `if
    // (false) {`, against `expect: "T3.4"`. **The statement is gone and the
    // behaviour with it**, which is the disposition that is not a re-anchoring:
    // C24 I21 / F78 deleted `stream` from `LiveSpec` entirely and made `fetch`
    // required, so both of `b.live`'s pair-policing throws went with it. There
    // is no longer a runtime moment at which a declaration naming both can be
    // refused, because there is no longer a declaration that can name both.
    //
    // **Guessing at a replacement would have been the trap** `KNOWN_STALE`'s
    // head names. T3.4/T3.5 is still a row and still passes, and it is now two
    // `@ts-expect-error` lines: the guarantee is enforced by `tsc`, where
    // restoring the optional marker makes the directive unused and TS2578 stops
    // the build. This run invokes vitest, and vitest transpiles through esbuild
    // — which strips types without checking them — so **no edit to `src/` can
    // make T3.4 fail inside this corpus**. A row re-anchored onto some nearby
    // line would apply, report `caught` on whatever else broke, and assert
    // nothing about the thing it is named for.
    //
    // The instrument that answers here is **`npm run check`** — `tsc --noEmit &&
    // eslint .`, and `tsconfig.json` includes `test`, so the directive is
    // checked. Not `npm run typecheck`, which this repository does not have:
    // the first draft of this note named it, and the script list is one grep
    // away, which is the whole of why a note naming a mechanism has to resolve
    // it before it is written down.
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
