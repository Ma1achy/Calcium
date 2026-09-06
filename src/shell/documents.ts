/**
 * Composing the documents C23 appends.
 *
 * **Every route ends in a `ViewDocument` and there is no path that ends in
 * nothing** (C23 §1, C23 I1). So the interesting thing here is not the blocks — it is
 * `meta`, which C04 I13 makes non-optional in every field that matters and which
 * C23 is the only component able to fill: it is the only one that appends, so it
 * is the only one that knows the provenance (C23 §Setting origin, C23 I22).
 *
 * `origin` has **no default in this file on purpose.** Every caller passes one.
 * A default here would be the "provenance that can be absent" C23 §3a rejects —
 * it would compile, it would be right most of the time, and the one path that
 * forgot would be indistinguishable from the ones that meant it.
 */

import { block, document } from "../data/viewmodel/index.js";
import { usageBlocks } from "../data/adapters/index.js";
import { elapsed, glyphs, spinnerFrames } from "../presentation/blocks/index.js";
import type { AskOptions, Choice } from "./local/registry.js";
import { defaulted } from "./builders/seq.js";
import type { ToolDef } from "../data/manifest/index.js";
import type {
  LocalDocument,
  Block,
  DocumentMeta,
  DocumentStatus,
  ErrorLike,
  ViewDocument,
} from "../data/viewmodel/index.js";

/** C04 names these inline on `DocumentMeta`; C23 needs them by name. */
type Origin = DocumentMeta["origin"];
type Transport = DocumentMeta["transport"];

let n = 0;
/** Block ids are addressed by `ViewPatch` (C04 I14), so they must be unique. */
export function blockId(prefix: string): string {
  n += 1;
  return `${prefix}-${String(n)}`;
}

/**
 * **No `resultId`.** `DocumentMeta.resultId` is producer-owned (C04 §2, C07
 * I13): the adapter registry writes it on the subprocess route and
 * `completeLocal` below passes a handler's through on the local route. This
 * spec's only caller is `compose`, whose three callers — `execution.ts` twice
 * and `local/handlers.ts` — never passed one, so the member was a shell-side
 * writer for a producer-side field with zero writes. Narrowed on F85's
 * argument rather than documented: a field that can be supplied and never is
 * reads as a route that exists. 2026-09-03.
 */
export type MetaSpec = Readonly<{
  origin: Origin;
  verb?: string | null;
  adapter?: string;
  exitCode?: number;
  durationMs?: number;
  truncated?: boolean;
  argv?: readonly string[];
  stderr?: string;
  transport?: Transport;
}>;

/**
 * Defaults for everything except `origin`, which is the field this exists to
 * make unforgettable.
 */
export function meta(spec: MetaSpec): ViewDocument["meta"] {
  return {
    verb: spec.verb ?? null,
    adapter: spec.adapter ?? "none",
    exitCode: spec.exitCode ?? 0,
    durationMs: spec.durationMs ?? 0,
    truncated: spec.truncated ?? false,
    argv: spec.argv ?? [],
    stderr: spec.stderr ?? "",
    transport: spec.transport ?? "local",
    origin: spec.origin,
  };
}

export type DocSpec = Readonly<{
  command: string;
  blocks: readonly Block[];
  status?: DocumentStatus;
  error?: ErrorLike;
  /**
   * **Optional since F13**, because the local route no longer supplies one:
   * `runLocal` fills every field of a local document's `meta` itself, so a
   * handler passing `origin` and `transport` here was inventing two values the
   * shell already holds. Callers that append directly — the refusal notice, the
   * error arms — still pass one, and the default below is what an empty spec
   * means rather than a value anyone chose.
   */
  meta?: MetaSpec;
}>;

export function compose(spec: DocSpec): ViewDocument {
  return document({
    schema: "tui.view/1",
    command: spec.command,
    status: spec.status ?? "ok",
    blocks: spec.blocks,
    ...(spec.error === undefined ? {} : { error: spec.error }),
    meta: meta(spec.meta ?? { origin: "user" }),
  });
}

