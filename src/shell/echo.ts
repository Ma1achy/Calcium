/**
 * The echo's chips (C22 §6t, I153, I154; C26 I33; ruling 104 c, F1521).
 *
 * **A submitted line keeps its chips, drawn as the prompt drew them.** The line
 * C23 hands the far side has each chip's content in its place; `meta.echo` says
 * where (C04 I152). This module turns that record back into the prompt's
 * picture — C17's walk over the command with each chip's range standing as one
 * cluster drawn as its label — and into the elements that let focus reach a
 * chip and peek its content.
 *
 * **The walk, not a second wrap.** A chip is one wrap unit (C17 I26) and a label
 * wider than its row is elided (C17 I32); `hardWrapCells` knows neither, and a
 * six-line paste echoed as six rows for the one row the reader saw (§6t.1).
 * `commandRows` is the measurer's and the composer's, so the rows here are the
 * height C14 virtualises against (I33).
 */
import type { Block, EchoChip } from "../data/viewmodel/index.js";
import { block as makeBlock } from "../data/viewmodel/index.js";
import { chipLabel, walk, type CellSpan, type Chip, type ChipLook, type ResolvedChip } from "../interaction/editor/index.js";
import { glyphs } from "../presentation/blocks/index.js";
import type { PlacedElement } from "../presentation/blocks/index.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";
import { promptFor, PROMPT_GUTTER } from "./config.js";

/** What the echo reads of the capabilities: the prompt's form, the chip's rung and the width rule. */
export type EchoCaps = Pick<TerminalCapabilities, "unicode" | "ambiguousWidth" | "colourDepth">;

/**
 * **The block id the echo's elements stand under** (C26 I33). It holds U+0000,
 * which no producer's id is expected to, so `blockIn` finds no block for it.
 * Stated blind spot: a producer block whose id is this string shares the address.
 */
export const ECHO_BLOCK = "\u0000echo";

/**
 * The chip's rung, from capabilities (C17 I25, §5c). One derivation for the
 * prompt's editor, the preview's header and the echo, so the three cannot spell
 * one chip two ways.
 */
export function chipLookFor(caps: EchoCaps): ChipLook {
  const set = glyphs(caps);
  return {
    separator: set.separator,
    painted: caps.colourDepth > 1,
    // **The tier the separator came from, read off the set rather than
    // restated** (C17 I32, C02 I9): `glyphs()` hands the ASCII set at the wide
    // rung as well as at `unicode: "ascii"`, so the elision's marker is `~`
    // wherever the separator is `:` and never a two-cell `…` the walk measures
    // as one.
    unicode: set === glyphs({ unicode: "ascii", ambiguousWidth: "narrow" }) ? "ascii" : caps.unicode,
  };
}

/** C17 I37's answer, as the record C23 writes (C04 I152): the content is the range and is not carried. */
export function echoChipsOf(resolved: readonly ResolvedChip[]): readonly EchoChip[] {
  return resolved.map(({ from, to, chip }) => ({
    from,
    to,
    ordinal: chip.ordinal,
    kind: chip.kind,
    name: chip.name,
    ...(chip.lines === undefined ? {} : { lines: chip.lines }),
  }));
}

/** The echo of a line that held chips: the prompt's rows, and each chip's cells by index into `echo`. */
export type EchoRows = Readonly<{
  rows: readonly string[];
  /** One per chip of `echo`, in its order — the cells the label covers, gutter included. */
  chips: readonly CellSpan[];
}>;

/**
 * The echo as the prompt drew it (C22 I153, §6t.2 rows 1–6), or `null` where
 * `echo` is absent or does not describe `command` — and the caller then draws
 * `hardWrapCells`' rows byte for byte.
 *
 * **Segment by segment**: the text between chips is normalised to `\n` line
 * breaks before the walk (row 4), and the ranges index `command`, so the
 * normalising cannot shift a chip. **The sentinels are private-use code points
 * the command does not hold** (row 6), so a typed one is text.
 */
