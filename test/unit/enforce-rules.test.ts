// A03 commitment 14 — every rule ships with a fabricated violation and asserts
// it fires, naming the rule.
//
// This is not belt-and-braces. A rule that matches nothing passes, and passing
// is what we look for: `make enforce` reports "no violations" identically
// whether the suite is clean or the suite is broken. Three ways that happens,
// and all three have happened here:
//
//   - **The pattern cannot match a real specifier.** MG20 compared a resolved
//     path against `src/terminal/escapes` while every NodeNext specifier ends
//     `.js`, so it matched nothing and reported compliance for a day.
//   - **The scope matches no files.** SS26 scopes to `src/data/process/` and the
//     tree has `src/data/process.ts` — a file, not a directory. `startsWith`
//     never matches, so "no writes to real process.stdout in the process
//     runner" has never once been checked.
//   - **A named entity does not exist.** MG20's `MODE_OWNERS` assigned
//     `SYNC_UPDATE` and `SCROLL_REGION` to C03 while `escapes.ts` exported
//     neither, so those rows could not fire whatever the tree contained.
//
// None of the three was a wrong rule. Each was a rule with nothing to be wrong
// about. The fabricated violation catches the first, the scope check the
// second, the existence check the third; no one of them catches the others,
// which is why all three are here (A03 §2, commitment 14).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkModuleGraph,
  checkOneStorePerComponent,
  modeOwnersAreReal,
  MODULE_GRAPH_RULES,
  checkFunctionConsumers,
  checkBuilderCoverage,
  checkSeamConsumers,
} from "../../tools/enforce/module-graph.mjs";
import { checkMarks, checkSourceScans, SCANS } from "../../tools/enforce/source-scans.mjs";
import { checkDependencies, DEPENDENCY_RULES } from "../../tools/enforce/dependencies.mjs";
import { SPEC_RULES } from "../../tools/enforce/commitments.mjs";
import { COMPONENT_SOURCES, defaultIsImplemented } from "../../tools/enforce/todo-expiry.mjs";

/** A file that must fail `rule`, at a path inside its scope. */
type Fabrication = { rule: string; file: string; source: string };

/**
 * One per implemented scan and module-graph rule. Each source is the smallest
 * thing that is genuinely the violation — not a string engineered to match the
 * regex, which would test the regex against itself.
 */