/**
 * A local handler's answer, completed — which is what makes it a document.
 *
 * **The local route's `authoritativeMeta`** (F13). C07's registry fills seven
 * `meta` fields on the adapter route; nothing filled them here, so four handlers
 * in the reference app each carried an eleven-line helper inventing them. This
 * is that fill, named and exported for the same reason `createAdapterRegistry`
 * is: an app asserting *"every document this app produces is valid"* has no
 * other way to obtain one, and a producer the framework can test and a consumer
 * cannot is a producer whose app-side tests assert against something the user
 * never sees (C24 I19's `contextAt` argument, third instance).
 *
 * `exitCode` is derived from `status` rather than taken — the two agreed at
 * every one of the reference app's eight sites, so carrying both was two records
 * of one fact. `stderr` is empty because a local route has no far side; the
 * failure message belongs in `error.message`, where it already is. F101.
 */
export function completeLocal(
  produced: LocalDocument,
  where: Readonly<{ command: string; verb: string | null; argv: readonly string[]; durationMs: number }>,
): ViewDocument {
  return {
    ...produced,
    command: where.command,
    meta: {
      verb: where.verb,
      adapter: produced.meta?.adapter ?? "local",
      exitCode: produced.status === "error" ? 1 : 0,
      durationMs: where.durationMs,
      truncated: produced.meta?.truncated ?? false,
      ...(produced.meta?.resultId === undefined ? {} : { resultId: produced.meta.resultId }),
      argv: where.argv,
      stderr: "",
      transport: "local",
      origin: "user",
    },
  };
}

/**
 * The glyph each toned notice carries.
 *
 * **C04 I6 requires one for `warn` and `error`** — colour alone survives neither
 * 1-bit nor a colour-blind reader (A01 D29) — and `block()` throws without it. A
 * table rather than a per-call argument, because every call site would otherwise
 * choose, and the one that forgot would throw at *construction*: not a wrong
 * glyph, no document at all.
 *
 * That is how this was found. Every containment path in C23 built a `warn` or
 * `error` notice with no glyph, so every one threw inside `appendAndCommit` and
 * produced no entry — C23 I1 says every submission produces exactly one outcome,
 * and the paths that exist to guarantee it produced none.
 */
const GLYPH_OF = Object.freeze({
  muted: undefined,
  info: "info",
  warn: "warn",
  error: "error",
} as const);

/**
 * A single-block notice. The shape most containment paths end in.
 *
 * **`status: "error"` carries its own `error`, and it did not.** C04 I3 requires
 * the field in both directions — present iff the status is `"error"` — so every
 * notice composed with that status was an invalid document, and `transcript.append`
 * threw on all of them. Two shipped call sites: a handoff killed by a signal and
 * a handoff exiting non-zero. **Neither produced an entry.** `vim`, exiting 1,
 * left a transcript that said nothing had happened.
 *
 * That is the same shape as the glyph defect above and as F15 itself, and it was
 * found by the fabricated row for §5a's ladder — the fault notice was written
 * with this status and could not be appended either. Filling the field here
 * rather than at the two call sites is the class rather than the instances: the
 * message is the notice's own text, which is what an `ErrorLike` carrying
 * anything else would be paraphrasing.
 */
export function noticeDoc(
  command: string,
  text: string,
  tone: "muted" | "warn" | "error" | "info",
  metaSpec: MetaSpec,
  status: DocumentStatus = "ok",
): ViewDocument {
  // **`muted` takes the continuation mark, and the condition is the command**
  // (C09 §4). Eligibility is a property of the *entry*, not of the block: the
  // mark says *this line belongs to the one above it*, and `commandRows`
  // returns `[]` for `command: ""`, so with no command line the mark would
  // subordinate this notice to whatever entry happens to precede it — a
  // different submission.
  //
  // **Written as the condition rather than at the call sites**, which is the
  // same argument the table above makes. Four muted notices reach this today —
  // `queued behind`, `X finished`, `X opened a view`, a builtin's result — and
  // they were found by stating the shape and looking, not by memory: all four
  // are the entry's only block, saying what the *entry* did rather than what
  // the far side emitted. A fifth arriving with `command: ""` gets the right
  // answer without anyone deciding.
  //
  // F15's fault notice is exactly that fifth case and it is already here: it
  // is `error`, so the tone alone would have spared it — but only by accident,
  // and its own `command` is `""`.
  const glyph =
    tone === "muted" ? (command === "" ? undefined : "continuation") : GLYPH_OF[tone];
  return compose({
    command,
    status,
    ...(status === "error" ? { error: { message: text } } : {}),
    blocks: [
      block({
        kind: "notice",
        id: blockId("notice"),
        tone,
        text,
        ...(glyph === undefined ? {} : { glyph }),
      }),
    ],
    meta: metaSpec,
  });
}

