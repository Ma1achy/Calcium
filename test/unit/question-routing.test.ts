// C23 §7f — replace or float: does the answer need the prompt? (§101)
//
// **The rows are about a product of two axes, not about six consumers.** §101's
// table has *blocking* and *replacing* as independent, and a build that tied
// them satisfies four of its six cells — so what is asserted is the table, and
// the typed reply is the cell that separates the design from the tie.
import { describe, expect, it } from "vitest";

import { createConfirmHost } from "../../src/shell/confirm.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import { questionConsumer, routingFor, type QuestionConsumer } from "../../src/shell/question-routing.js";

const ALL: readonly QuestionConsumer[] = ["approval", "choice", "reply", "peek", "completion", "find"];

/** The region the question is placed against, named so the bound can be read against it. */
const REGION = { width: 80, height: 24 } as const;

/** A payload no ordinary region holds — which is why the inspection exists. */
const PATCH = Array.from({ length: 60 }, (_, i) => `  ${String(i)} - let inQuote = false;`).join("\n");

const INSPECTABLE = [
  { key: "n", label: "no", default: true as const },
  { key: "y", label: "yes" },
  { key: "s", label: "show full diff", inspect: true as const },
];

/** What the layer says, flattened. */
const drawn = (w: Readonly<{ overlays: { stack: readonly { id: string; content: unknown }[] } }>): string =>
  JSON.stringify(w.overlays.stack.find((l) => l.id === "confirm")?.content ?? "");

/**
 * Is the question suspended in an inspection?
 *
 * **Read off the bounded box and not off the payload's text.** The payload is
 * drawn with the question too whenever it fits — `render` replaces it only
 * when the region cannot hold it — so *the patch is on screen* is true before
 * anything has been inspected, and a row asserting it measures nothing. What
 * is the inspection's alone is that the source is in a `scroll` box, which is
 * how it is bounded at all.
 */
const inspecting = (
  w: Readonly<{ overlays: { stack: readonly { id: string; content: unknown }[] } }>,
): boolean => sourceHeight(w) !== null;

/**
 * The bounded source's height in rows, or `null` when it is not open.
 *
 * **The number, not the presence.** A box that exists and is as tall as the
 * patch is not bounded: `composite.ts` writes `lines[0 … height)`, so the
 * reader gets the head of the diff and no bottom border — which is the exact
 * failure `render`'s cut arm was written against, arriving one level down.
 */
const sourceHeight = (
  w: Readonly<{ overlays: { stack: readonly { id: string; content: unknown }[] } }>,
): number | null => {
  const found = /"id":"confirm-source","height":(\d+)/u.exec(drawn(w));
  return found === null ? null : Number(found[1]);
};

const world = (): Readonly<{
  confirm: ReturnType<typeof createConfirmHost>;
  overlays: ReturnType<typeof createOverlayManager>;
  type: (text: string) => void;
  line: () => string;
  drafted: () => string;
  press: (name: string) => boolean;
}> => {
  const overlays = createOverlayManager({
    registry: { measureSequence: (b) => b.length }, // cells-ok — a row count
  });
  let draft = "";
  let held = "";
  const confirm = createConfirmHost({
    overlays,
    anchor: () => ({ row: 20, rows: 1 }),
    draft: () => draft,
    holdDraft: () => {
      held = draft;
      draft = "";
    },
    restoreDraft: () => {
      draft = held;
      held = "";
    },
    overlayRegion: () => REGION,
    invalidate: () => undefined,
  });
  return {
    confirm,
    overlays,
    type: (text) => {
      draft = text;
    },
    line: () => draft,
    drafted: () => draft,
    press: (name) => confirm.answerHandler()?.({ kind: "key", key: { name } } as InputEvent) ?? false,
  };
};

