// C09 §7d — the trust boundary, over the registry rather than over the call sites.
//
// **The mechanism was never in question; its coverage was.** `stripControl`
// exists, is well argued and is called from nineteen modules — because nineteen
// authors remembered. A twentieth render path is invisible to any rule phrased
// over the nineteen, which is why this is a property over every registered kind
// and not an assertion that a function is called (C09 I89, `R-TRU-001`).
import { describe, expect, it } from "vitest";

import { CORPUS } from "../support/blocks.js";
import { measurable, visible } from "../support/render.js";
import { validateDocument } from "../../src/data/viewmodel/index.js";
import type { Block } from "../../src/data/viewmodel/index.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
/**
 * The single-byte C1 CSI introducer, `0x9b`.
 *
 * **In the payload because a mutation said it was not.** The filter covers
 * `0x7f`–`0x9f` and the sweep never carried a byte in that range, so narrowing
 * `isControl` to C0 alone changed nothing any row could see — a rule correct
 * about a class the corpus had no member of.
 */
const C1_CSI = String.fromCharCode(0x9b);

/**
 * Three classes in one string, because they fail differently.
 *
 * An SGR span repaints what follows it and survives a filter that only looks
 * for cursor motion; an erase-display clears the screen the transcript is drawn
 * on; an OSC sets the window title and is terminated by `BEL` rather than by a
 * letter, so a filter written against CSI alone lets it through whole.
 */
const PAYLOAD = `${ESC}[31mRED${ESC}[0m${ESC}[2J${ESC}]0;title${BEL}${C1_CSI}7m`;

/** The payload's own printable residue — what a *stripped* sequence leaves. */
const RESIDUE = "[31mRED[0m[2J]0;title7m";

/** The payload appended to every string in a block, ids and kinds excepted. */
const poison = (value: unknown): unknown => {
  if (typeof value === "string") return value + PAYLOAD;
  if (Array.isArray(value)) return value.map(poison);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === "kind" || k === "id" ? v : poison(v)]),
    );
  }
  return value;
};