/**
 * A tool call — `AGENT_TUI_DESIGN.md` §9c, as a composition and not a kind.
 *
 * **A header, a body, and the residue row the body already has.** The header is
 * a `notice` carrying `step` — *⬤ name(args) · elapsed · outcome* — and the
 * body is either the settled result under `continuation` (`⎿`, the same slot
 * `noticeDoc`'s muted notices take) or the streamed output in a `scroll` that
 * opens at its tail (C04 I97). *+N more* is **not** a fourth count string: a
 * folded body is a `collapsed` scroll, whose residue row *⋯ +N more* (C04 I104)
 * is that line (C04 I98), and `⏎` on it toggles the fold through the `expand`
 * action every one of its elements carries.
 *
 * **The elapsed figure goes through `elapsed()`, which is the counter's one
 * consumer outside its driver.** `refresh.ts` ticks `elapsedMs` into a live
 * part's `status` box once a second and asks `elapsedNeeded` whether the figure
 * moved; nothing else in `src/` formatted a duration. A caller re-composing this
 * header on a tick has the same guard available — compare `elapsed(a)` with
 * `elapsed(b)` before patching — and the tick is C23's, driven from the pending
 * entry through `RefreshDriver.readout` (C23 I53, I54): `execution.ts` appends
 * this document at step 3 and re-composes the header block by `id` once a second.
 */
export type ToolCallSpec = Readonly<{
  name: string;
  args: string;
  /**
   * The header block's id, so a readout can replace it in place (C23 I54).
   * Generated when absent — a caller that never re-composes need not choose one.
   */
  id?: string;
  /** Since dispatch, in milliseconds. Below one second no figure is drawn. */
  elapsedMs?: number;
  /** The one-word verdict beside the elapsed figure — `exit 0`, `47 passed`. */
  outcome?: string;
  /** The settled result, one line, under `⎿`. */
  result?: string;
  /** Streamed output, in a follow scroll of `height` rows (default 6). */
  output?: readonly Block[];
  height?: number;
  /** Present, either value, declares the fold (C04 I98). */
  collapsed?: boolean;
  /**
   * The call has settled (C23 I59). Implied by a non-empty `outcome`; stated
   * when the outcome is no word at all — a settled head with no count and no
   * failure reads `verb · duration`, and without this the composer would draw
   * the spinner a settled call no longer has.
   */
  settled?: boolean;
  /** Awaiting a decision (C23 I60): the duration slot reads `⠋ waiting`, and no figure. */
  waiting?: boolean;
  /**
   * The call's children, in start order and never reordered (C23 I62). Each
   * lays out as a nested card inside this one's body (C22 I89); the parent's
   * outcome is derived from them by `rollUp` unless stated.
   */
  children?: readonly ToolCallSpec[];
}>;

/** The capabilities the composer reads: the separator slot and the spinner tier (F828, C09 I49, I58). */
type Caps = Parameters<typeof glyphs>[0];

/** The answer that denies (C23 I60); every other key approves. */
export const DENY_KEY = "n";

/** `verb(args)`, or the bare verb (C23 §3, F795). */
function invocation(call: Pick<ToolCallSpec, "name" | "args">): string {
  // **A bare verb has no parentheses**: `⬤ ps`, not `⬤ ps()`. The parentheses
  // say *these are the arguments*, and with none they say it about nothing. One
  // grammar for the shell's card and the agent's, decided here because both
  // compose their header through this function.
  return call.args === "" ? call.name : `${call.name}(${call.args})`;
}

