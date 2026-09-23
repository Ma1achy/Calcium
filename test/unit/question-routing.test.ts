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
    const world = (): Readonly<{
      confirm: ReturnType<typeof createConfirmHost>;
      overlays: ReturnType<typeof createOverlayManager>;
      type: (text: string) => void;
      drafted: () => string;
      press: (name: string) => boolean;
    }> => {
      const overlays = createOverlayManager({
        registry: { measureSequence: (b) => b.length }, // cells-ok — a row count
      });
      let draft = "";
      const confirm = createConfirmHost({
        overlays,
        anchor: () => ({ row: 20, rows: 1 }),
        draft: () => draft,
        clearDraft: () => {
          draft = "";
        },
        overlayRegion: () => ({ width: 80, height: 24 }),
        invalidate: () => undefined,
      });
      return {
        confirm,
        overlays,
        type: (text) => {
          draft = text;
        },
        drafted: () => draft,
        press: (name) => confirm.answerHandler()?.({ kind: "key", key: { name } } as InputEvent) ?? false,
      };
    };

    const CHOICES = [
      { key: "a", label: "approve" },
      { key: "d", label: "deny", default: true as const },
      { key: "r", label: "reply…", reply: true as const },
    ];

    // ---- the transition -----------------------------------------------------
    const w = world();
    const answer = w.confirm.ask({ question: "may I?", choices: CHOICES });

    const opened = w.overlays.stack.find((l) => l.id === "confirm");
    expect(opened, "the question is up").toBeDefined();
    expect(w.confirm.replacing, "and it replaces the prompt").not.toBeNull();

    expect(w.press("r"), "reply… is consumed").toBe(true);

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
    expect(w.drafted(), "and the prompt clears, as it does for a submitted line").toBe("");

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
    const escaped = e.confirm.ask({ question: "may I?", choices: CHOICES });
    expect(e.press("r")).toBe(true);
    e.type("half a thought");
    expect(e.press("escape")).toBe(true);
    await expect(escaped, "the default's key and no text").resolves.toEqual({ key: "d" });
    expect(e.overlays.stack, "and the escape takes it down too").toHaveLength(0);
  });

});
