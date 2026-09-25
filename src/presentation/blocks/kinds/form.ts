/**
 * The form — labelled fields and the buttons that act on them (C04 §3ar,
 * C04 I135, C04 I136, C04 I137, C09 I119, §105).
 *
 * *The label is Fixed, the field Grows, the hint is decoration.* One layout
 * function answers `measure`, `elements` and `render`, so the three cannot
 * describe different forms — the arithmetic is the figure read cell for cell:
 * the field four past the widest label, `›` in the default button's two-cell
 * slot, and the field rows flush with the button row, one cell left of the
 * figure, because C09 I87 forbids a row left of the head (parked 47).
 *
 * **§094 decides every narrow width.** Labels and values are content; the hint
 * is decoration and goes whole, never cut; the error is content and wraps; and
 * below a one-cell field each label takes its own row — the representation rung.
 *
 * **The draft is appearance.** A field being edited draws the borrowed editor's
 * line from the render context (C09 I119), windowed round the caret on its one
 * row, so nothing here that counts rows can see it.
 */
import { normaliseWidth } from "../../../data/viewmodel/index.js";
import type { Form, FormField } from "../../../data/viewmodel/index.js";
import { cells, graphemes, stripControl, truncate, wrapCells } from "../../text.js";
import { glyphFor, glyphs } from "../glyphs.js";
import { focusStyle, paint, rows, tone, type Span } from "../paint.js";
import { fitRow } from "../../rows.js";
import type { BlockDefinition, NavElement, RenderContext, Rendered } from "../types.js";

/** Field rows start flush with the button row — the figure's less one (C09 I87, parked 47). */
const INDENT = 0;
/** From the widest label to the field (§105: `replicas` then four). */
const LABEL_GAP = 4;
/** On the representation rung the field sits under its label, two further in. */
const STACKED_COL = 2;
/** A button's mark slot: `› ` for the default, two blanks for the rest. */
const SLOT = 2;
/** Between one button and the next. */
const BUTTON_GAP = 2;
/** An error's text hangs under itself rather than under the `✗` (C04 I136). */
const HANG = 2;

type FieldPlace = Readonly<{
  field: FormField;
  /** The field's first row — its label row on the representation rung. */
  top: number;
  /** The value's row. */
  valueRow: number;
  /** The rows under the value: an error's wrapped lines, or a hint's one. */
  under: readonly string[];
  kind: "error" | "hint" | "none";
}>;

type ButtonPlace = Readonly<{ index: number; row: number; from: number; to: number }>;

type Layout = Readonly<{
  stacked: boolean;
  /** Where the value, hint and error start. */
  col: number;
  /** The field's width — `F`. */
  room: number;
  labelWidth: number;
  fields: readonly FieldPlace[];
  buttons: readonly ButtonPlace[];
  /** The blank row between the fields and the buttons, where there are buttons. */
  gapRow: number | null;
  height: number;
}>;

/** The default button: the one that says so, or the first (C04 I135). */
export function defaultButton(block: Form): number {
  const i = (block.buttons ?? []).findIndex((b) => b.default === true);
  return i < 0 ? 0 : i;
}

/**
 * **Under the measurer's convention** (C02 I9): `measure` and `elements` have no
 * capability record, so every width here is narrow, as `pillsElements` and a
 * choice's columns are. The render draws under the terminal's and takes the
 * final clip at `w`, which is the safe direction of the disagreement.
 */