/** Whether a call's head is a settled one: said so, or carrying a word (C23 I59). */
function isSettled(call: ToolCallSpec): boolean {
  return call.settled === true || (call.outcome !== undefined && call.outcome !== "");
}

/**
 * The duration slot while the call runs (C23 I58): the spinner alone below one
 * second, `⠋ Ns` from one — the frame indexed by the readout's tick, so the
 * cadence is I53's and there is no second timer. The set is C09's default and
 * degrades through `spinnerFrames` at both arms (§8f P9).
 */
function spin(caps: Caps, tick: number): string {
  const frames = spinnerFrames(caps);
  return frames[tick % frames.length] ?? ""; // cells-ok — a frame count
}

/**
 * The header line, without its glyph. Exported for the row that asserts it.
 *
 * **`verb · args · duration · outcome`, joined with the slot** (C09 I49, F828).
 * The separator was a literal `·` — non-ASCII at the ASCII arm and two cells at
 * wide — composed with no capabilities in hand; it is `glyphs(caps).separator`
 * now, which is why every composer function here takes `caps`.
 *
 * The duration slot is the spinner's while the call runs and the figure's once
 * it settles (C23 I58); `waiting` puts the spinner beside the word and no figure
 * (I60). The outcome is the call's own word or count, or the children's roll-up
 * (I62) — never `ok` (I59).
 */
export function toolCallHeader(call: ToolCallSpec, caps: Caps, tick = 0): string {
  const sep = ` ${glyphs(caps).separator} `;
  const parts = [invocation(call)];
  const since = call.elapsedMs === undefined ? "" : elapsed(call.elapsedMs);
  if (call.waiting === true) {
    parts.push(`${spin(caps, tick)} waiting`);
  } else if (!isSettled(call)) {
    parts.push(since === "" ? spin(caps, tick) : `${spin(caps, tick)} ${since}`);
  } else if (since !== "") {
    parts.push(since);
  }
  const outcome =
    call.outcome !== undefined && call.outcome !== ""
      ? [call.outcome]
      : call.children !== undefined && call.children.length > 0 // cells-ok — a child count
        ? rollUp(call.children)
        : [];
  parts.push(...outcome);
  return parts.join(sep);
}

/**
 * The head block (C09 I46, I47): a `step` notice carrying the header, its
 * argument marked `elide` so the fitter shortens it before the verb, duration or
 * outcome, and the call's id so a readout can replace it in place (C23 I54).
 */
export function callHead(call: ToolCallSpec, caps: Caps, tick = 0, foldTarget?: string): Block {
  const text = toolCallHeader(call, caps, tick);
  const from = call.name.length + 1; // cells-ok — a code-unit offset into the text
  const spans = call.args === "" ? [] : [{ from, to: from + call.args.length, elide: true }]; // cells-ok — code-unit offsets
  const base = { kind: "notice" as const, id: call.id ?? blockId("step"), tone: "info" as const, glyph: "step" as const, text };
  const marked = spans.length === 0 ? base : { ...base, spans }; // cells-ok — a span count
  // **`⏎` on the head folds the body** (C09 I47, C26 §5): the action is the
  // block's `expand` aimed at the body's scroll, when there is one. Re-run
  // stays on `⇧⏎`; a head with no scroll is an element with no action.
  // The label is what the footer shows for the element (C16 I19); the key name stays out of the row.
  return block(foldTarget === undefined ? marked : { ...marked, action: { kind: "expand" as const, label: "expand", target: foldTarget } });
}

/** The words a settled child can carry that count against the parent (C23 I62). */
const FAILURE_WORDS: ReadonlySet<string> = new Set(["failed", "denied", "cancelled", "truncated"]);

/**
 * A parent's outcome, derived from its children on every settlement (C23 I62).
 *
 * Same-unit counts sum — three searches of `41 matches`, `12 matches` and
 * `29 matches` roll up to `82 matches`; otherwise `k of N`, with one part per
 * failure word — `2 of 3 · 1 failed`, `0 of 3 · 3 cancelled` — and the parent
 * never adopts a child's message. Returned as parts, because the separator
 * between them is the slot's and only `toolCallHeader` holds the capabilities.
 */
