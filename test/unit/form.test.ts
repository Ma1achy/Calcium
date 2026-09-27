// C04 §3ar — the form (§105): the label is Fixed, the field Grows, the hint is decoration.
//
// **The expected frames are literals, worked by hand before the assertion.**
// §105's figure is drawn back cell for cell at 48 columns — the widest label is
// eight, so the field starts at 8 + 4 = 12 — with the document's two-cell figure
// margin removed and the fields flush with the button row, one cell left of the
// figure (C09 I87, parked 47). The narrow rung is worked at 12, where the field
// would have no cell and the labels stack.
import { describe, expect, it } from "vitest";

import { block, validateDocument } from "../../src/data/viewmodel/index.js";
import type { Action, Block, Form } from "../../src/data/viewmodel/index.js";
import { createBlockRegistry } from "../../src/presentation/blocks/index.js";
import { paint, tone } from "../../src/presentation/blocks/paint.js";
import { semanticsOf } from "../../src/presentation/blocks/semantics.js";
import { renderSequenceToLines } from "../../src/presentation/render-lines.js";
import type { FocusState } from "../../src/presentation/blocks/types.js";
import { submitAction } from "../../src/shell/form-submit.js";
import { doc, ONE_PER_KIND } from "../support/blocks.js";
import { DARK_THEME, FULL_CAPS, MONO_UNICODE_CAPS } from "../support/render.js";
import { background } from "../../src/presentation/blocks/paint.js";
import { formDefinition } from "../../src/presentation/blocks/kinds/form.js";
import { sgr } from "../../src/terminal/escapes.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const registry = createBlockRegistry({ defaults: true });
const SGR = /\x1b\[[0-9;]*m/gu;
const FORM = ONE_PER_KIND.form as Form;

const painted = (b: Block, width: number, focus: FocusState | null = null): readonly string[] =>
  renderSequenceToLines(registry, [b], width, { theme: DARK_THEME, capabilities: FULL_CAPS, focus });
const frame = (b: Block, width: number, focus: FocusState | null = null): readonly string[] =>
  painted(b, width, focus).map((l) => l.replace(SGR, "").trimEnd());

const errorsOf = (b: unknown): string => {
  const r = validateDocument(doc({ blocks: [b as Block] }));
  return r.ok ? "" : r.error.join("\n");
};

/** `port` being edited, its caret after `cursor` code units of `text`. */
const editing = (text: string, cursor: number, field = "port"): FocusState =>
  ({ blockId: "form-1", rowId: field, inside: true, draft: { text, cursor } }) as FocusState;

describe("C04 §3ar — form", () => {
  it("T1.59 (C04 I135): fields, buttons and unique ids", () => {
    expect(errorsOf(FORM), "§105's form validates").toBe("");
    expect(errorsOf({ ...FORM, fields: [] })).toMatch(/at least one field \(C04 I135\)/u);
    const clash = { ...FORM, buttons: [{ id: "port", label: "port" }] };
    expect(errorsOf(clash)).toMatch(/id "port" appears 2 times across fields and buttons \(C04 I135\)/u);
    const twoDefaults = { ...FORM, buttons: [{ id: "a", label: "a", default: true }, { id: "b", label: "b", default: true }] };
    expect(errorsOf(twoDefaults)).toMatch(/at most one button is "default" \(C04 I135\) — got 2/u);
    const openSubmit = { ...FORM, buttons: [{ id: "a", label: "a", submit: true, action: { kind: "open", label: "a", url: "https://x" } }] };
    expect(errorsOf(openSubmit)).toMatch(/"submit" needs a "fill" or "exec" action \(C04 I135\)/u);
    const badHint = { ...FORM, fields: [{ id: "a", label: "a", hint: 3 }] };
    expect(errorsOf(badHint)).toMatch(/"hint" must be a string when present \(C04 I135\)/u);
  });

  it("T1.60 (C04 I136, C09 I119, C09 I118, §3ar S1–S7, §105): §105's figure, the narrow rungs and the draft", () => {
    // §105 exactly — `port`'s error replacing its hint, `replicas`' hint kept,
    // `›` on `save`, and `port` being edited with its caret after `80`.
    expect(frame(FORM, 48, editing("80", 2))).toEqual([
      "name        prism-serve",
      "port        80▌",
      "            ✗ ports below 1024 need root",
      "replicas    3",
      "            0 stops the service",
      "",
      "› save    cancel",
    ]);
    // Not being edited, the caret goes and nothing else moves.
    expect(frame(FORM, 48)[1]).toBe("port        80");

    // S1, S3, S4, S5 at 12 — the labels stack, `prism-serve` is cut with `…`,
    // the error wraps hung under its own text, the hint goes whole, and the
    // buttons wrap as whole buttons.
    expect(frame(FORM, 12)).toEqual([
      "name",
      "  prism-ser…",
      "port",
      "  80",
      "  ✗ ports",
      "    below",
      "    1024",
      "    need",
      "    root",
      "replicas",
      "  3",
      "",
      "› save",
      "  cancel",
    ]);

    // S6 — a draft longer than the field, windowed round the caret. At 20 the
    // field is 8 cells: seven of text and the caret.
    expect(frame(FORM, 20, editing("1234567890", 10))[1]).toBe("port        4567890▌");
    expect(frame(FORM, 20, editing("1234567890", 0))[1]).toBe("port        ▌1234567");
    expect(frame(FORM, 20, editing("1234567890", 4))[1]).toBe("port        1234▌567");

    // **Geometry never animates**: the draft is drawn on the field's one row,
    // so `measure` equals the rows drawn at every width, with and without one.
    for (let w = 1; w <= 80; w += 1) {
      const n = registry.measure(FORM, w);
      expect(painted(FORM, w), `rows at ${String(w)}`).toHaveLength(n);
      expect(painted(FORM, w, editing("x".repeat(90), 45)), `rows at ${String(w)} while editing`).toHaveLength(n);
    }

    // C09 I119 — the error's `✗` in `error` tone, `›` in `accent`.
    const opening = (text: string, ink: "error" | "accent"): string =>
      paint([{ text, style: tone(ink, DARK_THEME, FULL_CAPS) }]).replace(/\x1b\[0m$/u, "");
    const rows = painted(FORM, 48);
    expect(rows[2]).toContain(opening("✗ ", "error"));
    expect(rows[6]).toContain(opening("› ", "accent"));

    // C09 I118 — a form, its fields `textbox`, its buttons `button`.
    const node = semanticsOf(FORM, 48, (b, w) => registry.elementsOf(b, w));
    expect(node.role).toBe("form");
    expect(node.children.map((c) => [c.id, c.role])).toEqual([
      ["name", "textbox"],
      ["port", "textbox"],
      ["replicas", "textbox"],
      ["save", "button"],
      ["cancel", "button"],
    ]);
    // And the elements' extents: a field from its value to its last error row,
    // a button over its slot and label.
    const els = registry.elementsOf(FORM, 48);
    expect(els.find((e) => e.id === "port")?.rows).toEqual({ from: 1, to: 3 });
    expect(els.find((e) => e.id === "cancel")?.cols).toEqual({ from: 8, to: 16 });
  });

  it("T1.61 (C04 I137): a submit writes the values as arguments", () => {
    const fill: Action = { kind: "fill", label: "save", command: "serve" };
    expect(submitAction(FORM, "save", fill)).toEqual({ ...fill, command: "serve --name prism-serve --port 80 --replicas 3" });
    // A value with a space, one quoted token; an empty value omitted; a
    // positional field; a flag of its own.
    const f = block({
      kind: "form",
      id: "f",
      fields: [
        { id: "title", label: "title", value: "two words" },
        { id: "empty", label: "empty", value: "" },
        { id: "target", label: "target", value: "web", flag: "" },
        { id: "port", label: "port", value: "80", flag: "-p" },
      ],
      buttons: [{ id: "go", label: "go", submit: true, action: { kind: "exec", label: "go", command: "deploy" } }],
    }) as Form;
    expect(submitAction(f, "go", { kind: "exec", label: "go", command: "deploy" }).kind === "exec").toBe(true);
    expect((submitAction(f, "go", { kind: "exec", label: "go", command: "deploy" }) as { command: string }).command).toBe(
      "deploy --title 'two words' web -p 80",
    );
    // A button that does not submit is handed back unchanged.
    expect(submitAction(FORM, "cancel", fill)).toBe(fill);
  });

  const THREE = block({
    kind: "form",
    id: "f",
    fields: [
      { id: "a", label: "open", value: "1" },
      { id: "b", label: "shown", value: "2", availability: "readonly" },
      { id: "c", label: "shut", value: "3", availability: "disabled", error: "not a port number" },
    ],
    buttons: [{ id: "go", label: "go", submit: true, action: { kind: "exec", label: "go", command: "deploy" } }],
  } as Form) as Form;

  it("T2.135 (C04 I137, C04 I140): a submit writes a readonly field's value and not a disabled one's, and the element list keeps the readonly field without viewState and drops the disabled one", () => {
    const sent = submitAction(THREE, "go", { kind: "exec", label: "go", command: "deploy" }) as { command: string };
    expect(sent.command, "the enabled and readonly values, not the disabled one").toBe("deploy --a 1 --b 2");
    const els = formDefinition.elements!(THREE, 40, () => 0, () => "");
    expect(els.map((e) => e.id), "\u21e5 cannot land on a disabled field").toEqual(["a", "b", "go"]);
    expect(els.find((e) => e.id === "a")?.viewState, "\u23ce enters an enabled field").toBe(true);
    expect(els.find((e) => e.id === "b")?.viewState, "and not a readonly one").toBeUndefined();
  });

  it("T2.186 (C09 I122, C04 I140): a disabled field stands in the well in dim, and its error keeps ✗ and its message", () => {
    const at = (caps: TerminalCapabilities) =>
      renderSequenceToLines(registry, [THREE], 40, { theme: DARK_THEME, capabilities: caps, focus: null });
    // The ink and the ground open as two sequences; each is asserted.
    const ink = sgr(tone("dim", DARK_THEME, FULL_CAPS, "bgDeep"));
    const well = sgr(background("surface.bgDeep", DARK_THEME, FULL_CAPS));
    const rows = at(FULL_CAPS);
    const row = (text: string) => rows.find((l) => l.replace(SGR, "").includes(text))!;
    expect(row("shut"), "the disabled field stands in the well").toContain(well);
    expect(row("shut"), "in dim").toContain(ink);
    expect(row("open"), "an enabled field takes neither").not.toContain(well);
    expect(row("shown"), "nor a readonly one").not.toContain(well);
    const error = row("not a port number");
    expect(error.replace(SGR, "").trim(), "the error keeps its mark and its word").toBe("\u2717 not a port number");
    expect(error, "in error").toContain(sgr(tone("error", DARK_THEME, FULL_CAPS)));
    // At 1-bit the well is gone and the weight is what is left: the value dims.
    const mono = at(MONO_UNICODE_CAPS);
    const shut = mono.find((l) => l.replace(SGR, "").includes("shut"))!;
    expect(shut, "dim at 1-bit").toContain("\u001b[2m");
    expect(shut.replace(SGR, "").trimEnd(), "no ground to carry").toContain("3");
    const open = mono.find((l) => l.replace(SGR, "").includes("open"))!;
    expect(open.endsWith("1") || /1\s*$/u.test(open.replace(SGR, "")), "the enabled value is plain").toBe(true);
    expect(open.slice(open.indexOf("1") - 4), "and not dim").not.toMatch(/\u001b\[2m\s*1/u);
    expect(mono.find((l) => l.includes("not a port number"))!.replace(SGR, "").trim()).toBe("\u2717 not a port number");
  });
});