describe("C23 §7f — replace or float", () => {
  it("T1.68 (C23 I73, §7f, §101): the table is total and its two axes are independent", () => {
    // §101's table, transcribed — the only place in the tree it is written
    // twice, and deliberately: a row derived from the implementation agrees
    // with it by construction and measures nothing.
    const DESIGN: Readonly<Record<QuestionConsumer, Readonly<{ replaces: boolean; blocking: boolean }>>> = {
      approval: { replaces: true, blocking: true },
      choice: { replaces: true, blocking: true },
      reply: { replaces: false, blocking: true },
      peek: { replaces: false, blocking: false },
      completion: { replaces: false, blocking: false },
      find: { replaces: false, blocking: false },
    };
    for (const c of ALL) {
      const got = routingFor(c);
      expect({ replaces: got.replaces, blocking: got.blocking }, c).toEqual(DESIGN[c]);
    }

    // **The independence, asserted as the independence.** Every cell above is
    // also satisfied by a build that ties the two — `blocking === replaces`
    // agrees on four of the six — so what separates the design from the tie is
    // that both combinations of *blocks* with *floats* occur.
    const cells = ALL.map((c) => `${String(routingFor(c).replaces)}/${String(routingFor(c).blocking)}`);
    expect(new Set(cells), "blocking is not a function of replacing").toEqual(
      new Set(["true/true", "false/true", "false/false"]),
    );
    expect(cells.filter((x) => x === "false/true"), "the typed reply blocks and floats").toHaveLength(1);

    // **An owner is waiting, so nothing that blocks is escapable** — which is
    // the third concept `dismissable` used to carry, and is the reason a typed
    // reply never becomes dismissable however long it floats.
    for (const c of ALL) {
      if (routingFor(c).blocking) expect(routingFor(c).dismissal, c).toBe("answer");
      else expect(routingFor(c).dismissal, c).not.toBe("answer");
    }

    // **A peek closes on focus and nothing else does.** It is a projection of
    // focus; the other two floating consumers are things a reader opened.
    expect(ALL.filter((c) => routingFor(c).dismissal === "focus")).toEqual(["peek"]);

    // `approval` and `choice` are named apart by the design and route
    // identically. Asserted as equal rather than each asserted, so a branch on
    // the difference goes red here rather than shipping.
    expect(routingFor("approval"), "the design names them apart and nothing branches on it").toEqual(
      routingFor("choice"),
    );
  });

  it("T1.68b (C23 I73, §7f): a question's row is read off its state, never declared", () => {
    const two = [{ key: "y", label: "yes" }, { key: "n", label: "no", default: true as const }];
    const many = [...two, { key: "r", label: "reply…", reply: true as const }];

    expect(questionConsumer(two, false), "two choices is §101's approval").toBe("approval");
    expect(questionConsumer(many, false), "more is its choice").toBe("choice");
    // **The transition, and it is the whole of *derived rather than declared*.**
    // The same question with the same choices answers a different row once the
    // reader has picked `reply…` — so the placement follows the state and a
    // caller could not have declared it when it opened.
    expect(questionConsumer(many, true), "and choosing reply… moves the row").toBe("reply");
    expect(routingFor(questionConsumer(many, false)).replaces, "it replaced").toBe(true);
    expect(routingFor(questionConsumer(many, true)).replaces, "and now it floats").toBe(false);
  });

  it("T1.69 (C23 I73, I36, §7f): reply… moves one question, and the answer carries both facts", async () => {
    const CHOICES = [
      { key: "a", label: "approve" },
      { key: "d", label: "deny", default: true as const },
      { key: "r", label: "reply…", reply: true as const },
    ];

    // ---- the transition -----------------------------------------------------
    const w = world();
    // **A draft the reader had already typed when the question arrived.** An
    // approval can be raised by a verb that is still running, so the prompt is
    // not reliably empty — and this is the line the borrow has to give back
    // (C17 I28, C23 I28).
    w.type("git push --force");
    const answer = w.confirm.ask({ question: "may I?", choices: CHOICES });

    const opened = w.overlays.stack.find((l) => l.id === "confirm");
    expect(opened, "the question is up").toBeDefined();
    expect(w.confirm.replacing, "and it replaces the prompt").not.toBeNull();

    expect(w.press("r"), "reply… is consumed").toBe(true);
    // **Taken, so the reply is composed into an empty line** rather than on
    // top of what the reader had. A build that left the draft standing makes
    // the reply's first keystroke an edit of somebody else's sentence.
    expect(w.line(), "the borrow starts empty").toBe("");

    // **The identity, which is the discriminator.** A build that popped the
    // layer and pushed a second one draws the same picture and leaves the
    // caller below awaiting a promise nothing will resolve.
    const stack = w.overlays.stack.filter((l) => l.id === "confirm");
    expect(stack, "one layer, not two").toHaveLength(1);
    expect(w.confirm.open, "and the same owner is still awaiting it").toBe(true);
    expect(w.confirm.replacing, "it floats now, and the prompt is live beneath").toBeNull();

    // **Not consumed while composing** — which is what *float* means to a key.
    // C16 hands a false back down the ladder to the prompt (router.ts:395).
    expect(w.press("y"), "a letter belongs to the prompt, not to the question").toBe(false);
    expect(w.press("down"), "and so does a motion in the line").toBe(false);

    w.type("because the tests say so");
    expect(w.press("return"), "⏎ answers").toBe(true);
    await expect(answer, "both facts").resolves.toEqual({
      key: "r",
      text: "because the tests say so",
    });
    // **Given back exactly, on the answering path** (C17 I28). The reply's own
    // line clears because it *became* the line, and the reader's comes back
    // because it never did — one restore does both, which is why C23 I28 is
    // not weakened by the borrow.
    expect(w.line(), "the reader's line is back").toBe("git push --force");

    // **The assertion that catches a pop-and-push, and the first three did
    // not.** A transition that disposed the layer and pushed a replacement
    // leaves one layer with the same id on the stack and an owner still
    // awaiting, so every identity assertion above reads green — the two
    // pictures are the same picture. What differs is what `settle` can reach:
    // it disposes the handle `ask` captured, which the second push does not
    // own, so the question stays on screen after it has been answered.
    expect(w.overlays.stack, "answering takes the question down").toHaveLength(0);
    expect(w.confirm.open, "and the host holds no handler").toBe(false);

    // ---- the other arm ------------------------------------------------------
    // **`text` is a record of what happened, not a field always filled.** An
    // escape out of the reply state is still an escape: `""` would say the
    // reader replied with nothing.
    const e = world();
    e.type("git push --force");
    const escaped = e.confirm.ask({ question: "may I?", choices: CHOICES });
    expect(e.press("r")).toBe(true);
    e.type("half a thought");
    expect(e.press("escape")).toBe(true);
    await expect(escaped, "the default's key and no text").resolves.toEqual({ key: "d" });
    expect(e.overlays.stack, "and the escape takes it down too").toHaveLength(0);
    // **The borrow is undone on this path too**, and it is the path where a
    // restore written on the `⏎` arm alone loses the draft: the reader changed
    // their mind about typing, which is exactly when they still want their line.
    expect(e.line(), "the reader's line survives the escape").toBe("git push --force");
  });

  it("T1.70 (C23 I75, I36, §051, `R-QST-002`): an inspection suspends, and the question settles exactly once", async () => {
    const w = world();
    // **The payload is what the inspection exists to reach.** `render`'s cut
    // arm replaces it with `...` when it does not fit, and this row is about
    // the way back to it.
    const answer = w.confirm.ask({
      question: "apply this change?",
      detail: { kind: "raw", id: "patch", text: PATCH },
      choices: INSPECTABLE,
    });

    // **Settled exactly once, counted rather than awaited.** A promise cannot
    // resolve twice, so an inspection that settled and re-asked would hand the
    // *owner* an answer while the reader was still reading — visible only as
    // this flag flipping early.
    let settlements = 0;
    void answer.then(() => {
      settlements += 1;
    });
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };

    const opened = w.overlays.stack.find((l) => l.id === "confirm");
    expect(opened, "the question is up").toBeDefined();

    expect(w.press("s"), "the inspection choice is consumed").toBe(true);
    await flush();
    expect(settlements, "suspending is not answering").toBe(0);
    expect(w.confirm.open, "and the owner is still awaiting").toBe(true);
    expect(w.overlays.stack.filter((l) => l.id === "confirm"), "one layer, not two").toHaveLength(1);
    expect(inspecting(w), "the source is open").toBe(true);
    expect(drawn(w), "and it is the payload").toContain("inQuote");
    // **Bounded by the region, which is the half a presence check misses.**
    // The payload is 60 rows; a box that took all of them draws past the
    // bottom of the screen and loses its own way back.
    const height = sourceHeight(w) ?? 0; // cells-ok — a row count
    expect(height, "the source is bounded by the region").toBeLessThanOrEqual(REGION.height);
    expect(height, "and it is worth opening").toBeGreaterThan(1);

    // **Esc leaves the inspection and not the request** (`R-BLK-794`). A build
    // that resolved here answers a question the reader was still reading, and
    // the frames it drew on the way are identical.
    expect(w.press("escape"), "escape is the inspection's").toBe(true);
    await flush();
    expect(settlements, "and it did not resolve the question").toBe(0);
    expect(w.confirm.open, "the same unresolved question").toBe(true);
    expect(drawn(w), "which is drawn again, choices and all").toContain("apply this change?");
    expect(inspecting(w), "with the source closed").toBe(false);

    // Only now does it resolve, and only once across the whole sequence.
    expect(w.press("y")).toBe(true);
    await expect(answer).resolves.toEqual({ key: "y" });
    await flush();
    expect(settlements, "one settlement across suspend, escape and answer").toBe(1);
    expect(w.overlays.stack, "and the question is gone").toHaveLength(0);
  });

  it("T1.70b (C23 I75, `R-QST-004`): the inspection has one route in, and it is a choice", async () => {
    const w = world();
    const answer = w.confirm.ask({
      question: "apply this change?",
      detail: { kind: "raw", id: "patch", text: PATCH },
      choices: INSPECTABLE,
    });

    // **No second key-only path.** A chord that opened the evidence without
    // appearing among the choices is invisible at the one moment it matters —
    // a reader who cannot see the payload cannot see that there is a way to.
    for (const name of ["tab", "space", "d", "i", "v", "?"]) {
      w.press(name);
      expect(inspecting(w), `\`${name}\` must not open the source`).toBe(false);
    }

    // The control: the choice's own accelerator does, so the loop above is
    // reading a closed door rather than a broken handle.
    expect(w.press("s")).toBe(true);
    expect(inspecting(w), "the choice opens it").toBe(true);

    w.press("escape");
    w.press("n");
    await expect(answer).resolves.toEqual({ key: "n" });
  });

});