export function rollUp(children: readonly ToolCallSpec[]): readonly string[] {
  const total = children.length; // cells-ok — a child count
  const settled = children.filter(isSettled);
  const failures = new Map<string, number>();
  const counts: { n: number; unit: string }[] = [];
  let succeeded = 0;
  for (const child of settled) {
    const outcome = child.outcome ?? "";
    const word = /^exit [1-9]/u.test(outcome) ? "failed" : FAILURE_WORDS.has(outcome) ? outcome : null;
    if (word !== null) {
      failures.set(word, (failures.get(word) ?? 0) + 1);
      continue;
    }
    succeeded += 1;
    const count = /^(\d+) (\w+)$/u.exec(outcome);
    if (count !== null) counts.push({ n: Number(count[1]), unit: count[2] ?? "" });
  }
  const oneUnit = counts.length === total && counts.every((c) => c.unit === counts[0]?.unit); // cells-ok — counts
  if (settled.length === total && failures.size === 0 && oneUnit && total > 0) { // cells-ok — counts
    return [`${String(counts.reduce((n, c) => n + c.n, 0))} ${counts[0]?.unit ?? ""}`];
  }
  const parts = [`${String(succeeded)} of ${String(total)}`];
  for (const [word, n] of failures) parts.push(`${String(n)} ${word}`);
  return parts;
}

/**
 * A call's failure or retry, as the `status` kind (C23 I61, C09 §3a): the box
 * under a kept head, composed here and nowhere else in `src/shell/` — A03 SS56,
 * widened to the builder call, is the gate. Six rows by default, read from a
 * frame as `errorDoc`'s is.
 */
export function callStatus(
  state: "error" | "loading" | "retrying",
  message: string,
  opts: Readonly<{ id?: string; height?: number; retryInMs?: number; attempt?: number; elapsedMs?: number }> = {},
): Block {
  return block({
    kind: "status",
    id: opts.id ?? blockId("status"),
    state,
    message,
    height: opts.height ?? 6,
    ...(opts.retryInMs === undefined ? {} : { retryInMs: opts.retryInMs }),
    ...(opts.attempt === undefined ? {} : { attempt: opts.attempt }),
    ...(opts.elapsedMs === undefined ? {} : { elapsedMs: opts.elapsedMs }),
  });
}

/**
 * The family's `warn` shape, byte for byte with `builders/index.ts`'s
 * `noticeOf("warn", …)`: tone `warn`, the tone's default glyph, no gap, and the
 * gap recorded as defaulted. **Built here rather than through `b`** because the
 * builders import this file for `blockId`, and a composer importing the
 * builders would close a cycle inside L4 — A02 §1's one rule about sideways
 * edges. `notice-family.test.ts` holds the bytes the builder draws and this is
 * asserted against them.
 */
function warnBlock(text: string, id: string): Block {
  const built = block({ kind: "notice", id, tone: "warn", glyph: "warn", text });
  defaulted(built);
  return built;
}

/**
 * The shell's own warnings, composed in one place (C23 I61, F827): a usage line,
 * a theme's caveat, a `/debug` miss. The value of the function is that SS56 has
 * one file to allow.
 */
export function warnNotice(text: string, id: string): Block {
  return warnBlock(text, id);
}

/** A refusal patched into the entry acted on (C23 I18): a warning that names the command to run instead. */
export function refusalNotice(text: string, id: string): Block {
  return warnBlock(text, id);
}

/** The confirm layer's question (C15 §2a): the one warn notice the host draws. */
export function questionNotice(text: string, id: string): Block {
  return warnBlock(text, id);
}

/** A document view's rows past the screen (C22 §6h): the count, and why `n`/`p` cannot reach them. */
export function hiddenRowsNotice(hidden: number, id: string): Block {
  return warnBlock(
    `${String(hidden)} more rows — this block is taller than the screen, and n/p move by block so they cannot reach them`,
    id,
  );
}