const FABRICATED: readonly Fabrication[] = [
  { rule: "SS1", file: "src/viewport/viewport.ts", source: "const at = Date.now();" },
  { rule: "SS10", file: "src/shell/session.ts", source: "const term = process.env.TERM;" },
  { rule: "SS11", file: "src/presentation/theme.ts", source: "const off = process.env.NO_COLOR;" },
  { rule: "SS14", file: "src/viewport/viewport.ts", source: 'const clear = "\\x1b[2J";' },
  { rule: "SS15", file: "src/presentation/table.ts", source: 'out.write("?1049h");' },
  { rule: "SS16", file: "src/data/viewmodel/index.ts", source: 'const fg = "#c0ffee";' },
  { rule: "SS17", file: "src/presentation/blocks/text.ts", source: 'const fg = "#c0ffee";' },
  {
    rule: "SS19",
    file: "src/presentation/theme/tokens-dark.ts",
    source: 'export const OK = "\\u001b[32m"; // 38;5;114',
  },
  {
    // SS20 and SS21 police scopes whose legitimate members do not exist yet —
    // `code.ts` and `patch.ts` arrive with C09 and C25. A rule over an empty
    // scope passes exactly like a satisfied one, so these fabrications are the
    // only thing currently proving either rule can fire at all.
    rule: "SS20",
    file: "src/presentation/blocks/table.ts",
    source: 'const style = resolve("syntax.keyword", theme, caps);',
  },
  {
    rule: "SS21",
    file: "src/viewport/transcript.ts",
    source: 'const style = resolve("spectrum.3", theme, caps);',
  },
  {
    // The anti-drift rule, and the fabrication is deliberately the *plausible*
    // form rather than an obviously wrong one: a list that is correct on the day
    // it is written, in a source file, next to code that uses it. That is what
    // it looks like in review, and nothing else in the suite would notice it —
    // T4.1 keeps passing because the fixture manifest still has those values.
    rule: "SS22",
    file: "src/interaction/completion/sources.ts",
    source: 'const STATUSES = ["running", "failed", "queued"];',
  },
  { rule: "SS23", file: "src/presentation/blocks/text.ts", source: "const w = label.length;" },
  {
    // SS40's own violation, and the reason it is not SS23 widened. The same
    // expression in the editor wants a different answer: `cells()` is a display
    // width and the cursor needs a grapheme index, so one rule would give one of
    // the two call sites the wrong advice at the moment someone reaches for the
    // quick fix.
    rule: "SS40",
    file: "src/interaction/editor.ts",
    source: "const end = buffer.length;",
  },
  {
    // Copied from the real call site, per the standing rule: C16's keymap built a
    // slot with one function and split it with another, and the separator was a
    // literal NUL. Ten tests passed because both halves agreed.
    rule: "SS43",
    file: "src/interaction/router/keymap.ts",
    source: 'const key = `${target}\u0000${name}`;'.replace("\\u0000", "\u0000"),
  },
  {
    // The code-unit half, which `.length` alone does not cover.
    rule: "SS40",
    file: "src/interaction/editor.ts",
    source: "const ch = buffer.charAt(cursor);",
  },
  {
    // The third branch, which had no fabricated violation and no escape hatch.
    // Slicing the buffer by code unit is how an emoji gets cut in half, and it
    // is the operation someone reaches for first.
    rule: "SS40",
    file: "src/interaction/editor/editor.ts",
    source: "const head = this.text.slice(0, cursor);",
  },
  {
    // The shape an adapter author reaches for when a document wants a
    // timestamp column the far side did not send. It compiles, it reads
    // sensibly, and it makes the adapter untestable against a fixture.
    rule: "SS3",
    file: "src/data/adapters/docker.ts",
    source: "const seed = Math.random();",
  },
  {
    // The shape a world author reaches for when a run needs a plausible loss
    // curve. It reads perfectly well, and it makes every golden frame flake —
    // which is the failure C08 §3 describes and the reason SS2 spans all of
    // `src/` rather than only the fixture directory.
    rule: "SS2",
    file: "src/data/fixtures/rng.ts",
    source: "const jitter = Math.random() * 0.1;",
  },
  {
    // Not C08's file, deliberately. The rule is scoped to `src/` because a
    // jittered retry in the execution pipeline is the same defect wearing a
    // different coat, and a rule scoped to `fixtures/` would not see it.
    rule: "SS2",
    file: "src/shell/execution.ts",
    source: "const backoff = base + crypto.randomUUID().length;",
  },
  {
    // SS24 covers C11, C12 and C18. Two of the three scopes are real now, and
    // both are fabricated against below rather than one standing in for the pair:
    // the rule's `scope` is a list, and a list satisfied by its first entry is
    // the vacuity this file exists for.
    rule: "SS24",
    file: "src/presentation/table/plan.ts",
    source: "let lastPlan = null;",
  },
  {
    // C12's half. The cache someone reaches for is a memo of the last raster,
    // because downsampling 50,000 points looks expensive — and the height, which
    // is the only thing measured, never touches the data at all.
    rule: "SS24",
    file: "src/presentation/plot/scale.ts",
    source: "let lastRange = null;",
  },
  { rule: "SS26", file: "src/data/process/runner.ts", source: 'process.stdout.write(chunk);' },
  {
    // The exit-code half of SS25. A `switch` on the code, on the way to a
    // status, is the shape this rule exists to stop — C06 reports the number and
    // C07 decides what it means (C06 I2).
    rule: "SS25",
    file: "src/data/transport/subprocess.ts",
    source: "if (exit.exitCode === 2) return invalid;",
  },
  {
    // The envelope half. The information is right there, which is exactly why
    // someone builds one.
    rule: "SS25",
    file: "src/data/transport/fixture.ts",
    source: "const error: ErrorLike = { message: stderr };",
  },
  { rule: "SS28", file: "src/interaction/router.ts", source: "scheduler.invalidate();" },
  { rule: "SS33", file: "src/shell/execution.ts", source: 'console.error("failed");' },
  {
    rule: "SS34",
    file: "src/shell/session.ts",
    source: "render({ alternateScreen: true }, ui);",
  },
  {
    rule: "SS37",
    file: "src/presentation/blocks/notice.ts",
    source: '<Text color={style.colour}>{text}</Text>',
  },
  {
    rule: "SS36",
    file: "src/presentation/blocks/text.ts",
    source: 'const style = { colour: "#7faecf", bold: true };',
  },
  {
    // The literal an adapter author writes when a document needs a status
    // marker and the vocabulary is one token short. It compiles behind an
    // `as`, it looks right on the machine it was written on, and it has no
    // ASCII fallback.
    rule: "SS39",
    file: "src/data/adapters/docker.ts",
    source: 'blocks.push({ kind: "notice", tone: "error", glyph: "✗", text });',
  },
  {
    rule: "SS35",
    file: "src/data/manifest/types.ts",
    source: "export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };",
  },

  {
    // The grace period, which is the form this arrives in. Nobody adds an
    // escalation ladder to C21; someone adds two seconds of politeness to
    // `killAll` and the timing policy exists in two places.
    rule: "SS27",
    file: "src/data/process/runner.ts",
    source: "setTimeout(() => handle.signal('SIGKILL'), 2000);",
  },
  {
    // And the other half: the ladder's own signal, named here rather than by a
    // caller. C21 delivers what it is given and names only `SIGKILL`.
    rule: "SS27",
    file: "src/data/process/stream.ts",
    source: 'const first = "SIGTERM";',
  },
  {
    // The read that would make I6 untestable again, and the one SS10 does not
    // cover.
    rule: "SS41",
    file: "src/data/process/runner.ts",
    source: "if (process.stdin.isRaw) throw new Error('suspend first');",
  },
  {
    // SS48 — the second composition. The shape someone would actually write is
    // the old `#render()` body pasted into a file that has a `Composed` in
    // hand, which is why the pattern is the `paint(` call rather than anything
    // structural about frames.
    rule: "SS48",
    file: "src/shell/chrome-preview.ts",
    source: "const lines = paint(frame, deps);",
  },
  {
    rule: "MG1",
    file: "src/presentation/table.ts",
    source: 'import { scroll } from "../viewport/viewport.js";',
  },
  {
    rule: "MG3",
    file: "src/terminal/lifecycle.ts",
    source: 'import { open } from "../data/transport.js";',
  },
  {
    // The sideways edge no other rule sees. Both files are L0 data, so MG1's
    // layer walk reports it clean — and this is the *type-only* form, which
    // every other module-graph rule deliberately ignores. MG6 is the one place
    // an `import type` is an edge, because C06 I1 forbids the reference rather
    // than the emit.
    rule: "MG6",
    file: "src/data/transport/subprocess.ts",
    source: 'import type { ViewDocument } from "../viewmodel/types.js";',
  },
  {
    // The same sideways shape as MG6, one directory over, and in the form
    // someone would actually write it: asking C01 whether the terminal was
    // released reads as *more* correct than probing `stdin.isRaw`, which is
    // exactly why the rule counts a type-only import as an edge. L0's halves
    // are independent in what they know, not merely in what they emit.
    rule: "MG19",
    file: "src/data/process/runner.ts",
    source: 'import type { TerminalLifecycle } from "../../terminal/lifecycle.js";',
  },
  {
    // MG15's, in the form someone would actually write it. Asking C01 for the
    // width reads as *more* correct than reading `stdout.columns` — it is the
    // component that owns the number — and it is the import that turns the
    // editor into something nothing can measure at a width other than the
    // terminal's, which is what T2.1's corpus at widths 20 to 200 needs.
    rule: "MG15",
    file: "src/interaction/editor/layout.ts",
    source: 'import type { TerminalLifecycle } from "../../terminal/lifecycle.js";',
  },
  {
    // MG14's, and it is the import someone would actually write: `decode.ts`
    // matches CSI sequences, and `escapes.ts` is where the CSI vocabulary
    // lives. SS14 already allows `decode.ts` its own escape literals, which is
    // the exemption that exists precisely so C16 does not reach for C01's.
    rule: "MG14",
    file: "src/interaction/router/decode.ts",
    source: 'import { CURSOR } from "../../terminal/escapes.js";',
  },
  {
    // MG16's, and it fabricates the `presentation/` half rather than the
    // `terminal/` one — the second target is the one that would be written, and
    // a single fabrication against a two-target rule proves only the target it
    // used. `errorBlock` is the shape someone reaches for to make an
    // unknown-verb message render nicely.
    rule: "MG16",
    file: "src/interaction/parser/index.ts",
    source: 'import { blocks } from "../../presentation/blocks/index.js";',
  },
  {
    rule: "MG16",
    file: "src/interaction/parser/index.ts",
    source: 'import { escapes } from "../../terminal/escapes.js";',
  },
  {
    // MG17's reachable form, and it is the menu rather than anything exotic.
    // C19 declares how wide the menu wants to be, and "how wide" is one step
    // from "how wide is the terminal" — which is `lifecycle`'s, handed down,
    // and the one axis whose misuse wraps a line and scrolls the alternate
    // screen. C15 I16 keeps the pair honest; this import collapses it.
    rule: "MG17",
    file: "src/interaction/completion/menu.ts",
    source: 'import { size } from "../../terminal/lifecycle.js";',
  },
  {
    // MG18's reachable form is the editor, not the terminal, and it is the
    // import a reasonable person writes: `previous()` has produced a string and
    // the buffer is one call away. What it costs is I1 — the store would then
    // own where the cursor lands and whether the replacement is one undo unit,
    // both of which are the prompt's answers, and both already given.
    rule: "MG18",
    file: "src/interaction/history/store.ts",
    source: 'import type { LineEditor } from "../editor/index.js";',
  },
  {
    // SS9's literal half, which is the live one. A hardcoded state path looks
    // like a courtesy and makes a standalone run write beside a real install —
    // silently, in a file nobody opens until it is wrong (C20 I12, T6.12).
    //
    // **Both forms, and neither is the current default.** SS9 matched `~/.prism`
    // by name and has since survived two renames that would each have retired it
    // in silence: to `~/.calcium`, which no longer contained `prism`, and to
    // `.calcium`, which no longer contains a tilde. The bare arm below passes
    // against the pattern that preceded the second rename and the tilde arm
    // passes against the one that followed the first, so a row carrying only one
    // of them agrees with whichever mistake is current.
    rule: "SS9",
    file: "src/interaction/history/store.ts",
    source: 'const stateDir = deps.stateDir ?? ".widget";',
  },
  {
    rule: "SS9",
    file: "src/interaction/history/store.ts",
    source: 'const stateDir = deps.stateDir ?? "~/.widget";',
  },
  {
    // SS30's three subjects, one fabrication each — a rule with three subjects
    // and one fabrication proves the subject it used, which is SS24's scope
    // list in a different column.
    rule: "SS30",
    file: "src/interaction/completion/context.ts",
    source: "export function tokenise(line: string): readonly string[] {",
  },
  {
    rule: "SS30",
    file: "src/interaction/completion/insert.ts",
    source: "function quote(candidate: string): string {",
  },
  {
    rule: "SS30",
    file: "src/interaction/parser/suggest.ts",
    source: "function levenshtein(a: string, b: string): number {",
  },
  {
    rule: "MG20",
    file: "src/terminal/frame-scheduler.ts",
    source: 'import { ALT_SCREEN } from "./escapes.js";',
  },
  {
    // The edge C09 opens, and the two edits that would widen it. A value
    // import of anything in `terminal/` other than `escapes.js` fails; the
    // type-only form of the same import does not, and the case below asserts
    // that separately rather than assuming it.
    rule: "MG21",
    file: "src/presentation/blocks/notice.ts",
    source: 'import { detect } from "../../terminal/capabilities.js";',
  },
  {
    // **Copied from `lifecycle.ts:310`**, per A03 commitment 14a: where a rule
    // targets a code idiom, the fabricated violation comes from a real call site
    // rather than being written fresh. SS20 is why — its fabrication was written to
    // the rule's own assumption about how the code is spelled, so it reproduced the
    // assumption and the rule never matched the idiom in use.
    //
    // The plausible version of the violation, too: a renderer that wants the width
    // and has not been handed it. That is the second reader, and two readers at two
    // moments in one frame is how a frame comes to be composed against two widths.
    rule: "SS42",
    file: "src/presentation/blocks/paint.ts",
    source: "const width = stdout.columns;",
  },
  {
    // **Copied from a real call site**, which A03 §2 makes the standing rule for
    // any scan targeting a code idiom: a fabrication written fresh uses the same
    // idiom the rule was written against, and SS20 is the instance that proved
    // it — correct about a syntax nobody writes while the idiom in use walked
    // past.
    //
    // This is C06's `createTransport` as it would look if the framework
    // resolved its own mode, which is the plausible version: the value is right
    // there in the environment and passing it through config is one more hop.
    rule: "SS44",
    file: "src/data/transport/factory.ts",
    source: 'const mode = process.env["PRISM_TUI_TRANSPORT"] ?? "subprocess";',
  },
  {
    // The edge that actually shipped, and the reason MG26 exists: a production
    // module reaching into the dev-only entry for a render helper that was
    // written there because a test called it first.
    rule: "MG26",
    file: "src/shell/paint.ts",
    source: 'import { renderSequenceToLines } from "../testing/index.js";',
  },
  {
    // The fixtures half, which never shipped but is the same claim.
    rule: "MG26",
    file: "src/shell/session.ts",
    source: 'import { recordFixture } from "../fixtures/index.js";',
  },
  {
    // C24 I5's table, in the form a builder would actually grow one. `b.row`
    // takes a `Record<string, CellInput>` and the keys are the data's own field
    // names, so a lookup from key to tone is one small step from where the
    // ergonomics already are — and it renders the wrong colour rather than
    // throwing, on whichever verb first uses a key nobody listed.
    rule: "SS45",
    file: "src/shell/builders/index.ts",
    source: 'const TONE_BY_KEY = { status: "warn", health: "error" };',
  },
  {
    // The same inference written inline, which is the form that makes the rule
    // worth having: no standing table to notice in review.
    rule: "SS45",
    file: "src/shell/builders/index.ts",
    source: 'if (key === "status") return cell({ text, tone: "warn" });',
  },
  {
    // C23 §3b claimed one producer of `origin: "refresh"` and there were four,
    // so the sentence read as a guarantee and constrained nothing. The value now
    // means provenance rather than mechanism, and a set claimed in prose wants a
    // check — or the next reader who greps one site re-makes the claim.
    rule: "SS46",
    file: "src/data/adapters/fallback.ts",
    source: 'meta: { origin: "refresh", verb: null },',
  },
  {
    // SS46's argument with a narrower set — one site rather than four. `defect`
    // is worth a fifth arm on a public union only because it separates a
    // contained failure from a verb that did nothing, and a second producer
    // widens it back into "something went wrong", which is the drift SS46 was
    // written after.
    rule: "SS49",
    file: "src/shell/documents.ts",
    source: 'return compose({ command, status, meta: { origin: "defect" } });',
  },
  {
    // The C22 half, and the one that actually shipped in a draft: `stateDir`
    // resolving its own variable, which reads as C22 owning the default rather
    // than as the framework reading the environment.
    rule: "SS44",
    file: "src/shell/config.ts",
    source: 'stateDir: config.stateDir ?? process.env.PRISM_TUI_STATE_DIR ?? ".calcium",',
  },
  {
    // **The shape SS29 could not catch and MG23 does.** An overlay manager
    // wanting the live entry's id to title a view is the reach a reader makes:
    // both are L2, so no layer walk objects, and no per-component row names this
    // pair. C15 holds one store already, so a second is L4's — through C23 and
    // its local handlers, never laterally.
    rule: "MG23",
    file: "src/viewport/overlay/manager.ts",
    source: [
      'import type { TranscriptView } from "../transcript/index.js";',
      'import { createBlockRegistry } from "../../presentation/blocks/index.js";',
    ].join("\n"),
  },
  {
    // The edge a reader would reach for: a plot inside an expanded table row
    // wants a width, and `planColumns` has one. Written as a type-only import
    // deliberately — that is the form that erases at build and passes every other
    // rule, which is why MG6 and MG19 both record that it counts here.
    rule: "MG22",
    file: "src/presentation/plot/definition.ts",
    source: 'import type { PlannedColumns } from "../table/plan.js";',
  },
  {
    // The plausible version, and the reason MG10 is not covered by MG1: this
    // edge goes *downward*, L2 to L1, so the layer walk permits it. What a
    // reader reaches for is measurement — "evict the tallest" or "stop at the
    // viewport's worth of rows" both read as more correct than a block count,
    // and both would make the store depend on a width it cannot honestly obtain.
    rule: "MG10",
    file: "src/viewport/transcript/cap.ts",
    source: 'import { createBlockRegistry } from "../../presentation/blocks/index.js";',
  },
  {
    // The other half of I18, and the one that arrives as a convenience: a `seq`
    // that is "obviously" better as a timestamp, or an eviction notice that
    // wants to know how wide the terminal is before it phrases itself.
    rule: "MG10",
    file: "src/viewport/transcript/store.ts",
    source: 'import type { TerminalSize } from "../../terminal/lifecycle.js";',
  },
  {
    // SS4. Copied from the idiom a store would actually use — `Date.now()` for a
    // `seq` that someone wanted sortable across sessions — rather than written
    // to the rule's own assumption, which is SS20's lesson (A03 commitment 14a).
    rule: "SS4",
    file: "src/viewport/transcript/store.ts",
    source: "const seq = Date.now();",
  },
  {
    // MG11, and the temptation is sharper than C13's because C14 genuinely needs
    // a width. C01 I13 and SS42 give the terminal's dimensions exactly one
    // reader; a viewport that reads them itself gets a second width at a second
    // moment, and a frame composed against two widths wraps inside the alternate
    // screen — which scrolls content the application has no record of.
    rule: "MG11",
    file: "src/viewport/viewport/viewport.ts",
    source: 'import type { TerminalSize } from "../../terminal/lifecycle.js";',
  },
  {
    // SS13. Copied from the shape copy mode reaches for: yank has to put text
    // somewhere and `pbcopy` is one line away. C14 §6 injects the writer for
    // exactly that reason — a component that shells out cannot be unit-tested.
    rule: "SS13",
    file: "src/viewport/viewport/viewport.ts",
    source: 'spawnSync("pbcopy", { input: rows.join("\\n") });',
  },
  {
    // The `fs` half of the same rule: writing a scrollback dump to disk.
    rule: "SS13",
    file: "src/viewport/viewport/viewport.ts",
    source: 'import { writeFileSync } from "node:fs";',
  },
  {
    // MG13, and this fabrication is the one-line fix the C15 spec pass rejected
    // — copied from it rather than invented, per A03 commitment 14a. I10 asked
    // C15 to dismiss an overlay whose anchor row had been evicted, and the only
    // way to notice is to subscribe to the store. It buys detection and pays
    // with C15's statelessness, `layout()`'s purity, and a second component
    // reading a change stream as state.
    rule: "MG13",
    file: "src/viewport/overlay/manager.ts",
    source: 'import type { Change } from "../transcript/index.js";',
  },
  {
    // MG12, the other reach: `layout()` takes a region as a parameter, and the
    // viewport is right there holding one. A manager that can ask where it is
    // has acquired state nothing can assert it pure over.
    rule: "MG12",
    file: "src/viewport/overlay/place.ts",
    source: 'import type { ScrollState } from "../viewport/index.js";',
  },
  {
    // MG12's downward half, which the layer walk permits: a layer that wants to
    // know the terminal's width rather than the region's.
    rule: "MG12",
    file: "src/viewport/overlay/place.ts",
    source: 'import type { TerminalSize } from "../../terminal/lifecycle.js";',
  },
];

