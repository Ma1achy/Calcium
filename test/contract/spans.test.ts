// Spans — the contract rows: the bytes a span produces, and the member `code` refuses.
import { describe, expect, it } from "vitest";
import { block, validateBlock } from "../../src/data/viewmodel/index.js";
import type { TextSpan } from "../../src/data/viewmodel/index.js";
import { paint, paintRuns, withSpan } from "../../src/presentation/blocks/paint.js";
import { runsOf } from "../../src/presentation/runs.js";
import { resolveTone } from "../../src/presentation/theme/index.js";
import { SGR_RESET, sgr } from "../../src/terminal/escapes.js";
import { FULL_CAPS, measurable } from "../support/render.js";
import { caps, store } from "../support/theme.js";

/**
 * The attribute escapes of a rendered row, with the colour escapes removed.
 *
 * Ink re-encodes what `paint` wrote: one escape per attribute, closed in
 * reverse (`ESC[1m ESC[3m … ESC[23m ESC[22m`), colour as its own `38;2` / `39`
 * pair. Measured on the probe rather than assumed, and asserted in that form —
 * the numeric-order claim about `sgr()` is T1.19's, one layer down.
 */
function attrs(line: string): string {
  return line.replace(/\x1b\[(?:38;2;\d+;\d+;\d+|38;5;\d+|3[0-7]|9[0-7]|39|48;[^m]*|4[0-7]|10[0-7]|49)m/gu, "");
}

function noticeWith(spans: readonly TextSpan[]): readonly string[] {
  return measurable().renderToLines(block({ kind: "notice", id: "n", tone: "default", text: "a b c", spans }), 20);
}

describe("C04 §3am — spans, the contract", () => {
  it("T2.31 (C04 I85, C10 I33): the first frame in which a renderer writes italic — the bytes, in numeric order", () => {
    // `b` is painted inside an SGR whose parameters include 3, closed with a
    // reset before ` c`; the assertion is on the bytes and not on the field.
    const [italic] = noticeWith([{ from: 2, to: 3, italic: true }]);
    expect(attrs(italic ?? "")).toBe("a \x1b[3mb\x1b[23m c");
    const [bold] = noticeWith([{ from: 2, to: 3, bold: true }]);
    expect(attrs(bold ?? "")).toBe("a \x1b[1mb\x1b[22m c");
    const [underline] = noticeWith([{ from: 2, to: 3, underline: true }]);
    expect(attrs(underline ?? "")).toBe("a \x1b[4mb\x1b[24m c");
    const [all] = noticeWith([{ from: 2, to: 3, bold: true, italic: true, underline: true }]);
    expect(attrs(all ?? "")).toBe("a \x1b[1m\x1b[3m\x1b[4mb\x1b[24m\x1b[23m\x1b[22m c");
    expect(all, "the tone's colour is still on the row").toMatch(/\x1b\[38;/u);

    // The bytes `paint` wrote before Ink re-encoded them — numeric order, one
    // sequence, the tone's colour behind the attributes (C10 I33).
    const tone = resolveTone("default", store().current, FULL_CAPS);
    const merged = sgr(withSpan(tone, { bold: true, italic: true, underline: true }));
    expect(merged).toMatch(/^\x1b\[1;3;4;38;/u);
    expect(paint(paintRuns(runsOf("a b c", [{ from: 2, to: 3, bold: true, italic: true, underline: true }]), tone))).toBe(
      `${sgr(tone)}a ${SGR_RESET}${merged}b${SGR_RESET}${sgr(tone)} c${SGR_RESET}`,
    );
  });

  it("T2.32 (C04 I88): a `code` block carrying spans is refused, and a `raw` block carrying the same array is accepted", () => {
    const spans = [{ from: 0, to: 1, bold: true }];
    const code = validateBlock({ kind: "code", id: "c", language: "text", text: "abc", spans });
    expect(code.ok).toBe(false);
    if (!code.ok) expect(code.error.join(" ")).toMatch(/"spans" is refused on code .*\(C04 I88\)/u);
    expect(validateBlock({ kind: "raw", id: "r", text: "abc", spans }).ok).toBe(true);
  });
});

describe("C10 §4e — span attributes at one bit", () => {
  it("T2.25 (C10 I33): at depth 1 an emphasised tone absorbs a bold span, a normal one shows it, a dim one writes both in numeric order", () => {
    const theme = store().current;
    const at1 = caps(1);
    const ok = resolveTone("ok", theme, at1);
    expect(withSpan(ok, { bold: true })).toEqual({ bold: true });
    expect(withSpan(ok, { bold: true })).toEqual(ok);
    expect(withSpan(resolveTone("default", theme, at1), { bold: true })).toEqual({ bold: true });
    const muted = withSpan(resolveTone("muted", theme, at1), { bold: true });
    expect(muted).toEqual({ dim: true, bold: true });
    expect(sgr(muted)).toBe("\x1b[1;2m");
  });
});