/** The two answers every approval offers (C23 I60); a caller may widen them — `always allow` is a row like any other. */
const APPROVAL_CHOICES: readonly Choice[] = Object.freeze([
  { key: "y", label: "allow", default: true },
  { key: DENY_KEY, label: "deny" },
]);

/**
 * The confirm layer's content for a call that needs a decision (C23 I60, C15
 * §2b): the invocation as the head reads it, the consequence if the caller
 * supplied one, and the choices as the host's own table. **Approval is a layer,
 * not a widget in the gutter** — nothing about it is a new interaction.
 */
export function approvalPrompt(
  call: Pick<ToolCallSpec, "name" | "args">,
  consequence?: string,
  choices: readonly Choice[] = APPROVAL_CHOICES,
): AskOptions {
  return {
    question: invocation(call),
    ...(consequence === undefined ? {} : { detail: warnNotice(consequence, "confirm-consequence") }),
    choices,
  };
}

/**
 * The verdict a settled document earns (C23 I59): **a count where one exists, a
 * word where none does, and never `ok`.**
 *
 * `exit N` for a far side's non-zero code — the adapter route's `meta.exitCode`
 * is the subprocess's, and the shell's own documents (`transport: "local"`)
 * derive their code from `status`, so for them the code is not a second fact.
 * `failed` for a document that is not `ok`. Then the count the document can
 * supply: a table's rows. And otherwise nothing — the head reads `verb ·
 * duration` and the tone carries the verdict, because `ok` was only ever the
 * placeholder for *no count*.
 */
export function outcomeOf(doc: ViewDocument): string {
  if (doc.meta.transport !== "local" && doc.meta.exitCode !== 0) return `exit ${String(doc.meta.exitCode)}`;
  if (doc.status !== "ok") return "failed";
  const table = doc.blocks.find((blk) => blk.kind === "table");
  if (table !== undefined && table.kind === "table") {
    const n = table.rows.length; // cells-ok — a row count
    return `${String(n)} ${n === 1 ? "row" : "rows"}`;
  }
  return "";
}

/**
 * A settled document composed with its card (C23 I55, §8g rows 10–12): the
 * `step` header — verb, elapsed, verdict — over the document's own blocks, which
 * become the body under the hook (C22 I83). The `settle(id, doc)` routes call
 * this so no route settles an entry that began as a card into a document
 * without one; the header keeps the card's id so the readout that drew the
 * running figure and the header that replaces it are one block.
 */
export function cardOver(doc: ViewDocument, call: ToolCallSpec, elapsedMs: number, caps: Caps): ViewDocument {
  const header = callHead({ ...call, elapsedMs, settled: true, outcome: outcomeOf(doc) }, caps);
  return { ...doc, blocks: [header, ...doc.blocks] };
}

/** The id of the body's scroll, if the body has one — the head's fold target. */
function foldTargetOf(body: readonly Block[]): string | undefined {
  return body.find((blk) => blk.kind === "scroll")?.id;
}

/** A call's body blocks: the settled result under `⎿`, or the streamed output in its follow scroll. */
function callBody(call: ToolCallSpec, collapsed?: boolean): Block[] {
  const blocks: Block[] = [];
  if (call.result !== undefined) {
    blocks.push(
      block({ kind: "notice", id: blockId("result"), tone: "muted", glyph: "continuation", text: call.result }),
    );
  }
  if (call.output !== undefined && call.output.length > 0) { // cells-ok — a block count
    const fold = collapsed ?? call.collapsed;
    blocks.push(
      block({
        kind: "scroll",
        id: blockId("output"),
        height: call.height ?? 6,
        follow: true,
        children: call.output,
        ...(fold === undefined ? {} : { collapsed: fold }),
      }),
    );
  }
  return blocks;
}