const scanIds = SCANS.map((s) => s.id);

/**
 * Scans that are their own function rather than a row of `SCANS`.
 *
 * SS47's subject is a string literal's *contents* rather than a line, and its
 * exemptions carry reasons with a bidirectional arm — neither of which the shared
 * row shape can hold. Listed here for the same reason `MODULE_GRAPH_RULES` is a
 * list: a rule invisible to `implemented` is a rule the fabrication check does not
 * demand a violation for, which is A03 §2 arriving in the mechanism against it.
 */
const STANDALONE_SCANS = ["SS47"];

const implemented = [
  ...scanIds,
  ...STANDALONE_SCANS,
  ...MODULE_GRAPH_RULES,
  ...DEPENDENCY_RULES,
  ...SPEC_RULES,
];

function srcFiles(dir = "src", out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) srcFiles(path, out);
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(path);
  }
  return out;
}

describe("A03 commitment 14 — no rule is assumed to work", () => {
  it("every implemented rule has a fabricated violation", () => {
    // The assertion that makes the commitment enforceable rather than a habit:
    // a rule added to SCANS or to either RULES list without a case below fails
    // here, on the commit that adds it.
    const covered = new Set([
      ...FABRICATED.map((f) => f.rule),
      // MG24 is fabricated in its own row below rather than in `FABRICATED`:
      // that table is one source line per rule, and this one needs a small
      // file *set* — a member and the file that would consume it — because
      // the property is about the absence of a consumer rather than about a
      // line being present.
      "MG24",
      // MG25 likewise, and for a second reason: half its property is about the
      // allow-list rather than about the tree, and that half needs two runs of
      // the same fixture with different lists.
      "MG25",
      // SS47 likewise: its subject is a string literal's contents rather than a
      // line, and its exemptions carry reasons the shared shape has nowhere to put.
      "SS47",
      // MG27 likewise: its subject is two whole files read together — a block
      // type and the builder that constructs it — so the shared `FABRICATED`
      // shape, which is one file's text, cannot express it.
      "MG27",
      ...DEPENDENCY_RULES,
      // The SP family's fabrications are in `enforce-commitments.test.ts`,
      // beside the parser they exercise. Listing them here without checking that
      // would be commitment 14 satisfied by assertion, so the next test reads
      // that file and looks for them.
      ...SPEC_RULES,
    ]);
    expect([...implemented].sort()).toEqual([...covered].sort());
  });

  it("MG24 fires: the file that IMPLEMENTS a member is not a consumer of it", () => {
    // **F83's fix, and the row that pins it.** The rule matched a bare name
    // until F83, so `store.ts` writing `rerun() { … }` counted as consuming the
    // `rerun` that `types.ts` declares — declaration and implementation closing
    // the loop with nothing calling anything. Every interface split across those
    // two files passed by construction, which is most of `src/`.
    //
    // The fixture is the real shape: a declaration, an implementation that names
    // the member without calling it, and one member that is genuinely called.
    const split: Record<string, string> = {
      "src/interaction/history/types.ts":
        "export interface HistoryStore {\n" +
        "  append(line: string): void;\n" +
        "  rerun(n: number): void;\n" +
        "}\n",
      // The implementation. `rerun` appears as a definition, never as a call —
      // which is exactly what the bare-name rule could not tell apart.
      "src/interaction/history/store.ts":
        "export const store = {\n" +
        "  append(line: string) { rows.push(line); },\n" +
        "  rerun(n: number) { void n; },\n" +
        "};\n",
      // A real consumer, so the fixture is not vacuous in the other direction.
      "src/shell/keys.ts": "history.append(line);\n",
    };

    const violations = checkSeamConsumers(Object.keys(split), (f) => split[f] ?? "", {});
    const named = violations.map((v) => v.message.split(" ")[0]);

    expect(named, "rerun is implemented and never called; append is called").toEqual([
      "HistoryStore.rerun",
    ]);
  });

  it("MG24 walks `export type X = Readonly<{…}>`, and a record is consumed by being BUILT", () => {
    // **F84.** The walk was anchored on `export interface`, and this codebase
    // publishes object types both ways — 276 members behind one keyword and 798
    // behind the other, outside the reach of every rule in the suite. The old
    // header justified the scope with *a type alias is structural and can be
    // satisfied without being named*, which is true about satisfying a type and
    // irrelevant to consuming a member of one.
    //
    // **And the consumer test has to differ with the keyword.** An interface is
    // called into; a record is built. `{ dots: … }` names a member with no dot
    // in front of it, and dot-access alone reported 82 over the widened walk.
    const rec: Record<string, string> = {
      "src/presentation/plot/raster.ts":
        "export type Grid = Readonly<{\n" +
        "  rows: number;\n" +
        "  dots: readonly number[];\n" +
        "}>;\n",
      // A consumer that BUILDS one — `rows` is supplied and must not be
      // reported; `dots` is named nowhere and must be.
      "src/presentation/plot/render.ts": "const g = { rows: 4 };\n",
    };

    const violations = checkSeamConsumers(Object.keys(rec), (f) => rec[f] ?? "", {});
    const named = violations.map((v) => v.message.split(" ")[0]);

    expect(named, "a supplied field is consumed; an unsupplied one is not").toEqual([
      "Grid.dots",
    ]);
  });

  it("MG24 reads a member on any line, so formatting does not decide what is watched", () => {
    // **F159.** The walk read one member per line, so a declaration written on
    // one line presented exactly one member and every later one was outside the
    // rule. 40 published object types under `src/` were single-line, and none of
    // them was unwatched by a decision anybody took.
    //
    // **The row is written against the fabricated violation that found it**: this
    // fixture passed `make enforce` clean under both keywords, and was caught
    // only when the same alias was broken across lines. Both keywords are here,
    // because the discriminator turned out to be neither of them.
    const oneLine: Record<string, string> = {
      "src/data/manifest/types.ts":
        "export type Anchor = Readonly<{ rowOffset: number; rows: number }>;\n" +
        "export interface Region { readonly height: number; readonly width: number }\n",
      // First member of each is supplied or accessed; the second of each is not.
      "src/viewport/viewport/anchor.ts": "const a = { rowOffset: 0 };\nvoid r.height;\n",
    };

    const violations = checkSeamConsumers(Object.keys(oneLine), (f) => oneLine[f] ?? "", {});
    const named = violations.map((v) => v.message.split(" ")[0]).sort();

    expect(named, "the second member of a one-line declaration is reachable").toEqual([
      "Anchor.rows",
      "Region.width",
    ]);
  });

  it("MG24 does not read a member out of a comment inside a declaration", () => {
    // **The cost of segmenting, paid before it was charged.** Splitting at a
    // separator rather than at a newline means a `,` inside a sentence starts a
    // segment mid-prose, and the probe produced three phantoms —
    // `CompletionEngine.synchronously`, `Pipeline.appended`, `TuiConfig.wired` —
    // from comments that the line walk could not match because a comment line
    // begins `*` or `//`.
    //
    // A phantom is the worst shape a violation takes (F95): it cannot be wired
    // and cannot be deleted, so an exemption is the only resolution and it
    // justifies something that does not exist. Stripping prose before reading
    // structure is what `checkSeamConsumers` already did on the *consumer* side.
    const prose: Record<string, string> = {
      "src/shell/types.ts":
        "export interface Pipeline {\n" +
        "  /** Runs, appended: exactly once per source. */\n" +
        "  readonly run: () => void;\n" +
        "}\n",
      "src/shell/construct.ts": "p.run();\n",
    };

    const violations = checkSeamConsumers(Object.keys(prose), (f) => prose[f] ?? "", {});

    expect(violations, "`appended` is a word in a sentence, not a member").toEqual([]);
  });

  it("MG24 does not report a method PARAMETER as an interface member", () => {
    // **F95.** The member pattern is line-oriented, so a parameter inside a
    // multi-line signature matched it — `take(sourceId, key, ttlMs, run)` gave
    // `CompletionCache` four phantom members, two of which reached the violation
    // list. A phantom is the worst shape a violation can take: it cannot be
    // wired and it cannot be deleted, so an allow-list entry is the only
    // resolution and it justifies something that does not exist.
    const nested: Record<string, string> = {
      "src/interaction/completion/cache.ts":
        "export interface CompletionCache {\n" +
        "  take(\n" +
        "    sourceId: string,\n" +
        "    key: string,\n" +
        "  ): Promise<string>;\n" +
        "}\n",
    };

    const violations = checkSeamConsumers(Object.keys(nested), (f) => nested[f] ?? "", {});
    const named = violations.map((v) => v.message.split(" ")[0]);

    expect(named, "only `take` is a member — sourceId and key are its parameters").toEqual([
      "CompletionCache.take",
    ]);
  });

  it("MG24 fires: a published interface member no other file in src/ names", () => {
    // **Fabricated from the four real instances**, which is the only way to
    // exercise it now that each is wired. Every one was a component complete on
    // its own side of a seam with nothing on the other, and every one passed
    // both suites: the producer tests it, and the consumer never mentions what
    // it fails to consume.
    const seam: Record<string, string> = {
      "src/interaction/completion/engine.ts":
        "export interface CompletionEngine {\n" +
        "  request(ctx: unknown, seq: number): Promise<unknown>;\n" +
        "  cancel(): void;\n" +
        "  readonly spinning: boolean;\n" +
        "}\n",
      // The consumer that exists, so the fixture is not vacuous: `request` is
      // called here and must not be reported.
      //
      // **This read `void 0; // request` and the fixture was the bug.** The
      // only "consumption" was a comment, and the assertion below required MG24
      // to treat it as one — encoding the defect as the expected behaviour.
      // Comments are stripped now, so the consumer has to be code.
      "src/shell/keys.ts": "engine.request();\n",
    };

    const violations = checkSeamConsumers(Object.keys(seam), (f) => seam[f] ?? "", {});
    const named = violations.map((v) => v.message.split(" ")[0]).sort();

    expect(named, "the two with no consumer, and not the one with").toEqual([
      "CompletionEngine.cancel",
      "CompletionEngine.spinning",
    ]);
    expect(violations[0]?.rule).toBe("MG24");
    expect(violations[0]?.message).toContain("complete on its own side of a seam");

    // **A mention in a comment is not a consumer**, and this is the arm that
    // pins it. `DocumentAssertions.measuresCorrectly` was reported consumed on
    // the strength of one sentence in `measurement-conformance.ts` saying that
    // `expectDocument().measuresCorrectly(widths)` wraps it — five siblings of
    // the same interface fired and it did not, which is the only reason anybody
    // looked. Stripping prose then found four more in shipped code.
    //
    // The direction is counter-intuitive and worth stating: a seam with no
    // consumer accumulates explanation in exactly the proportion that it lacks
    // calls, so a naive count reports the unwired member as consumed with the
    // highest confidence in the tree.
    const commentOnly = checkSeamConsumers(
      Object.keys(seam),
      (f) => (f === "src/shell/keys.ts" ? "void 0; // request\n" : (seam[f] ?? "")),
      {},
    );
    expect(
      commentOnly.map((v) => v.message.split(" ")[0]).sort(),
      "a name mentioned only in a comment is not a consumer",
    ).toEqual(["CompletionEngine.cancel", "CompletionEngine.request", "CompletionEngine.spinning"]);

    // **The allow-list is what keeps it honest**, and it must actually exempt:
    // an entry with no effect is an exception list that reports compliance for
    // the case it was written to permit.
    const exempted = checkSeamConsumers(Object.keys(seam), (f) => seam[f] ?? "", {
      "CompletionEngine.cancel": "why",
      "CompletionEngine.spinning": "why",
    });
    expect(exempted, "a named member is exempt").toEqual([]);
  });

  it("SS47 fires: a mark in framework text, and the exemption list expires", () => {
    // **The three controls are the rule's scope, and they are the whole point.**
    // The scan's scope was chosen across three candidates (F122), and the one
    // that reports fewest sites — "a literal with no ASCII word in it" — misses
    // `loading…` and `▸ [y] yes`, which are the sites the ruling is about.
    const files = ["src/mark.ts", "src/prose.ts", "src/excused.ts"];
    const read = (f: string): string =>
      f.endsWith("mark.ts")
        ? ['const a = "loading…";', 'const b = `${sel ? "▸" : " "} [y] yes`;'].join("\n")
        : f.endsWith("prose.ts")
          ? [
              'const c = "a verb — and its flags — are the app\'s (§3)";',
              "// a comment naming ❯ is prose about the rule, not a violation of it",
            ].join("\n")
          : 'const G = ["✓", "+"];';

    const violations = checkMarks(files, read, { "src/excused.ts": "the vocabulary itself" });

    // Both marks, and **both are inside literals carrying ASCII words** — the
    // case a tighter "is this literal only marks?" rule cannot see.
    expect(violations.filter((v) => v.file === "src/mark.ts")).toHaveLength(2);
    expect(violations.every((v) => v.rule === "SS47")).toBe(true);

    // **The letterlike control, and it is the one a mutation found missing.**
    // `\p{L}` alone — the first fix for `rôle` firing — passes `ℹ`, which is
    // U+2139, in a letter category, and C09's `info` glyph. Deleting the range
    // exclusion from `isLetter` survived the whole suite until this row existed,
    // which is a finding about the tests rather than a licence (F122).
    const letterlike = checkMarks(["src/info.ts"], () => 'const g = "ℹ";', {});
    expect(
      letterlike.length,
      "a letterlike symbol is a mark, whatever its Unicode category says",
    ).toBe(1);
    expect(
      checkMarks(["src/word.ts"], () => 'const w = "a rôle, naïve";', {}),
      "and an actual letter is prose",
    ).toEqual([]);

    // The prose control. 106 literals in the real tree are this, and the rule
    // passes every one — a limit recorded in the rule's own comment, because an
    // em dash at `unicode: ascii` is as unsubstituted as `❯` was.
    expect(
      violations.some((v) => v.file === "src/prose.ts"),
      "prose punctuation and comments are not marks",
    ).toBe(false);

    // The exemption control, and the arm that keeps the reasons honest.
    expect(violations.some((v) => v.file === "src/excused.ts")).toBe(false);
    const stale = checkMarks(files, read, {
      "src/excused.ts": "the vocabulary itself",
      "src/prose.ts": "this file has no mark, so the entry has outlived its reason",
    });
    expect(
      stale.some((v) => v.file === "src/prose.ts" && v.message.includes("carries no mark")),
      "an exemption that outlives its reason is a violation of its own",
    ).toBe(true);
  });

  it("MG27 fires: a block field no builder sets, and the reason list expires", () => {
    // **Fabricated from the real first run**, where the three below came back:
    // `patch.collapsedAfter` (filed as F41 by a consumer who wanted it),
    // `patch.actions` and `table.sort` (found by this rule and nothing else).
    //
    // The fixture carries both corrections the rule needed before it was
    // trustworthy, because a rule that over-reports is not a rule anyone keeps:
    // a `Hunk` whose line `kind` is `"add"` — which the first version read as a
    // block kind that does not exist — and a single-line `Readonly<{…}> & Gap`
    // declaration, which a multi-line body regex read straight past.
    const types = [
      'export type Hunk = Readonly<{ lines: readonly Readonly<{ kind: "add"; text: string }>[] }>;',
      'export type Rule = Readonly<{ kind: "rule"; id: string; label: string }> & Gap;',
      "export type Widget = Readonly<{",
      '  kind: "widget";',
      "  id: string;",
      "  shown: string;",
      "  hidden: number;",
      "  excused: boolean;",
      "}> & Gap;",
      "",
      "export type Block =",
      "  | Rule",
      "  | Widget;",
      "",
    ].join("\n");

    const builders = [
      "function finish(spec, opts, gapDefault) { return gapBefore; }",
      "function widget(spec) {",
      '  return finish({ kind: "widget", id: idOf(spec), shown: spec.shown }, spec, true);',
      "}",
      "function rule(label) {",
      '  return finish({ kind: "rule", id: idOf(), label }, undefined, true);',
      "}",
    ].join("\n");

    const files = ["src/data/viewmodel/types.ts", "src/shell/builders/index.ts"];
    const read = (f: string): string =>
      f.endsWith("types.ts") ? types : f.endsWith("builders/index.ts") ? builders : "";

    // With `excused` accounted for and `hidden` not, exactly one field is a
    // violation — which is the discriminator: a rule reporting both would be
    // ignoring the reason list, and one reporting neither would be vacuous.
    const violations = checkBuilderCoverage(files, read, { "widget.excused": "no surface has one" });
    expect(
      violations.map((v) => v.message.match(/`(\w+)` and no builder/u)?.[1]),
      "`hidden` alone — `shown` is set, `excused` has a reason, `rule` is intact",
    ).toEqual(["hidden"]);
    expect(violations[0]?.rule).toBe("MG27");

    // **The `Hunk` control.** `kind: "add"` is a *line's* kind, and the first
    // version of this rule invented three block kinds from literals like it.
    expect(
      violations.some((v) => v.message.includes("`add`")),
      "a line kind is not a block kind",
    ).toBe(false);

    // **The single-line control.** `Rule` is `{ kind, id, label }` and `label`
    // is set; a body regex that ran past `}> & Gap;` would attribute `Widget`'s
    // fields to it and report them here.
    expect(
      violations.some((v) => v.message.includes("`rule` carries")),
      "a one-line declaration is read as its own",
    ).toBe(false);

    // The bidirectional arm, as `UNCONSUMED_MEMBERS` has: an entry naming a
    // field the builder now sets is itself a violation, or the list stops being
    // read the first time someone closes a gap without tidying up.
    const stale = checkBuilderCoverage(files, read, {
      "widget.excused": "no surface has one",
      "widget.shown": "this one is set, so the entry has outlived its reason",
    });
    expect(
      stale.some((v) => v.message.includes("which the builder now sets")),
      "an exemption that outlives its reason is a violation of its own",
    ).toBe(true);
  });

  it("MG25 fires: an exported function no other file in src/ names", () => {
    // **Fabricated from the real first run**, where 7 of 281 came back and the
    // two shapes below were both in it: a producer with no driver
    // (`assignOffsets`) and a name that appears only inside a comment
    // (`backoffOf`, described in four and called in none).
    const tree: Record<string, string> = {
      "src/shell/refresh.ts":
        "export function assignOffsets(parts: unknown[]) { return parts; }\n" +
        "export function backoffOf(ms: number) { return ms; }\n" +
        "export function watchStall(id: string) { return id; }\n",
      // The consumer that exists, so the fixture is not vacuous — and the
      // comment that must not count as one, which is the discriminator MG24's
      // header got wrong and this rule turns on.
      "src/shell/execution.ts": "watchStall('e1');\n// backoffOf is the A02 §7 rule\n",
    };
    const files = Object.keys(tree);
    const read = (f: string): string => tree[f] ?? "";

    const violations = checkFunctionConsumers(files, read, {});
    expect(
      violations.map((v) => v.message.split(" ")[0]).sort(),
      "the producer with no driver and the one named only in prose — not the wired one",
    ).toEqual(["assignOffsets", "backoffOf"]);
    expect(violations[0]?.rule).toBe("MG25");
    expect(violations[0]?.message).toContain("a producer with no consumer");

    // A constant is out of scope by construction, and that is the correction
    // that makes the rule usable: MG24's header measured this rule over every
    // export, found it dominated by constants a test asserts against, and
    // rejected it. Narrowing to functions is what answers that, so it is
    // asserted rather than assumed.
    expect(
      checkFunctionConsumers(["src/a.ts"], () => "export const UNDO_LIMIT = 100;\n", {}),
      "a constant exported for a test to assert against is not this rule's business",
    ).toEqual([]);

    // The allow-list exempts...
    expect(
      checkFunctionConsumers(files, read, { assignOffsets: "why", backoffOf: "why" }),
      "a named function is exempt",
    ).toEqual([]);

    // ...and is compared by **equality**, which is the arm that keeps it read.
    // Membership alone is how SS40's scope, CP6's surfaces and MG24's own first
    // form each became too permissive: the entry is judged once and everything
    // after it inherits the judgement.
    const stale = checkFunctionConsumers(files, read, {
      assignOffsets: "why",
      backoffOf: "why",
      watchStall: "wired since this entry was written",
    });
    expect(stale, "an entry excusing nothing is itself a violation").toHaveLength(1);
    expect(stale[0]?.message).toContain("no longer an unconsumed export");
  });

  it("every SP rule has a fabrication in the file that owns the parser", () => {
    // The claim above, made checkable. Without this, adding `SP4` to `SPEC_RULES`
    // would satisfy commitment 14 by being named in a set — which is the "rule
    // inventoried and never implemented" failure moved one file across.
    const suite = readFileSync("test/unit/enforce-commitments.test.ts", "utf8");
    const titles = [...suite.matchAll(/\bit\("([^"]+)"/g)].map((m) => m[1] ?? "");

    for (const rule of SPEC_RULES) {
      expect(
        titles.some((t) => t.startsWith(rule) && /\bfails\b|\bfires\b/.test(t)),
        `${rule} has no test asserting it fires`,
      ).toBe(true);
    }
  });

  it.each(FABRICATED)("$rule fires on a fabricated violation", ({ rule, file, source }) => {
    const read = (f: string): string => (f === file ? source : "");
    const violations =
      rule === "MG23"
        ? checkOneStorePerComponent([file], read)
        : rule.startsWith("MG")
          ? checkModuleGraph([file], read)
          : checkSourceScans([file], read);

    const fired = violations.filter((v) => v.rule === rule);
    expect(fired, `${rule} matched nothing — it would pass on a real violation`).toHaveLength(1);
    expect(fired[0]!.spec, `${rule} must name the spec that declared it`).toBeTruthy();
  });

  it("MG3 fires on a fabricated *type-only* cross-half edge, which it could not see at all", () => {
    // **The arm's only proof, because the tree has no subject for it.** The walk
    // over `src/` finds zero cross-half edges of either kind, so a green run says
    // nothing — F83's lesson one rule over. Measured by hand before this row
    // existed: a real type-only edge in `data/adapters/types.ts` left
    // `make enforce` green at 175 files and 6927 references, and the same edge
    // written as a value import fired MG3 at once. The rule worked; half its
    // subject was invisible (FINDINGS F127).
    // **Not `adapters/types.ts`.** That file holds the one entry
    // `CROSS_HALF_TYPES` excuses, so fabricating there tests the exemption
    // rather than the arm — the row would pass with the walk switched off.
    const file = "src/data/manifest/parse.ts";
    const read = (f: string): string =>
      f === file ? 'import type { TerminalCapabilities } from "../../terminal/capabilities.js";' : "";

    const fired = checkModuleGraph([file], read).filter((v) => v.rule === "MG3");
    expect(fired, "MG3 does not walk `import type` — the arm is off").toHaveLength(1);
    expect(fired[0]!.message).toContain("type-only");

    // The control, and it is what tells the arm from the walk it sits beside:
    // the same file with no cross-half import at all must be silent, or the row
    // above passes against a rule that fires on everything.
    const clean = (f: string): string =>
      f === file ? 'import type { RawResult } from "../transport/types.js";' : "";
    expect(checkModuleGraph([file], clean).filter((v) => v.rule === "MG3")).toHaveLength(0);
  });

  it("SS40's annotation is honoured on all three branches, and is a claim", () => {
    // The lookahead sat on the `.length` alternative alone, so `.charAt(` and
    // `.slice(` had no escape hatch — and C17 needs one, because slicing a
    // *grapheme array* is the operation the rule is asking for rather than the
    // one it forbids. A rule with no way to say "this is correct here" is a
    // rule people route around by renaming the variable.
    //
    // Asserted per branch rather than once: the widening is a change to a
    // regex, and a regex edit that silently covered two of three would leave
    // exactly the branch nobody tested unannotated. `make enforce` would print
    // `ok` either way.
    const annotated: Record<string, string> = {
      "src/interaction/editor/graphemes.ts": [
        "const n = clusters.length; // graphemes-ok",
        "const head = clusters.slice(0, at); // graphemes-ok",
        "const first = row.charAt(0); // graphemes-ok",
      ].join("\n"),
    };

    const clean = checkSourceScans(Object.keys(annotated), (f) => annotated[f] ?? "");

    expect(
      clean.filter((v) => v.rule === "SS40"),
      "an annotated grapheme-array operation is the remedy, not a violation",
    ).toHaveLength(0);

    // And the annotation is a claim about the expression, not a licence for the
    // line: the same three without it are three violations, one per branch.
    const bare: Record<string, string> = {
      "src/interaction/editor/graphemes.ts": [
        "const n = clusters.length;",
        "const head = clusters.slice(0, at);",
        "const first = row.charAt(0);",
      ].join("\n"),
    };

    expect(
      checkSourceScans(Object.keys(bare), (f) => bare[f] ?? "").filter((v) => v.rule === "SS40"),
      "each branch fires on its own",
    ).toHaveLength(3);
  });

  it("MG21 permits escapes.js, and permits a type-only capability import", () => {
    // The half of the rule a fabricated violation cannot show. MG21 is only
    // useful if the two imports C09 §3 actually needs pass it: `sgr` at run
    // time, and `TerminalCapabilities` as a type. A rule that failed on those
    // would be reverted within the hour and the edge would stop being watched.
    const permitted = {
      "src/presentation/blocks/notice.ts": [
        'import { sgr, SGR_RESET } from "../../terminal/escapes.js";',
        'import type { TerminalCapabilities } from "../../terminal/capabilities.js";',
        "",
      ].join("\n"),
    };

    const violations = checkModuleGraph(
      Object.keys(permitted),
      (f) => permitted[f as keyof typeof permitted] ?? "",
    ).filter((v) => v.rule === "MG21");

    expect(violations, "the two imports C09 §3 requires must both pass").toEqual([]);
  });

  it("SS31 fires on a dependency with no entry in DEPENDENCIES.md", () => {
    const violations = checkDependencies({
      readFile: (f) =>
        f === "package.json"
          ? JSON.stringify({ dependencies: { "left-pad": "1.0.0" } })
          : "# Dependencies\n\n## Runtime\n\n| Package |\n|---|\n",
      exists: () => true,
      tree: [],
    }).filter((v) => v.rule === "SS31");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain("left-pad");
  });

  it("SS32 fires on an install script in the tree, and on our own manifest", () => {
    const dep = checkDependencies({
      readFile: (f) =>
        f === "package.json"
          ? "{}"
          : f === "DEPENDENCIES.md"
            ? ""
            : JSON.stringify({ scripts: { postinstall: "curl … | sh" } }),
      exists: () => true,
      tree: [["evil", "node_modules/evil"]],
    }).filter((v) => v.rule === "SS32");

    expect(dep, "a dependency's postinstall must fail the build").toHaveLength(1);
    expect(dep[0]!.file).toBe("node_modules/evil/package.json");

    const ours = checkDependencies({
      readFile: (f) =>
        f === "package.json" ? JSON.stringify({ scripts: { prepare: "husky" } }) : "",
      exists: () => true,
      tree: [],
    }).filter((v) => v.rule === "SS32");

    // `prepare` is deliberately not checked on dependencies — it never runs for
    // a published tarball — but it is checked on ours, where it would.
    expect(ours).toHaveLength(1);
  });

  it("SS32's named exceptions are exceptions, not blanket permission", () => {
    const violations = checkDependencies({
      readFile: (f) =>
        f === "package.json"
          ? "{}"
          : f === "DEPENDENCIES.md"
            ? ""
            : JSON.stringify({ scripts: { install: "node-gyp rebuild" } }),
      exists: () => true,
      tree: [
        ["node-pty", "node_modules/node-pty"],
        ["node-pty-fork", "node_modules/node-pty-fork"],
      ],
    }).filter((v) => v.rule === "SS32");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.file).toContain("node-pty-fork");
  });
});

