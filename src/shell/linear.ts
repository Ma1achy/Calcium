/**
 * C22 §6m — linear rendering: an append-only stream of semantic events
 * (§107, `R-ACC-001`, ruling 29).
 *
 * *The cell grid is a projection. It is not the interface.* This is the second
 * rendering of the same transcript: no frame, no alternate screen, no animation,
 * and never a rewrite of what was written — **only the input line edits in
 * place** (I119, I123). Every line is the node's own fields in a fixed order, no
 * glyph and no colour (ruling 29), and every line's content is a copy source,
 * never a painted string (§057, §107's *valueText, not the painted string*).
 *
 * Two halves, and the split is what makes the table testable: `linearEvents`
 * and `blockLines` are functions of a change and the transcript's state, and
 * `createLinearOutput` is the one place that writes — erasing the input line,
 * appending the events, redrawing it (I123).
 */
import { hasChildren, type Block, type ViewDocument } from "../data/viewmodel/index.js";
import { stripControl } from "../data/text.js";
import type { NavElement } from "../presentation/blocks/types.js";
import { semanticsOf, type SemanticNode } from "../presentation/blocks/semantics.js";
import { elapsed } from "../presentation/blocks/index.js";
import { cells } from "../presentation/text.js";
import { ERASE_LINE, cursorColumn } from "../terminal/escapes.js";
import { outcomeOf } from "./documents.js";

/** §107's three, and `none` is an event that is never written (I124). */
export type AnnounceLevel = "polite" | "assertive";

export type LinearEvent = Readonly<{ lines: readonly string[]; level: AnnounceLevel }>;

/** What the event function reads of an entry — C13's own fields, nothing painted. */
export type LinearEntry = Readonly<{ id: string; doc: ViewDocument; streaming: boolean; seq: number }>;

/** C13's change, by kind (§6m.2's first column). */
export type LinearChange =
  | Readonly<{ kind: "append" | "patch" | "settle"; id: string }>
  | Readonly<{ kind: "evict"; ids: readonly string[] }>
  | Readonly<{ kind: "clear" }>;

/** What a body is read through: C09's registry, at the width the elements are published at. */
export type BodyDeps = Readonly<{
  width: number;
  elementsOf: (block: Block, width: number) => readonly NavElement[];
  copyOf: (block: Block) => string | null;
}>;

/**
 * What the stream has already said (I120).
 *
 * **Facts, keyed by id**: a start, a completion and each body block are written
 * once, so a second `settle`, or a patch that replaces a block already read, says
 * nothing — *a repaint of the same fact does not say it twice*.
 */
type LinearState = {
  readonly said: Set<string>;
  /** The top-level block ids already read, per entry. */
  readonly read: Map<string, Set<string>>;
  /** The highest `seq` so far: *of M* (§6m.3 row 4). */
  highest: number;
};

export const linearState = (): LinearState => ({ said: new Set(), read: new Map(), highest: 0 });

/** One source line, as speech takes it: control-stripped, a tab two spaces. */
const clean = (line: string): string => stripControl(line).replaceAll("\t", "  ").trimEnd();

const sourceLines = (text: string | null): string[] =>
  text === null ? [] : text.split("\n").map(clean).filter((l) => l !== "");

/**
 * A block's lines (I121): `<role>[: <name>][ — <valueText>]`, then its source.
 *
 * **The source is the block's own copy** (C09 §7a — a row's copy and the
 * block's are one source at two sizes), because the block's size carries what
 * the elements drop: a table's header, a tree's indentation — and a choice's
 * option copies carry the radio glyph its block copy does not. A `figure` reads
 * its name and nothing else, until R-BLK-895's summary has a field (§6m.5). A
 * container reads its children in order. A source line equal to the name is not
 * written again: a notice's name *is* its text.
 */