function layout(block: Form, width: number): Layout {
  const w = normaliseWidth(width);
  const labelWidth = Math.max(0, ...block.fields.map((f) => cells(stripControl(f.label)))); // narrow-ok — the measurer's convention, above
  const wide = w - (INDENT + labelWidth + LABEL_GAP);
  // **Below a one-cell field the labels stack** (§094's representation rung):
  // the label is the fact that says what the field is, and never shortens to
  // make room for it.
  const stacked = wide < 1;
  const col = stacked ? STACKED_COL : INDENT + labelWidth + LABEL_GAP;
  const room = stacked ? Math.max(1, w - STACKED_COL) : wide;

  let row = 0;
  const fields: FieldPlace[] = [];
  for (const field of block.fields) {
    const top = row;
    if (stacked) row += 1;
    const valueRow = row;
    row += 1;
    let under: readonly string[] = [];
    let kind: FieldPlace["kind"] = "none";
    if (field.error !== undefined && field.error !== "") {
      // Content: wrapped, hung, never dropped (§096 — losing the end loses the fact).
      const text = wrapCells(stripControl(field.error), Math.max(1, room - HANG));
      under = text;
      kind = "error";
    } else if (field.hint !== undefined && field.hint !== "" && cells(stripControl(field.hint)) <= room) { // narrow-ok — the measurer's convention
      // Decoration: whole or not at all — a cut sentence reads as another one.
      under = [stripControl(field.hint)];
      kind = "hint";
    }
    row += under.length; // cells-ok — a row count
    fields.push({ field, top, valueRow, under, kind });
  }

  const buttons: ButtonPlace[] = [];
  let gapRow: number | null = null;
  const list = block.buttons ?? [];
  if (list.length > 0) { // cells-ok — a count of buttons
    gapRow = row;
    row += 1;
    let at = 0;
    list.forEach((b, index) => {
      const want = Math.min(w, SLOT + cells(stripControl(b.label))); // narrow-ok — the measurer's convention
      // **Whole buttons wrap; none is shed** — a shed button is an action the
      // reader cannot reach (C04 I136).
      if (at > 0 && at + want > w) {
        row += 1;
        at = 0;
      }
      buttons.push({ index, row, from: at, to: at + want });
      at += want + BUTTON_GAP;
    });
    row += 1;
  }
  return { stacked, col, room, labelWidth, fields, buttons, gapRow, height: Math.max(1, row) };
}

/** The draft on one row of `room` cells, with the caret a cell of its own after what it follows. */
function draftRow(
  text: string,
  cursor: number,
  room: number,
  caret: string,
  ambiguous: "narrow" | "wide",
): Readonly<{ before: string; after: string }> {
  const clusters = graphemes(stripControl(text));
  // The caret sits after the clusters whose code units end at or before it.
  let at = 0;
  let units = 0;
  while (at < clusters.length && units + (clusters[at]?.length ?? 0) <= cursor) { // cells-ok — code units, the editor's measure
    units += clusters[at]?.length ?? 0; // cells-ok — code units
    at += 1;
  }
  const room0 = Math.max(0, room - cells(caret, ambiguous));
  // Windowed so the caret is inside the field: drop from the left until what
  // comes before it fits beside the caret.
  let start = 0;
  let before = clusters.slice(start, at).join("");
  while (start < at && cells(before, ambiguous) > room0) {
    start += 1;
    before = clusters.slice(start, at).join("");
  }
  let after = "";
  let left = room0 - cells(before, ambiguous);
  for (const c of clusters.slice(at)) {
    const n = cells(c, ambiguous);
    if (n > left) break;
    after += c;
    left -= n;
  }
  return { before, after };
}

function formElements(block: Form, width: number): readonly NavElement[] {
  const w = normaliseWidth(width);
  const l = layout(block, w);
  const out: NavElement[] = [];
  for (const p of l.fields) {
    out.push(
      Object.freeze({
        id: p.field.id,
        level: "row" as const,
        rows: Object.freeze({ from: p.top, to: p.valueRow + 1 + p.under.length }), // cells-ok — a row count
        cols: Object.freeze({ from: 0, to: w }),
        // **`⏎` enters it** (C26 I29): the inside mode a control uses, and the
        // shell lends the prompt's editor for as long as it lasts (C22 I118).
        viewState: true,
        copy: `${p.field.label}\t${p.field.value ?? ""}`,
      }),
    );
  }
  const list = block.buttons ?? [];
  for (const b of l.buttons) {
    const button = list[b.index];
    if (button === undefined) continue;
    out.push(
      Object.freeze({
        id: button.id,
        level: "cell" as const,
        rows: Object.freeze({ from: b.row, to: b.row + 1 }),
        cols: Object.freeze({ from: b.from, to: b.to }),
        ...(button.action === undefined ? {} : { activate: button.action }),
        copy: button.label,
      }),
    );
  }
  return out;
}