describe("C09 §7d — the trust boundary", () => {
  it("T2.156 (C09 I89, §7d, R-TRU-001): no control byte survives a block's fields to its rendered lines", () => {
    const kit = measurable();

    // **The control first, and it is the one this row cannot do without.** A
    // sweep over a corpus that never carried the payload reports exactly the
    // clean page a sweep over a corpus that stripped it reports — and the
    // session probe this row grew out of was vacuous on its first run for
    // precisely that reason, reporting *no control bytes* about a frame that
    // held none of the payload at all. So the residue must be **present**: the
    // text arrived, and only its control bytes were taken.
    let sawResidue = 0;

    const leaked: string[] = [];
    for (const block of CORPUS) {
      // **`terminal` is exempt and is asserted by T2.156d, never by being
      // skipped** (C09 I56, I89). Its text is emitted unstripped so a child's
      // colour can cross as `runs`, and the exemption is paid for by C04 I110's
      // gate — which this corpus bypasses, building blocks directly.
      if (block.kind === "terminal") continue;
      const poisoned = poison(block) as Block;
      let lines: readonly string[];
      try {
        lines = kit.renderToLines(poisoned, 60);
      } catch (e) {
        leaked.push(`${block.kind}: threw — ${String(e).slice(0, 80)}`);
        continue;
      }
      const drawn = lines.join("\n");

      // **The frame's own SGR is not the subject.** A renderer emits colour
      // through `terminal/escapes.ts` and that is the clause `SS14` holds. What
      // must never appear is a control byte that came from a *field*, so the
      // payload's own sequences are named rather than every ESC being refused.
      const hits: string[] = [];
      if (drawn.includes(`${ESC}[2J`)) hits.push("erase-display");
      if (drawn.includes(`${ESC}]`)) hits.push("OSC introducer");
      if (drawn.includes(BEL)) hits.push("BEL");
      if (drawn.includes(`${ESC}[31m`)) hits.push("the payload's own SGR");
      if (drawn.includes(C1_CSI)) hits.push("C1 CSI");
      if (hits.length > 0) leaked.push(`${block.kind}: ${hits.join(", ")}`);

      // Some kinds draw no text at all — `rule`, `spacer` — and a kind that
      // shows nothing cannot leak. They are not excused from the sweep above;
      // they simply do not contribute to the control, which is counted over the
      // corpus rather than asserted per kind for that reason.
      if (visible(drawn).includes(RESIDUE.slice(0, 8))) sawResidue += 1;
    }

    expect(leaked, "a control byte reached the frame from a block's own fields").toEqual([]);
    expect(
      sawResidue,
      "the corpus carried the payload — without this, a sweep that dropped it reads identically",
    ).toBeGreaterThan(CORPUS.length / 2);
  });

  it("T2.156d (C09 I89, I56, §7d, C04 I110): the exempt kind's gate refuses what the sweep would have carried", () => {
    // **The half of I89 that is not optional.** `terminal` is exempt from
    // `stripControl` (I56) because a child's screen carries the child's colour
    // as `runs`, and a kind that strips cannot carry it. The exemption is paid
    // for one layer down, and **a skipped kind and a gated kind read the same
    // in a green run** — so the payment is asserted here rather than assumed.
    //
    // The sweep above reported this kind as leaking on its first run, and the
    // sweep was what was wrong: it builds blocks directly and so never passes
    // the boundary the exemption is paid at. A fix was written into `spansOf`
    // and reverted; it would have taken the colour out of a live terminal to
    // close a hole no document can reach.
    const doc = (text: string): unknown => ({
      schema: "tui.view/1",
      command: "x",
      status: "ok",
      meta: {},
      blocks: [{ kind: "terminal", id: "t", cols: 80, screen: "lines", lines: [{ text }] }],
    });
    const errorsOf = (text: string): readonly string[] => {
      const result = validateDocument(doc(text) as never) as { ok: boolean; error?: readonly string[] };
      return result.ok ? [] : (result.error ?? []);
    };

    // **Read as the difference the line makes, not as document validity.** The
    // envelope here is a fixture and carries its own complaints; what this row
    // is about is the one error the *line* produces, so the gate's own message
    // is the subject and everything else is held constant and compared.
    const gateErrors = (text: string): readonly string[] =>
      errorsOf(text).filter((e) => e.includes("C04 I110"));
    const otherErrors = (text: string): readonly string[] =>
      errorsOf(text).filter((e) => !e.includes("C04 I110"));

    const clean = "plain text";
    for (const [label, payload] of [
      ["an ESC introducer", `x${ESC}[2Jy`],
      ["a C1 introducer", `x${C1_CSI}31my`],
      ["a BEL", `x${BEL}y`],
    ] as const) {
      expect(gateErrors(payload).length, `${label} is refused by C04 I110`).toBe(1);
      expect(
        otherErrors(payload),
        `${label} changes nothing but the line — so the row is about the control and not the envelope`,
      ).toEqual(otherErrors(clean));
    }

    // **The control, and it is the direction that matters.** A gate that
    // refused every line would satisfy the three rows above exactly, so a clean
    // line must produce no C04 I110 error — otherwise this says nothing about
    // controls, only that the validator complains.
    expect(gateErrors(clean), "a clean line is not refused by the gate").toEqual([]);
  });

  it("T2.156b (C09 I89, §7d): the sweep can see a leak — the fabricated violation", () => {
    // **The rule's own check, and it is not about the tree.** The assertion
    // above is an absence, and an absence assertion is satisfied by a corpus
    // that renders nothing, a matcher that looks for the wrong bytes and a tree
    // that is correct, identically. This renders the payload through a path
    // that does *not* strip and asserts the matcher fires — so a green run
    // above is about `stripControl` being reached rather than about the search.
    const drawn = `a line ${PAYLOAD} and more`;
    const hits: string[] = [];
    if (drawn.includes(`${ESC}[2J`)) hits.push("erase-display");
    if (drawn.includes(`${ESC}]`)) hits.push("OSC introducer");
    if (drawn.includes(BEL)) hits.push("BEL");
    if (drawn.includes(`${ESC}[31m`)) hits.push("the payload's own SGR");
    if (drawn.includes(C1_CSI)) hits.push("C1 CSI");
    expect(hits.sort()).toEqual([
      "BEL",
      "C1 CSI",
      "OSC introducer",
      "erase-display",
      "the payload's own SGR",
    ]);

    // And the residue is what the same string looks like once stripped, which
    // is the value the control above compares against — written out rather than
    // computed, so a change to `stripControl`'s ruling on any of these bytes
    // fails here and is read rather than absorbed.
    expect(RESIDUE).toBe(PAYLOAD.replaceAll(ESC, "").replaceAll(BEL, "").replaceAll(C1_CSI, ""));
  });
});