export function blockLines(block: Block, deps: BodyDeps): string[] {
  const node: SemanticNode = semanticsOf(block, deps.width, deps.elementsOf);
  const name = clean(node.name);
  const value = node.valueText === undefined ? "" : clean(node.valueText);
  const head = `${node.role}${name === "" ? "" : `: ${name}`}${value === "" ? "" : ` — ${value}`}`;
  if (hasChildren(block)) return [head, ...block.children.flatMap((child) => blockLines(child, deps))];
  if (node.role === "figure") return [head];
  return [head, ...sourceLines(deps.copyOf(block)).filter((l) => l !== name)];
}

/** The head is the notice that carries a call's state (C23 I59, C09 I45). */
const headOf = (doc: ViewDocument): Block | undefined =>
  doc.blocks.find((b) => b.kind === "notice" && (b as { state?: unknown }).state !== undefined);

const stateOf = (doc: ViewDocument): string => {
  const head = headOf(doc) as { state?: string } | undefined;
  if (head?.state !== undefined && head.state !== "running") return head.state;
  return doc.status === "ok" ? "succeeded" : "failed";
};

/** `<state>[, <outcome>][, <duration>]` — the head's word, then what it counted, then how long. */
function verdict(doc: ViewDocument): string {
  const state = stateOf(doc);
  const outcome = outcomeOf(doc);
  const parts = [state];
  if (outcome !== "" && outcome !== state) parts.push(outcome);
  // `elapsed` is empty below a second, as the head's is — a fast call says no time.
  const took = elapsed(doc.meta.durationMs);
  if (took !== "") parts.push(took);
  return parts.join(", ");
}

const command = (doc: ViewDocument): string => clean(doc.command);

/** The body: every top-level block but the head, and the ids it read. */
function body(doc: ViewDocument, deps: BodyDeps, skip: ReadonlySet<string>): { lines: string[]; ids: string[] } {
  const head = headOf(doc);
  const blocks = doc.blocks.filter((b) => b !== head && !skip.has(b.id));
  return { lines: blocks.flatMap((b) => blockLines(b, deps)), ids: blocks.map((b) => b.id) };
}

const isLoud = (b: Block): boolean =>
  b.kind === "notice" && ((b as { tone?: string }).tone === "error" || (b as { tone?: string }).tone === "warn");

/**
 * §6m.2's table (I120, I124): the events one change writes, given the entry as
 * it now stands. Mutates `state` — the record of what has been said — and
 * nothing else.
 */
export function linearEvents(
  change: LinearChange,
  entryOf: (id: string) => LinearEntry | undefined,
  state: LinearState,
  deps: BodyDeps,
): LinearEvent[] {
  if (change.kind === "evict") return []; // the scrollback holds it
  if (change.kind === "clear") return [{ lines: ["transcript cleared"], level: "polite" }];
  const entry = entryOf(change.id);
  // Gone before it could be read — `/clear` between a start and its settle
  // (§6m.3 row 2): nothing can be said about it.
  if (entry === undefined) return [];
  state.highest = Math.max(state.highest, entry.seq);
  const n = String(entry.seq);
  const read = state.read.get(entry.id) ?? new Set<string>();
  state.read.set(entry.id, read);
  const out: LinearEvent[] = [];

  const start = `start:${entry.id}`;
  if (!state.said.has(start)) {
    state.said.add(start);
    if (entry.streaming) {
      out.push({ lines: [`entry ${n} of ${String(state.highest)}: ${command(entry.doc)} — running`], level: "polite" });
      return out;
    }
  }
  if (entry.streaming) return out; // the batch closes at settle

  const done = `done:${entry.id}`;
  if (!state.said.has(done)) {
    state.said.add(done);
    const { lines, ids } = body(entry.doc, deps, read);
    for (const id of ids) read.add(id);
    const failed = stateOf(entry.doc) === "failed";
    // A settled append is its start and its completion as one event.
    const opening = change.kind === "append" ? [`entry ${n} of ${String(state.highest)}: ${command(entry.doc)}`] : [];
    out.push({
      lines: [...opening, `entry ${n}: ${command(entry.doc)} — ${verdict(entry.doc)}`, ...lines],
      level: failed ? "assertive" : "polite",
    });
    return out;
  }

  // **Settled, and patched: a block appended is new; a block replaced is not**
  // (§6m.2 row 4). A refusal arrives here — C22 I118's refused paste is a notice
  // appended to a settled entry — and must state its reason (`R-INT-009`).
  const fresh = entry.doc.blocks.filter((b) => b !== headOf(entry.doc) && !read.has(b.id));
  if (fresh.length === 0) return out; // cells-ok — a count
  for (const b of fresh) read.add(b.id);
  out.push({
    lines: [`entry ${n}:`, ...fresh.flatMap((b) => blockLines(b, deps))],
    level: fresh.some(isLoud) ? "assertive" : "polite",
  });
  return out;
}