export const formDefinition: BlockDefinition<Form> = {
  kind: "form",

  // §7a — label and value, tab-separated, as `keyValue` copies (I86).
  copy: (block) => block.fields.map((f) => `${f.label}\t${f.value ?? ""}`).join("\n"),

  measure: (block: Form, width: number): number => layout(block, width).height,

  elements: formElements,

  render(block: Form, ctx: RenderContext): Rendered {
    const w = normaliseWidth(ctx.width);
    const caps = ctx.capabilities;
    const l = layout(block, w);
    ctx.probe?.gauge("form.fields", block.fields.length); // cells-ok — a count of fields
    const focus = ctx.focus !== null && ctx.focus.blockId === block.id ? ctx.focus : null;
    const muted = tone("muted", ctx.theme, caps);
    const plain = tone("default", ctx.theme, caps);
    const washed = { ...tone("default", ctx.theme, caps, "focusGround"), ...focusStyle(ctx.theme, caps) };
    const out: string[] = Array.from({ length: l.height }, () => "");
    const set = (row: number, spans: readonly Span[]): void => {
      out[row] = paint(spans);
    };

    for (const p of l.fields) {
      const focused = focus?.rowId === p.field.id;
      const draft = focused ? focus?.draft : undefined;
      const label = stripControl(p.field.label);
      const value: Span[] =
        draft === undefined
          ? [{ text: truncate(p.field.value ?? "", l.room, caps), style: focused ? washed : plain }]
          : (() => {
              const caret = glyphs(caps).bar;
              const d = draftRow(draft.text, draft.cursor, l.room, caret, caps.ambiguousWidth ?? "narrow");
              const style = focused ? washed : plain;
              return [
                { text: d.before, style },
                { text: caret, style },
                { text: d.after, style },
              ];
            })();
      // **One wash over the label and the value** (C09 I119): a field is one
      // focus shape, as a choice's option is (I105).
      if (l.stacked) {
        set(p.top, [{ text: " ".repeat(INDENT) }, { text: truncate(label, Math.max(1, w - INDENT), caps), style: focused ? washed : muted }]);
        set(p.valueRow, [{ text: " ".repeat(l.col) }, ...value]);
      } else {
        const pad = " ".repeat(Math.max(0, l.labelWidth - cells(label, caps.ambiguousWidth) + LABEL_GAP));
        set(p.valueRow, [
          { text: " ".repeat(INDENT) },
          { text: label, style: focused ? washed : muted },
          { text: pad, ...(focused ? { style: washed } : {}) },
          ...value,
        ]);
      }
      p.under.forEach((line, i) => {
        const row = p.valueRow + 1 + i;
        if (p.kind === "error") {
          // §105: *the same ✗ and the same tone as every other failure*.
          const err = tone("error", ctx.theme, caps);
          const lead = i === 0 ? `${glyphFor("error", caps)} ` : " ".repeat(HANG);
          set(row, [{ text: " ".repeat(l.col) }, { text: lead, style: err }, { text: line, style: err }]);
        } else {
          set(row, [{ text: " ".repeat(l.col) }, { text: line, style: tone("dim", ctx.theme, caps) }]);
        }
      });
    }

    const list = block.buttons ?? [];
    const primary = defaultButton(block);
    const byRow = new Map<number, Span[]>();
    for (const b of l.buttons) {
      const button = list[b.index];
      if (button === undefined) continue;
      const spans = byRow.get(b.row) ?? [];
      const drawn = spans.reduce((n, s) => n + cells(s.text, caps.ambiguousWidth), 0);
      if (b.from > drawn) spans.push({ text: " ".repeat(b.from - drawn) });
      const focused = focus?.rowId === button.id;
      const mark = b.index === primary ? `${glyphFor("current", caps)} ` : "  ";
      const text = truncate(stripControl(button.label), Math.max(0, b.to - b.from - SLOT), caps);
      // `›` marks the default and never focus (C09 I119, C04 §3ar S7).
      spans.push({ text: mark, style: focused ? washed : tone("accent", ctx.theme, caps) });
      spans.push({ text, style: focused ? washed : plain });
      byRow.set(b.row, spans);
    }
    for (const [row, spans] of byRow) set(row, spans);
    // **§094's final container clip** (C04 I136): below the representation
    // rung's own floor a row is wider than `w`, and a row wider than its width
    // wraps and scrolls the alternate screen.
    return rows(out.map((r) => fitRow(r, w)));
  },
};