export function echoRows(command: string, echo: readonly EchoChip[] | undefined, width: number, caps: EchoCaps): EchoRows | null {
  if (echo === undefined || echo.length === 0) return null; // cells-ok — a chip count
  let at = 0;
  for (const chip of echo) {
    if (!Number.isInteger(chip.from) || !Number.isInteger(chip.to)) return null;
    if (chip.from < at || chip.to < chip.from || chip.to > command.length) return null; // cells-ok — code-unit offsets
    at = chip.to;
  }

  let code = 0xe000;
  const mint = (): string => {
    while (command.includes(String.fromCodePoint(code))) code += 1;
    const sentinel = String.fromCodePoint(code);
    code += 1;
    return sentinel;
  };
  const byCluster = new Map<string, EchoChip>();
  const normalise = (piece: string): string => piece.replace(/\r\n|\r/gu, "\n");
  let text = "";
  at = 0;
  for (const chip of echo) {
    text += normalise(command.slice(at, chip.from));
    const sentinel = mint();
    byCluster.set(sentinel, chip);
    text += sentinel;
    at = chip.to;
  }
  text += normalise(command.slice(at));

  const look = chipLookFor(caps);
  const drawAs = (cluster: string, limit?: number): string | undefined => {
    const chip = byCluster.get(cluster);
    if (chip === undefined) return undefined;
    // The label's parts; the content is the range and the label never reads it.
    const parts: Chip = {
      ordinal: chip.ordinal,
      kind: chip.kind,
      name: chip.name,
      ...(chip.lines === undefined ? {} : { lines: chip.lines }),
      content: "",
    };
    return chipLabel(parts, look, limit);
  };
  const walked = walk(text, width, PROMPT_GUTTER, drawAs);
  // **A sentinel the walk did not draw as a chip** — a combining mark typed
  // straight after one joins its cluster — leaves the spans and `echo` out of
  // step, and a ground on the wrong chip is worse than the plain rows.
  if (walked.chips.length !== echo.length) return null; // cells-ok — a chip count
  const prompt = promptFor(caps);
  return {
    rows: walked.rows.map((row, i) => (i === 0 ? prompt : " ".repeat(PROMPT_GUTTER.cont)) + row),
    chips: walked.chips,
  };
}

/** The element id of the echo's `i`th chip, and its inverse — `null` for any other id. */
export const echoChipId = (i: number): string => `chip-${String(i)}`;
export function echoChipIndex(id: string | null | undefined): number | null {
  const match = id == null ? null : /^chip-(\d+)$/u.exec(id);
  return match === null || match[1] === undefined ? null : Number(match[1]);
}

/**
 * **The echo's chips as elements, ahead of the document's** (C26 I33, C22
 * I154). Each is `cell` level under `ECHO_BLOCK`; its rows are its echo row
 * less the echo's height — negative in the entry's block space, so
 * `chromeRows + rows.from` places it as every reader already places an element
 * — and its columns the chip's cells. Its `copy` is the content (`R-SEL-004`)
 * and its `detail` the content as a `code` block, as the preview's box holds it
 * (I143), so §101's peek is the general peek arriving at it (§6l.12).
 */
export function echoElements(
  command: string,
  echo: readonly EchoChip[] | undefined,
  width: number,
  caps: EchoCaps,
): readonly PlacedElement[] {
  const drawn = echoRows(command, echo, width, caps);
  if (drawn === null || echo === undefined) return [];
  const height = drawn.rows.length;
  return drawn.chips.flatMap((span, i) => {
    const chip = echo[i];
    if (chip === undefined) return [];
    const content = command.slice(chip.from, chip.to);
    const detail: Block = makeBlock({ kind: "code", id: `echo-chip-${String(i)}`, language: "text", text: content });
    return [
      Object.freeze({
        blockId: ECHO_BLOCK,
        element: Object.freeze({
          id: echoChipId(i),
          level: "cell" as const,
          rows: Object.freeze({ from: span.row - height, to: span.row - height + 1 }),
          cols: Object.freeze({ from: span.from, to: span.to }),
          copy: content,
          detail,
        }),
      }),
    ];
  });
}