/** What a question says (I122): its detail's body, then one numbered line. */
export function questionEvent(
  q: Readonly<{ question: string; detail?: Block; choices: readonly Readonly<{ label: string }>[] }>,
  deps: BodyDeps,
): LinearEvent {
  const numbered = q.choices.map((c, i) => `${String(i + 1)} ${clean(c.label)}`).join(", ");
  const detail = q.detail === undefined ? [] : blockLines(q.detail, deps);
  return { lines: [...detail, `question: ${clean(q.question)} ${numbered}`], level: "assertive" };
}

export const answerEvent = (label: string): LinearEvent => ({ lines: [`answer: ${clean(label)}`], level: "polite" });

/** The one thing linear edits in place (I123): a label, a draft and a caret. */
export type InputLine = Readonly<{ label: string; text: string; cursor: number }>;

/**
 * The input line, windowed to `width` round its caret (I123).
 *
 * A line that wrapped would leave a row the next erase cannot reach — the
 * erase is one row, and addressing the one above is what linear forbids — so
 * the draft is cut to a window that holds the caret and fits.
 */
export function windowLine(line: InputLine, width: number): { text: string; caret: number } {
  const room = Math.max(1, width - 1);
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line.text)];
  const w = (g: string): number => cells(g); // narrow-ok — the measurer's convention for a line with no frame
  // The caret's grapheme index, from its code-unit offset.
  let at = graphemes.findIndex((g) => g.index >= line.cursor);
  if (at === -1) at = graphemes.length; // cells-ok — a grapheme count
  const labelCells = w(line.label);
  let from = 0;
  const upTo = (a: number, b: number): number => graphemes.slice(a, b).reduce((n, g) => n + w(g.segment), 0);
  while (from < at && labelCells + upTo(from, at) + 1 > room) from += 1;
  let to = at;
  while (to < graphemes.length && labelCells + upTo(from, to + 1) + 1 <= room) to += 1; // cells-ok — a grapheme count
  const text = graphemes.slice(from, to).map((g) => g.segment).join("");
  return { text: `${line.label}${text}`, caret: labelCells + upTo(from, at) };
}

/**
 * The writer (I119, I123): every event erases the input line first and redraws
 * it after, caret where it was, and nothing else is ever written in place.
 */
export function createLinearOutput(deps: Readonly<{
  write: (bytes: string) => void;
  width: () => number;
  input: () => InputLine;
}>): Readonly<{ emit: (events: readonly LinearEvent[]) => void; redraw: () => void }> {
  const line = (): string => {
    const { text, caret } = windowLine(deps.input(), deps.width());
    return `${ERASE_LINE}${text}${cursorColumn(caret + 1)}`;
  };
  /**
   * The line as last written. **A commit that changes nothing writes nothing**:
   * the scheduler commits for reasons that are not the line's, and a screen
   * reader may speak a rewritten line again — the input line's own form of
   * saying one fact twice (§107).
   */
  let shown = "";
  return Object.freeze({
    emit(events) {
      const lines = events.flatMap((e) => e.lines);
      if (lines.length === 0) return; // cells-ok — a count
      shown = line();
      deps.write(`${ERASE_LINE}${lines.map((l) => `${l}\r\n`).join("")}${shown.slice(ERASE_LINE.length)}`);
    },
    redraw() {
      const next = line();
      if (next === shown) return;
      shown = next;
      deps.write(next);
    },
  });
}