export function toolCallDoc(
  command: string,
  call: ToolCallSpec,
  metaSpec: MetaSpec,
  caps: Caps,
  status: DocumentStatus = "ok",
): ViewDocument {
  const header = toolCallHeader(call, caps);
  const body = callBody(call);
  const blocks: Block[] = [callHead(call, caps, 0, foldTargetOf(body))];
  // **The children, in start order, each a nested card** (C23 I62, C22 I89): a
  // `group` column whose first block is the child's head. A running child is
  // its head alone; a settled child's body is collapsed, so only the one a
  // reader opens takes rows. Never sorted — the order is the order they began.
  for (const child of call.children ?? []) {
    const childBody = isSettled(child) ? callBody(child, true) : [];
    const head = callHead({ ...child, id: child.id ?? blockId("child") }, caps, 0, foldTargetOf(childBody));
    blocks.push(block({ kind: "group", id: blockId("call"), direction: "column", children: [head, ...childBody] }));
  }
  blocks.push(...body);
  return compose({
    command,
    status,
    ...(status === "error" ? { error: { message: header } } : {}),
    blocks,
    meta: metaSpec,
  });
}

/**
 * `/verb --help` — what the verb takes, from the manifest (C05 I22, F92).
 *
 * **`usageBlocks` had one caller and it was `raw.exitCode === 2`**, so the only
 * way to see this document was to invoke the verb wrongly and let the far side
 * say so. The generator was right and the trigger was missing; this is the
 * trigger, and the generator is unchanged.
 *
 * `status: "ok"` because asking what a verb takes is not an error — the exit-2
 * route's document is a failure that happens to contain the same blocks.
 */
export function usageDoc(command: string, tool: ToolDef): ViewDocument {
  return compose({
    command,
    status: "ok",
    blocks: [...usageBlocks(tool, blockId("usage"))],
    meta: { origin: "user" },
  });
}

/**
 * An `ErrorLike` rendered as a document (§2's `error` route, §5 throughout).
 *
 * `remediation` becomes a second notice rather than being folded into the first:
 * it is the actionable half, and a reader scanning for what to do next should not
 * have to parse one sentence out of two.
 */
export function errorDoc(
  command: string,
  error: ErrorLike,
  metaSpec: MetaSpec,
): ViewDocument {
  const blocks: Block[] = [
    block({
      // **A `status`, which is the kind the framework has for this** (F406, C09
      // §3a). It was a `notice` at all twelve call sites — spawn, handoff,
      // transport, pipeline, a refused invocation — so a failed command in any
      // app rendered as a red line of text beside a kind that draws the figure,
      // and the kind drew it only when a *renderer* threw. §3a's own table has
      // always read `retrying — the far side failed … not a bug`; only `error`'s
      // one-line gloss was narrower than the kind, and twelve sites were written
      // around it.
      //
      // **`error`, not `retrying`**: nothing is coming. C23 I51 draws the same
      // distinction on the live path, and a `retrying` box with no countdown
      // draws a blank row where the spinner goes.
      //
      // **Six rows, read from a frame.** A realistic spawn message at 72 cells
      // truncates at 4, wraps to two rows and fits with one blank at 6, and
      // wastes padding at 8. `statusRowsFor` cannot be asked — this function has
      // no width and C04 I2 forbids one — so the number is a frame read like
      // C23's, and a very long message truncating is the stated cost.
      kind: "status",
      id: blockId("error"),
      state: "error",
      height: 6,
      // **The far side's own code, beside its own message** (F165). It was
      // parsed by `mapping.ts`, typed, frozen and rendered nowhere — and a code
      // is the half a reader can search for, where a sentence is the half they
      // can read. Prefixed rather than given a block of its own: it qualifies
      // the message and a second block would read as a second failure.
      message: error.code === undefined ? error.message : `${error.code}: ${error.message}`,
    }),
  ];
  // **Still a notice, and beneath the box rather than inside it** (F406). A
  // `status` carries one `message`, and folding the remediation into it would put
  // the one actionable line in competition with a message that already wraps to
  // two rows at a typical width. The box says what failed; this says what to do.
  if (error.remediation !== undefined) {
    blocks.push(
      block({
        kind: "notice",
        id: blockId("remediation"),
        tone: "info",
        glyph: "info",
        text: error.remediation,
      }),
    );
  }

  return compose({
    command,
    status: "error",
    blocks,
    error,
    meta: { exitCode: 1, ...metaSpec },
  });
}