/**
 * The second half, and the one the fabricated violations cannot reach: a
 * fabrication is written at a path inside the declared scope, so it fires
 * whether or not that scope describes anything real.
 */
describe("A03 commitment 14 — every scope reaches the tree", () => {
  // Rules whose scope matches nothing today, each with the component that will
  // create it. An entry here is a rule that is NOT being enforced.
  // Empty, and that is the news. SS26 sat here from the day the rule was
  // written: it scoped to `src/data/process/` while the tree had
  // `src/data/process.ts`, a file, so it had never once been evaluated. C06
  // needed C21's interface, the interface landed as `src/data/process/types.ts`,
  // and the directory became real — at which point this list's own assertion
  // failed, which is what a pending entry is for.
  const PENDING: Record<string, string> = {};

  const files = srcFiles();

  // **Flattened per scope, not per rule.** SS24 has three scopes declared and had
  // one written down; a rule whose scopes are checked as a set would be satisfied
  // by any one of them matching, which is how two thirds of a rule stays vacuous
  // while its row reads as covered. Every scope answers for itself.
  it.each(
    SCANS.flatMap((s) =>
      (Array.isArray(s.scope) ? s.scope : [s.scope]).map((scope) => ({ id: s.id, scope })),
    ),
  )(
    "$id's scope $scope matches at least one file",
    ({ id, scope }) => {
      const matched = files.filter((f) => f.replaceAll("\\", "/").startsWith(scope));

      if (PENDING[id] !== undefined) {
        // The exemption is itself checked: when C21 lands and the scope becomes
        // real, this fails and the entry above must go. A pending list that
        // outlives its reason is how a rule stays unenforced silently.
        expect(matched, `${id} is listed pending but its scope now matches`).toHaveLength(0);
        return;
      }

      expect(matched.length, `${id} scans nothing — it cannot fail`).toBeGreaterThan(0);
    },
  );

  it("every MODE_OWNERS row names an export escapes.ts actually has", () => {
    // The third way a rule comes to have nothing to be wrong about, after an
    // unmatchable pattern and a scope matching no files: an ownership row for a
    // name that does not exist. The lookup can never hit, so the row reports
    // compliance whatever the tree contains — which is exactly what these rows
    // did while `SYNC_UPDATE` was unwritten (A03 §2).
    const OWNER_PENDING: Record<string, string> = {
      SCROLL_REGION: "waits on M-T6 — scroll-region acceleration is gated on measurement",
    };

    const { missing } = modeOwnersAreReal();

    for (const name of missing) {
      // The exemption is checked in the same direction as SS26's: when M-T6
      // lands and the export appears, this fails and the entry must go.
      expect(
        OWNER_PENDING[name],
        `MG20 owns ${name}, which escapes.ts does not export — that row cannot fire`,
      ).toBeDefined();
    }

    for (const name of Object.keys(OWNER_PENDING)) {
      expect(
        missing,
        `${name} is listed pending but escapes.ts now exports it`,
      ).toContain(name);
    }
  });

  it("the MODE_OWNERS existence check fires on a fabricated absent export", () => {
    // Fabricated the same way every other rule is: a tree in which the name is
    // genuinely gone, rather than a string built to fail the comparison.
    const withoutSync = modeOwnersAreReal(
      () => 'export const ALT_SCREEN = mode("a", "b");\nexport const CURSOR = mode("c", "d");\n',
    );

    expect(withoutSync.missing).toContain("SYNC_UPDATE");
    expect(withoutSync.missing).toContain("MOUSE");
    expect(withoutSync.exported).toEqual(["ALT_SCREEN", "CURSOR"]);
  });

  it("no scan's allow list exempts a path that does not exist", () => {
    // An allow entry pointing at a moved file silently widens nothing, but it
    // also documents an exemption that is no longer real — and the next reader
    // takes it as evidence the file is special.
    for (const scan of SCANS) {
      for (const allowed of scan.allow) {
        expect(
          files.some((f) => f === allowed || f.startsWith(allowed)),
          `${scan.id} allows ${allowed}, which is not in the tree`,
        ).toBe(true);
      }
    }
  });
});

