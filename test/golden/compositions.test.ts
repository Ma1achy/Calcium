// C10 §4k — the six compositions, as frames rather than as a classification.
//
// **§4k.2 rules all six and this file draws the ones a producer can construct**,
// generated from one case table (`test/support/compositions.ts`) that C10 T2.48
// reads too. A frame that fakes a state is not drawn: a fixture has to be shown
// to respond to the thing under test before it is asserted against
// (`test/support/README.md`), so each snapshot carries the frame with each fact
// removed beside the frame with all of them — the response, in the record. A
// case no producer can construct is `owed` with its reason, and T2.48 attempts
// it rather than a comment promising to.
//
// **The snapshot is a frame AND a report, and the report is the point.** These
// compositions are about *which fact took the ground*, which is colour — so a
// frame with its SGR stripped, which is what every other golden in this
// directory holds, cannot show the thing under test at all. A raw SGR frame can,
// and is unreadable. So each snapshot carries the visible frame, so the marks
// can be read, and beside it the ground each run took **resolved back to its
// token name**, so a reader checks `selection` against `focusGround` rather than
// two escape sequences.
//
// **Three rungs, because the ruling is about carriers and a carrier dies at a
// rung.** 24-bit is where two grounds exist; 1-bit is where they do not and the
// mark is the whole of it; ASCII is where the mark itself is substituted.
import { describe, expect, it } from "vitest";

import { COMPOSITIONS, RUNGS } from "../support/compositions.js";
import { DARK_THEME, visible } from "../support/render.js";
import { background, tone } from "../../src/presentation/blocks/paint.js";
import { sgr } from "../../src/terminal/escapes.js";
import type { TerminalCapabilities } from "../../src/terminal/capabilities.js";

