/**
 * `keyValue`, `logs`, `events`, `diff`, `steps`.
 *
 * Five kinds of one row per item. Their heights are the cheapest in the system
 * to measure and the easiest to get wrong in one direction only: each renders
 * columns, and a column that wraps instead of truncating turns a height of
 * `rows` into a height of "it depends" (§3).
 *
 * Nothing here wraps. `logs` in particular is never wrapped — predictable height
 * is what lets a tail scroll smoothly at a thousand lines a second (T5.4).
 */
import type { ReactElement } from "react";
import { atLeastOne, normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Comparison, Events, Glyph, KeyValue, Logs, Steps, Tone } from "../../../data/viewmodel/index.js";
import { cells, stripControl, truncate } from "../../text.js";
import { glyphFor, glyphs, spinnerFrames } from "../glyphs.js";
import { clampSpans, pad, paint, rows, tone, type Span } from "../paint.js";
import type { BlockDefinition, RenderContext } from "../types.js";

/** §3: the key column is sized to the longest key and capped here. */
const KEY_COLUMN_CAP = 20;

/** Two spaces between columns. One reads as a typo; three wastes a narrow terminal. */
const COLUMN_GAP = 2;

function widest(values: readonly string[], cap: number): number {
  let widest = 0;
  for (const value of values) widest = Math.max(widest, cells(value));
  return Math.min(cap, widest);
}

// --- keyValue --------------------------------------------------------------