/**
 * The third half, and the one neither of the others can reach.
 *
 * A fabricated violation proves a rule *can* fire; a scope check proves it has
 * something to fire *at*. Neither says anything about a rule that was written
 * down in A03 and never implemented — `checkSourceScans` iterates the rows it
 * has, so a missing row is not a rule that fails but a rule that is not there.
 * It appears in no report, and an unimplemented rule is indistinguishable from
 * a passing one in every report there is.
 *
 * That was SS3 for the whole life of the project: inventoried in A03, absent
 * from `source-scans.mjs`, and additionally scoped to a directory that was a
 * file. Two of A03 §2's four vacuity failures in one rule.
 *
 * So the inventory is asserted equal to what exists — implemented plus
 * explicitly pending. **A rule written down and never built fails on the commit
 * that writes it down**, which is the commit where someone still remembers what
 * it was for.
 *
 * **And it read `SS` rows only, for its whole life.** Adding an `MG` row to A03
 * and implementing nothing passed every gate — the check written to catch a rule
 * that cannot fire could not see two thirds of the inventory. That is the same
 * defect as a narrow scope (A03 §2, and the standing preference for a rule that
 * covers a family and names its exceptions over one whose pattern quietly
 * excludes what it never thought about).
 *
 * It now reads **every** rule family A03 tabulates, and the families divide in
 * two:
 *
 *   - `SS` and `MG` are implemented as data in `tools/enforce/`, so "implemented"
 *     is a set membership and the equality is exact in both directions.
 *   - `EX`, `TL`, `CP` and `SP` name a *test id* in their last column rather than
 *     a rule module — `C09 T2.6`, `B04 B4.3`. Asserting those exist is a
 *     different mechanism against a different corpus, and it is not built. Named
 *     here as an unchecked family rather than left to look covered, which is the
 *     whole subject of this file.
 */