const SGR_RE = /\u001b\[([0-9;]*)m/u;
const SPLIT_RE = /(\u001b\[[0-9;]*m)/u;

/**
 * The surfaces a run could be standing on, in R-STA-002's own order.
 *
 * Resolved through `background` rather than written out, so a theme edit moves
 * the report with the tree instead of turning every frame into a mismatch about
 * a hex value.
 */
const GROUNDS = [
  "surface.selection",
  "surface.focusGround",
  "surface.diffAdd",
  "surface.diffRemove",
  "surface.bgElev",
] as const;

/** The tones a run could be inked in, so the report names one rather than a hex. */
const TONES = ["error", "ok", "warn", "accent", "default", "dim", "muted", "info", "meta", "identifier"] as const;

/**
 * The SGR channels a sequence leaves standing, walked parameter by parameter.
 *
 * **A `48` carries its own `38`, and the first two forms of this file did not
 * know it.** `48;2;38;64;87` is the selection ground in `dark` — blue 87, green
 * 64, **red 38** — and a reader testing `params.includes("38")` calls that a
 * foreground opener, then fails to name the colour it just invented and reports
 * `-`. The frame was correct at the time and the report said the selected row
 * had no ink at all. A parameter list is a sequence with per-parameter arity,
 * not a set, and reading it as a set is how a instrument invents a defect
 * (`applySgr` in `test/support/styled-screen.ts` is the same walk, written
 * first).
 */
function channels(
  params: string,
  cur: Readonly<{ fg: string; bg: string; attrs: readonly string[] }>,
): Readonly<{ fg: string; bg: string; attrs: readonly string[] }> {
  let { fg, bg } = cur;
  let attrs = [...cur.attrs];
  const held = params === "" ? ["0"] : params.split(";");
  for (let i = 0; i < held.length; i += 1) {
    const p = held[i] as string;
    if (p === "0") {
      fg = "";
      bg = "";
      attrs = [];
    } else if (p === "38" || p === "48") {
      const take = held[i + 1] === "2" ? 5 : held[i + 1] === "5" ? 3 : 1;
      const value = held.slice(i, i + take).join(";");
      if (p === "38") fg = value;
      else bg = value;
      i += take - 1;
    } else if (p === "39") fg = "";
    else if (p === "49") bg = "";
    else if (p === "22") attrs = attrs.filter((a) => a !== "1" && a !== "2");
    else if (p === "27") attrs = attrs.filter((a) => a !== "7");
    else if (["1", "2", "3", "4", "7"].includes(p) && !attrs.includes(p)) attrs.push(p);
  }
  return { fg, bg, attrs };
}

/** The SGR parameters a style resolves to, without the CSI and the `m`. */
function paramsOf(style: Parameters<typeof sgr>[0]): string {
  return sgr(style).replace(/^\u001b\[/u, "").replace(/m$/u, "");
}

/**
 * The token name of the ground a run is painted on, or `page` for none.
 */
function groundOf(bg: string, attrs: readonly string[], caps: TerminalCapabilities): string {
  if (bg !== "") {
    for (const name of GROUNDS) {
      const want = paramsOf(background(name, DARK_THEME, caps));
      if (want !== "" && want === bg) return name.replace("surface.", "");
    }
  }
  // **At 1-bit the attributes are the carriers, so all of them are named.** A
  // ground resolves to `NO_STYLE` there and an attribute is the honest answer,
  // but naming only the first of them hides the second: the selected row is
  // `inverse` for its whole extent and the failed cell is `bold` inside it, and
  // a label reporting `inverse` alone says the two cells are drawn the same
  // way. They are not, and at that rung the weight is the whole difference.
  const named = ["7", "1", "2", "3", "4"]
    .filter((a) => attrs.includes(a))
    .map((a) => ({ "7": "inverse", "1": "bold", "2": "dim", "3": "italic", "4": "underline" })[a]);
  return named.length === 0 ? "page" : named.join("+");
}

/**
 * The token name of a run's ink, or `-` when nothing set one.
 *
 * **Asked on the ground the run is standing on** (C10 I48). A tone resolves
 * *against* the surface under it, so `tone.error` is `#f05a5a` on the page and
 * `#ff9b91` on `dark`'s selection — and a reader that only ever asks about the
 * page cannot name the second. That is the whole reason the report is worth
 * having: it is the one place the two values are visible side by side.
 */
function inkOf(fg: string, ground: string, caps: TerminalCapabilities): string {
  if (fg === "") return "-";
  const on = ground === "page" || ground === "inverse" || ground === "bold" ? undefined : ground;
  for (const name of TONES) {
    if (paramsOf(tone(name, DARK_THEME, caps, on)) === fg) return name;
  }
  return "-";
}

/**
 * Every run of a row as `ground/ink:text`, so the report is one line per row.
 *
 * **SGR is cumulative and the first form of this read it as a stamp.** A
 * background opened by `48;2;r;g;b` stays open until `49` or `0`, and a bare
 * `39` resets the *foreground* and leaves it standing — so a reader taking each
 * sequence as the whole state reported the ground closing three cells into a row
 * the terminal paints to its end. It said *the selection stops at the name
 * cell*, which is a defect, and the frame does not have it. A reader of a
 * stateful protocol has to carry the state.
 */
function runsOf(line: string, caps: TerminalCapabilities): string {
  const out: string[] = [];
  let style = { fg: "", bg: "", attrs: [] as readonly string[] };
  let label = "page/-";
  let text = "";
  const close = (): void => {
    if (text.trim() !== "") out.push(`${label}:${JSON.stringify(text)}`);
    text = "";
  };
  for (const part of line.split(SPLIT_RE)) {
    if (part === "") continue;
    if (part.startsWith("\u001b[")) {
      style = channels(SGR_RE.exec(part)?.[1] ?? "", style);
      const ground = groundOf(style.bg, style.attrs, caps);
      const next = `${ground}/${inkOf(style.fg, ground, caps)}`;
      if (next !== label) {
        close();
        label = next;
      }
      continue;
    }
    text += part;
  }
  close();
  return out.length === 0 ? "(blank)" : out.join(" ");
}

describe("C10 §4k — the compositions, as frames", () => {
  for (const c of COMPOSITIONS.filter((k) => k.owed === undefined)) {
    for (const rung of RUNGS) {
      it(`case ${String(c.row)} — ${c.name}, at ${rung.name}`, () => {
        const all = new Set(c.facts);
        const lines = c.draw(rung.capabilities, all);
        const without = c.facts.map((fact) => {
          const on = new Set(all);
          on.delete(fact);
          return [fact, c.draw(rung.capabilities, on)] as const;
        });
        // **Every fact moves the frame**, asserted here as well as in T2.48 so a
        // snapshot is never re-accepted over a fact that stopped answering.
        for (const [fact, rest] of without) {
          expect(rest, `removing ${fact} changes the frame`).not.toEqual(lines);
        }
        if (c.row === 4) {
          // R-FOC-004: focus moves the frame's ink and no glyph or width — the
          // data keeps its reading. Both halves, or a focus that did nothing
          // passes the first.
          const rest = without.find(([fact]) => fact === "focus")![1];
          expect(rest.map(visible), "focus changes no glyph and no width").toEqual(lines.map(visible));
        }
        expect(
          [
            "-- the frame",
            ...lines.map((l) => `  ${visible(l)}`),
            "",
            "-- which fact took the ground, run by run",
            ...lines.map((l) => `  ${runsOf(l, rung.capabilities)}`),
            ...without.flatMap(([fact, rest]) => [
              "",
              `-- without ${fact}, run by run`,
              ...rest.map((l) => `  ${runsOf(l, rung.capabilities)}`),
            ]),
            "",
            `-- the ruling (C10 §4k.2 row ${String(c.row)})`,
            `  ${c.ruling}`,
            ...(c.notes === undefined
              ? []
              : ["", "-- and what drawing it found, kept because the record is the point", ...c.notes.map((n) => `  ${n}`)]),
          ].join("\n"),
        ).toMatchSnapshot();
      });
    }
  }

  /**
   * The compositions with no subject, and the change that would give each one.
   *
   * **Not a comment**, because a comment is where a deferral goes to stop being
   * watched. The snapshot is what a reader of this directory sees when they ask
   * why it holds fewer than six; C10 T2.48 is what goes red when one of them
   * becomes constructible.
   */
  it("the owed compositions name the change that would give each a subject", () => {
    const owed = COMPOSITIONS.filter((c) => c.owed !== undefined);
    expect(owed.map((c) => `${String(c.row)} · ${c.name}\n    ${c.owed!}`).join("\n")).toMatchSnapshot();
    expect(COMPOSITIONS, "§4k.2 rules six").toHaveLength(6);
  });
});