export const keyValueDefinition: BlockDefinition<KeyValue> = {
  kind: "keyValue",

  measure: (block: KeyValue): number => atLeastOne(block.rows.length), // cells-ok

  render(block: KeyValue, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const keyWidth = widest(
      block.rows.map((r) => stripControl(r.label)),
      Math.min(KEY_COLUMN_CAP, Math.max(1, width - 4)),
    );
    const valueWidth = Math.max(1, width - keyWidth - COLUMN_GAP);

    return rows(
      block.rows.map((entry) => {
        // The key truncates at the cap; the value still aligns, because the
        // column is a width rather than the longest key that happens to fit
        // (T1.5).
        const key = pad(
          truncate(stripControl(entry.label), keyWidth, ctx.capabilities),
          keyWidth,
        );
        const value = truncate(stripControl(entry.value), valueWidth, ctx.capabilities);

        return paint(
          clampSpans(
            [
              { text: key, style: tone("muted", ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              { text: value, style: tone(entry.tone ?? "default", ctx.theme, ctx.capabilities) },
            ],
            width,
            ctx.capabilities,
          ),
        );
      }),
    );
  },
};

// --- logs ------------------------------------------------------------------

/** A level's tone. Unknown levels read as `default` rather than as an error. */
function levelTone(level: string): Tone {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return "error";
    case "warn":
    case "warning":
      return "warn";
    case "debug":
    case "trace":
      return "dim";
    default:
      return "info";
  }
}

/** Levels are a fixed-width column so the messages line up (§3). */
const LEVEL_WIDTH = 5;

export const logsDefinition: BlockDefinition<Logs> = {
  kind: "logs",

  measure: (block: Logs): number => atLeastOne(block.lines.length), // cells-ok

  render(block: Logs, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);

    return rows(
      block.lines.map((line) => {
        const ts = stripControl(line.ts);
        const level = pad(
          truncate(stripControl(line.level), LEVEL_WIDTH, ctx.capabilities),
          LEVEL_WIDTH,
        );

        // The message takes the residual and truncates. Wrapping it would make
        // the block's height depend on its content, and a tail that reflows is
        // a tail nobody can read (§3, T6.10).
        const room = Math.max(1, width - cells(ts) - LEVEL_WIDTH - COLUMN_GAP * 2);
        const message = truncate(stripControl(line.message), room, ctx.capabilities);

        return paint(
          clampSpans(
            [
              { text: ts, style: tone("meta", ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              { text: level, style: tone(levelTone(line.level), ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              { text: message, style: tone("default", ctx.theme, ctx.capabilities) },
            ],
            width,
            ctx.capabilities,
          ),
        );
      }),
    );
  },
};

// --- events ----------------------------------------------------------------

export const eventsDefinition: BlockDefinition<Events> = {
  kind: "events",

  measure: (block: Events): number => atLeastOne(block.events.length), // cells-ok

  render(block: Events, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    const typeWidth = widest(
      block.events.map((e) => stripControl(e.type)),
      Math.max(1, Math.floor(width / 4)),
    );

    return rows(
      block.events.map((event) => {
        const ts = stripControl(event.ts);
        const type = pad(
          truncate(stripControl(event.type), typeWidth, ctx.capabilities),
          typeWidth,
        );
        const room = Math.max(1, width - cells(ts) - typeWidth - COLUMN_GAP * 2);

        return paint(
          clampSpans(
            [
              { text: ts, style: tone("meta", ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              // `accent` when the producer says nothing — the behaviour before
              // the field existed, so an app that does not set it sees no
              // change (C04 I35, F51).
              { text: type, style: tone(event.tone ?? "accent", ctx.theme, ctx.capabilities) },
              { text: " ".repeat(COLUMN_GAP) },
              {
                text: truncate(stripControl(event.message), room, ctx.capabilities),
                style: tone("default", ctx.theme, ctx.capabilities),
              },
            ],
            width,
            ctx.capabilities,
          ),
        );
      }),
    );
  },
};

// --- diff ------------------------------------------------------------------

/**
 * The judgement half, and the only half that takes a colour (C04 I36).
 *
 * The change half is rendered by {@link CHANGE_MARKERS} instead — it was always
 * neutral here (`same`→`muted`, `changed`→`default`), which is the renderer
 * having split the union before the type did.
 */
function verdictTone(verdict: "better" | "worse" | undefined): Tone {
  switch (verdict) {
    case "better":
      return "ok";
    case "worse":
      return "error";
    default:
      return "default";
  }
}

/**
 * The judgement half's mark, derived from the same field as its tone (C04 I38).
 *
 * **Without it `better` and `worse` render identically to each other and to an
 * unmarked row, at every colour depth** — F34's measured half, and the reason
 * it is the half that survived that finding's own correction: `200ms` against
 * `150ms` says nothing about which is wanted, so unlike `same`/`changed` a
 * reader cannot recover it from the two cells.
 *
 * Derived rather than supplied, because `verdict` already names the fact. A
 * glyph field here would let a producer say `worse` and draw `✓`.
 */
function verdictGlyph(verdict: "better" | "worse" | undefined): Glyph | null {
  switch (verdict) {
    case "better":
      return "ok";
    case "worse":
      return "error";
    default:
      return null;
  }
}

/**
 * The change axis, carried without colour (C04 I35).
 *
 * The same construction as `patch`'s `MARKERS` and for the same reason: at
 * `colourDepth: 1` the marker is all that is left, so the distinction survives
 * by construction rather than by a lint.
 */
const CHANGE_MARKERS: Readonly<Record<"unchanged" | "changed" | "added" | "removed", string>> =
  Object.freeze({ unchanged: " ", changed: "~", added: "+", removed: "-" });

/** The marker column's width, or 0 when no row in the block declares a change. */
const MARKER_WIDTH = 2;

/**
 * A verdict's mark, padded to the reserved width — blank when the block
 * reserved none, and blank for a row with no verdict inside a block that did.
 *
 * `glyphFor` is the single place either character enters a frame (C09 §4), so
 * the ASCII substitution is 1:1 by construction and this stays one cell wide at
 * both depths.
 */
function markFor(
  verdict: "better" | "worse" | undefined,
  reserved: number,
  ctx: RenderContext,
): string {
  if (reserved === 0) return "";
  const token = verdictGlyph(verdict);
  return pad(token === null ? "" : glyphFor(token, ctx.capabilities), reserved);
}

export const comparisonDefinition: BlockDefinition<Comparison> = {
  kind: "comparison",

  // Rows plus the header (§3). The header is not optional here, so the `+ 1` is
  // unconditional — and `atLeastOne` never fires, which is correct: a comparison
  // with no rows is still a header.
  measure: (block: Comparison): number => atLeastOne(block.rows.length + 1), // cells-ok

  render(block: Comparison, ctx: RenderContext): ReactElement {
    const width = normaliseWidth(ctx.width);
    // The marker column appears only when a row declares a change, so a block
    // that uses the verdict half alone renders exactly as it did before the
    // split. Per-block and deterministic: every row of one block agrees, which
    // is what keeps the field column aligned.
    const marked = block.rows.some((r) => r.change !== undefined) ? MARKER_WIDTH : 0;
    // The verdict's mark, on the same terms and inside the `b` column: it
    // qualifies one cell rather than the row, which is where the tone already
    // sits (C04 I38).
    const judged = block.rows.some((r) => r.verdict !== undefined) ? MARKER_WIDTH : 0;
    // Three equal columns (§3), the residual going to the field name.
    const column = Math.max(1, Math.floor((width - COLUMN_GAP * 2 - marked) / 3));
    const fieldWidth = Math.max(1, width - marked - column * 2 - COLUMN_GAP * 2);

    const dim = tone("dim", ctx.theme, ctx.capabilities);
    const header = paint(
      clampSpans(
        [
          ...(marked > 0 ? [{ text: " ".repeat(marked) }] : []),
          { text: pad("field", fieldWidth), style: dim },
          { text: " ".repeat(COLUMN_GAP) },
          // **`a` and `b`, not `before` and `after`** — the rename's ruling,
          // which the renderer had never taken. Positional rather than
          // directional, because S07's two runs have no before-and-after: it
          // compares two runs, and calling one of them "before" is wrong for
          // half this kind's consumers. Nothing asserted these labels, which is
          // why the type carried `a`/`b` while the screen said otherwise.
          // Truncated to the column like any other cell, so a long container
          // name cannot push the header wider than the rows beneath it (F33).
          {
            text: pad(
              truncate(stripControl(block.labels?.[0] ?? "a"), column, ctx.capabilities),
              column,
            ),
            style: dim,
          },
          { text: " ".repeat(COLUMN_GAP) },
          {
            text: pad(
              truncate(stripControl(block.labels?.[1] ?? "b"), column, ctx.capabilities),
              column,
            ),
            style: dim,
          },
        ],
        width,
        ctx.capabilities,
      ),
    );

    const body = block.rows.map((entry) =>
      paint(
        clampSpans(
          [
            ...(marked > 0
              ? [
                  {
                    text: pad(CHANGE_MARKERS[entry.change ?? "unchanged"], marked),
                    style: tone("muted", ctx.theme, ctx.capabilities),
                  },
                ]
              : []),
            {
              text: pad(
                truncate(stripControl(entry.field), fieldWidth, ctx.capabilities),
                fieldWidth,
              ),
              style: tone("muted", ctx.theme, ctx.capabilities),
            },
            { text: " ".repeat(COLUMN_GAP) },
            {
              text: pad(truncate(stripControl(entry.a), column, ctx.capabilities), column),
              style: tone("default", ctx.theme, ctx.capabilities),
            },
            { text: " ".repeat(COLUMN_GAP) },
            {
              // The mark and the value share the column, so the block's width
              // is what it was and `measure` — rows plus a header — is
              // untouched either way.
              text: pad(
                markFor(entry.verdict, judged, ctx) +
                  truncate(stripControl(entry.b), Math.max(1, column - judged), ctx.capabilities),
                column,
              ),
              style: tone(verdictTone(entry.verdict), ctx.theme, ctx.capabilities),
            },
          ],
          width,
          ctx.capabilities,
        ),
      ),
    );

    return rows([header, ...body]);
  },
};

// --- steps -----------------------------------------------------------------

export const stepsDefinition: BlockDefinition<Steps> = {
  kind: "steps",

  measure: (block: Steps): number => atLeastOne(block.steps.length), // cells-ok

  render(block: Steps, ctx: RenderContext): ReactElement {
    const g = glyphs(ctx.capabilities);
    const frames = spinnerFrames(ctx.capabilities);
    const width = normaliseWidth(ctx.width);
    const labelWidth = widest(
      block.steps.map((s) => stripControl(s.label)),
      Math.max(1, Math.floor(width / 2)),
    );

    return rows(
      block.steps.map((step) => {
        // The spinner frame comes from `tick`, never from a clock (§2, T6.13).
        // Every frame is one cell, in both glyph sets, so an animating step
        // never shifts the row it sits on.
        const marker =
          step.state === "active"
            ? (frames[ctx.tick % frames.length] ?? g.dotted) // cells-ok
            : step.state === "done"
              ? g.tick
              : step.state === "failed"
                ? g.cross
                : g.dotted;

        const markerTone: Tone =
          step.state === "done"
            ? "ok"
            : step.state === "failed"
              ? "error"
              : step.state === "active"
                ? "accent"
                : "muted";

        const label = pad(
          truncate(stripControl(step.label), labelWidth, ctx.capabilities),
          labelWidth,
        );
        const detailRoom = Math.max(
          1,
          width - cells(marker) - 1 - labelWidth - COLUMN_GAP,
        );
        const detail =
          step.detail === undefined
            ? ""
            : truncate(stripControl(step.detail), detailRoom, ctx.capabilities);

        const spans: Span[] = [
          { text: `${marker} `, style: tone(markerTone, ctx.theme, ctx.capabilities) },
          {
            text: label,
            style: tone(step.state === "pending" ? "muted" : "default", ctx.theme, ctx.capabilities),
          },
        ];
        if (detail !== "") {
          spans.push({ text: " ".repeat(COLUMN_GAP) });
          spans.push({ text: detail, style: tone("meta", ctx.theme, ctx.capabilities) });
        }

        return paint(clampSpans(spans, width, ctx.capabilities));
      }),
    );
  },
};