describe("A03 commitment 14b — the inventory equals what is implemented", () => {
  /**
   * Rules inventoried in A03 and deliberately not implemented yet, each with
   * the component that will make them implementable. An entry here is a rule
   * that is NOT being enforced, and saying so is the point.
   */
  /**
   * A pending entry is one of two things, and conflating them is what let MG14
   * sit unenforced for two components.
   *
   * A **string** is a reason that will never come true on its own — a fold, or
   * a condition no component's arrival satisfies. Nothing can expire it; A03 §2
   * says the fold is the only exit and something has to take it deliberately.
   *
   * A **`waitsOn`** names a component, and it is a claim the suite can check:
   * when that component lands, the rule is implementable and the entry is a
   * lie. That is the other half of A03 §2's class — a reason false when it was
   * written versus a reason that has since become false — and only the second
   * half can be caught mechanically. It is, below.
   */
  type Pending = string | Readonly<{ waitsOn: string; why: string }>;

  const PENDING_RULES: Record<string, Pending> = {
    SS5: "folded into SS4's scope — SS4 covers all of src/viewport/, so a second rule with the same pattern and a contained scope could never fire on anything SS4 misses. The SS12-into-SS11 precedent",
    // **Folded, and it is the fourth instance of the class and the first the
    // suite caught rather than a person.** SS6 forbids clock reads in `input/`;
    // SS1 forbids them across all of `src/` with one named exception, so SS6
    // could never fire on anything SS1 misses — the SS5-into-SS4,
    // SS12-into-SS11 and SS7-into-SS1 precedent. Its reason was false when it
    // was written and additionally named a directory that never existed: C16
    // implements into `router/`.
    //
    // What is new is how it surfaced. It sat pending on C16, C16 landed, and
    // nothing looked — until `waitsOn` made "the blocker has arrived" a thing
    // the suite can ask.
    SS6:
      "folded into SS1's scope — SS1 bans clock reads across all of src/ with " +
      "one named exception, so a rule scoped to `input/` could never fire on " +
      "anything SS1 misses. Fourth instance of the pending-entry-false-at-birth " +
      "class, and the first found by the `waitsOn` check rather than by hand",
    SS7:
      "folded into SS1's scope — SS1 bans clock reads across all of src/ with one " +
      "named exception, so a rule scoped to `editor/` could never fire on anything " +
      "SS1 misses. The SS5-into-SS4 and SS12-into-SS11 precedent, and the third " +
      "instance of A03 §2's pending-entry-false-at-birth class: C17's arrival is " +
      "what made it visible, because the component said to be blocking it is the " +
      "one that proves it could not fire",
    SS8:
      "folded into SS1's scope — SS1 bans clock reads across all of src/ with one " +
      "named exception, so a rule scoped to `completion/` could never fire on " +
      "anything SS1 misses. The fourth instance of the fold, and the third whose " +
      "blocking component turned out to be the proof it could not fire: C19's " +
      "arrival is what made it visible",
    SS12: "C10 — folded into SS11's scope for now",
    SS18: "C10 — needs the block-producing module list",

    // **SS29 is gone, folded into MG23.** It waited on C23, C23 landed, and the
    // rule did not survive being written: as a source scan over `src/shell/` its
    // only in-scope file is C23 itself, which reaches four stores by design and
    // is the component the rule exists to permit. The sentence C23 §2 argues is
    // about L1–L3, where reaching a store means importing one — a module-graph
    // question. Fourth instance of the pending-entry-covered-at-birth class,
    // after SS5, SS6, SS7 and SS8, and the second found by `waitsOn`.

    // SS31, SS32 and SS38 were here, each saying "implemented in
    // dependencies.mjs, not source-scans.mjs" — which is not a pending rule but
    // an implemented one filed in the wrong drawer, and it survived because the
    // staleness check compared against `SCANS` alone. Three entries claiming a
    // rule was off while it was on. They are gone; `implemented` covers all
    // three modules.

    // MG2 is the one genuinely unimplemented rule in the family: no cycle within
    // a layer. Nothing blocks it — it is implementable against the tree today —
    // and it is listed here rather than quietly omitted because that is the
    // difference between a rule not yet built and a rule nobody remembers.
    MG2: "nothing — implementable today, and the general form of MG13/MG18",

    // The rest of the MG family was here, waiting on the components whose
    // directories they scope to. MG18 was the last of them and it went with
    // C20: `src/interaction/history/` exists, so the rule has something to
    // match and the entry became the lie this check exists to catch.
  };

  /**
   * Rules A03 inventories that are enforced by a **test** rather than by a row in
   * `tools/enforce/`, each pointing at the file that carries it. A03's own
   * "Declared" column already names these — `C04 T2.9`, `C09 T2.11` — so the
   * mapping is read off the document rather than invented here.
   *
   * **This is a third category, and the distinction is load-bearing.** A03 §2
   * opens by saying the first four kinds are build gates "because a layer
   * violation merged and fixed later has already had time to be depended upon".
   * A rule enforced in the corpus tier is enforced — but not at the gate, and a
   * table that records only "implemented" cannot say which.
   *
   * Writing this list is what settled a question the plan got wrong: MG4, MG5,
   * MG7, MG8 and MG9 looked unimplemented from the enforce side and are not. They
   * had been enforced since their components landed, in the tier their spec row
   * names.
   */
  const TEST_ENFORCED: Record<string, string> = {
    MG4: "test/contract/view-model.test.ts",
    MG5: "test/contract/manifest.test.ts",
    MG7: "test/contract/adapters.test.ts",
    MG8: "test/contract/fixtures.test.ts",
    MG9: "test/contract/blocks.test.ts",
  };

  /**
   * The families implemented as data in `tools/enforce/`, and therefore the ones
   * this equality can be exact about.
   *
   * **`SP` joined them, and it is the third widening of this pattern.** The
   * header records `EX`, `TL`, `CP` and `SP` as families the equality could not
   * speak for, because their rows name a test id rather than a rule module. That
   * was true of `SP` only until SP2 and SP3 landed: the family is implemented as
   * functions in `commitments.mjs`, which exports `SPEC_RULES` for exactly this —
   * so adding an `SP4` row to A03 and building nothing now fails here, on the
   * commit that writes it down. `EX`, `TL` and `CP` remain outside, and remain
   * named rather than left looking covered.
   */
  const RULE_FAMILIES = /^\|\s*((?:SS|MG|SP)\d+)\s*\|/;

  /** The ids A03 declares, read from the document rather than restated here. */
  function inventoriedRules(): readonly string[] {
    const doc = readFileSync("docs/architecture/A03_enforcement_suite.md", "utf8");
    const ids = new Set<string>();
    for (const line of doc.split("\n")) {
      const match = RULE_FAMILIES.exec(line);
      if (match?.[1] !== undefined) ids.add(match[1]);
    }
    return [...ids].sort();
  }

  /**
   * Every family that is implemented as data, in one set. `implemented` is the
   * module-level list the fabrication check already uses, so the two cannot drift
   * apart: a rule added to one is a rule this sees.
   */
  const implementedIds = new Set(implemented);

  it("A03 declares no rule id twice", () => {
    // **The check that could not see a duplicate, and it was found by making one.**
    // Every assertion in this block compares *sets*, so two rows carrying one id
    // collapse into a single member: a new ambient-read rule written as SS41 —
    // which C21 already holds — passed the missing-rule check, because the id it
    // was looking for was present for an entirely different reason. An
    // inventoried, unimplemented rule reported compliance, which is the failure
    // A03 §2 opens with, reached through the mechanism built to prevent it.
    //
    // Reads the rows rather than the id set, deliberately: the set is what cannot
    // see this.
    const doc = readFileSync("docs/architecture/A03_enforcement_suite.md", "utf8");
    const seen = new Map<string, number>();
    for (const line of doc.split("\n")) {
      const match = RULE_FAMILIES.exec(line);
      if (match?.[1] === undefined) continue;
      seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
    }
    const twice = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`);

    expect(
      twice,
      `${twice.join(", ")} — two rows with one id are one member of every set ` +
        `comparison below, so the second rule is invisible to all of them`,
    ).toEqual([]);
  });

  it("every rule A03 inventories is implemented, test-enforced or explicitly pending", () => {
    const missing = inventoriedRules().filter(
      (id) =>
        !implementedIds.has(id) &&
        TEST_ENFORCED[id] === undefined &&
        PENDING_RULES[id] === undefined,
    );

    expect(
      missing,
      `A03 inventories ${missing.join(", ")} and nothing implements them. ` +
        `An unimplemented rule reports compliance exactly like a satisfied one — ` +
        `implement it, add it to TEST_ENFORCED with the test that carries it, or ` +
        `add it to PENDING_RULES with its blocking component.`,
    ).toEqual([]);
  });

  it.each(Object.entries(TEST_ENFORCED))(
    "%s's test-enforced claim names it, in %s",
    (rule, file) => {
      // The claim, made checkable. "Enforced by a test somewhere" is the same
      // shape of assertion as a rule with no fabricated violation: believed,
      // never demonstrated. Requiring the rule id in the test's own name means
      // the link is discoverable from either end, and it fails if the test is
      // renamed away or the file is split.
      expect(readFileSync(file, "utf8")).toContain(rule);
    },
  );

  it("no pending rule waits on a component that has already landed", () => {
    // **The half of A03 §2's pending class that a machine can see.** A reason
    // false at birth cannot expire and needs the fold; a reason that *becomes*
    // false has a moment, and this is it. Nothing was looking at that moment:
    // MG14 waited on C16, C16 landed, C17 landed after it, and the rule sat
    // unenforced through both while reporting exactly like a satisfied one.
    //
    // On its first run it found MG14 and SS6 — one rule to build and one to
    // fold, both stranded by the same commit two components back.
    const landed: string[] = [];
    for (const [id, entry] of Object.entries(PENDING_RULES)) {
      if (typeof entry === "string") continue;
      const path = COMPONENT_SOURCES[entry.waitsOn];
      if (path !== undefined && defaultIsImplemented(path)) {
        landed.push(`${id} waits on ${entry.waitsOn}, which is built (${path})`);
      }
    }

    expect(
      landed,
      `${landed.join("; ")} — implement the rule, or fold it and say what it folds into. ` +
        `A pending entry whose blocker has arrived is indistinguishable from an enforced rule.`,
    ).toEqual([]);
  });

  it("nothing listed pending has quietly been implemented", () => {
    // The other direction, for the same reason the scope list checks its own
    // exemptions: a pending entry that outlives its reason is a rule everyone
    // believes is unenforced, and nobody checks the ones they think are off.
    const stale = Object.keys(PENDING_RULES).filter(
      (id) => implementedIds.has(id) || TEST_ENFORCED[id] !== undefined,
    );

    expect(stale, `${stale.join(", ")} is listed pending but implemented`).toEqual([]);
  });

  it("nothing is listed pending that A03 does not inventory", () => {
    // The fourth direction, and it exists because writing this check found the
    // other three had a hole each. A pending entry for a rule no table declares
    // is a rule that will never be implemented and never be missed: the missing
    // check below cannot see it (there is no row), and the staleness check above
    // cannot either (it is not implemented). It is a rule that exists only in a
    // list of things not being done.
    const inventoried = new Set(inventoriedRules());
    const phantom = [...Object.keys(PENDING_RULES), ...Object.keys(TEST_ENFORCED)].filter(
      (id) => !inventoried.has(id),
    );

    expect(phantom, `${phantom.join(", ")} is listed pending but A03 has no row`).toEqual([]);
  });

  /**
   * The same equality, one column over — and the hole it closes was found by
   * being told to look for it.
   *
   * 14b compares rule **ids**. A row can therefore name a scope the code does
   * not have and omit one it does, forever, in both directions and silently:
   * SS24's row said `table/`, `plot/`, `parser/` while the code said `table/`,
   * `plot/`, `patch/` — one scope inventoried and unimplemented, one
   * implemented and uninventoried, and every set comparison in this file
   * satisfied by the id alone.
   *
   * **Both directions matter, and they fail differently.** A path in the row
   * that the code does not have is a rule the reader believes covers ground it
   * does not. A path in the code that the row does not have is worse when it is
   * an *allow* entry: a granted exemption that no document records, which is
   * indistinguishable from a rule that has no exemptions at all.
   *
   * On its first run it fired on eight rows besides SS24. Every one was the row
   * being out of date rather than the code being wrong, which is the direction
   * this was expected to find and is not the direction it was written for.
   *
   * The reading rules, because the column is prose and not a data structure:
   *
   *   - A backticked token containing `/` or ending `.ts` is a path.
   *   - A component id resolves through `COMPONENT_SOURCES` — SS1's "outside
   *     C22" names `src/shell/session.ts` as surely as writing the path would.
   *   - "anywhere" or "outside" in the cell names the whole tree, so a `src/`
   *     scope is accounted for.
   *
   * Matching is by suffix, so a row may write `plot/` where the code writes
   * `src/presentation/plot/`. A row is free to be shorter; it is not free to be
   * about a different directory.
   */
  it("every SS row's scope column names the paths the rule actually scans and allows", () => {
    const doc = readFileSync("docs/architecture/A03_enforcement_suite.md", "utf8");
    const cells = new Map<string, string>();
    for (const line of doc.split("\n")) {
      const row = /^\|\s*(SS\d+)\s*\|[^|]*\|([^|]*)\|/.exec(line);
      if (row?.[1] !== undefined && row[2] !== undefined) cells.set(row[1], row[2].trim());
    }

    const sources: Record<string, string> = COMPONENT_SOURCES;
    const problems: string[] = [];

    for (const scan of SCANS) {
      const cell = cells.get(scan.id);
      if (cell === undefined) continue; // 14b already reports a rule with no row

      const scopes = Array.isArray(scan.scope) ? scan.scope : [scan.scope];
      const code = [...scopes, ...scan.allow];

      const quoted = [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
      const prose = quoted.filter((t) => t.includes("/") || t.endsWith(".ts"));
      const named = [
        ...prose,
        ...[...cell.matchAll(/\bC\d\d\b/g)].map((m) => sources[m[0]] ?? ""),
        ...(/anywhere|outside/.test(cell) ? ["src/"] : []),
      ].filter((p) => p !== "");

      for (const p of prose) {
        if (!code.some((c) => c.endsWith(p))) {
          problems.push(`${scan.id}: the row names ${p}, which the rule neither scans nor allows`);
        }
      }
      for (const c of code) {
        if (!named.some((p) => c.endsWith(p))) {
          problems.push(`${scan.id}: the rule reaches ${c}, which the row does not name`);
        }
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("every implemented rule is inventoried in A03", () => {
    // And the last direction: a rule in the code with no row in A03 is a rule
    // no one specified, which is how the suite grows past what it can justify.
    const inventoried = new Set(inventoriedRules());
    const unspecified = implemented.filter((id) => !inventoried.has(id));

    expect(unspecified, `${unspecified.join(", ")} is enforced but not inventoried`).toEqual([]);
  });
});
