// C23 §7f — replace or float: does the answer need the prompt? (§101)
//
// **The rows are about a product of two axes, not about six consumers.** §101's
// table has *blocking* and *replacing* as independent, and a build that tied
// them satisfies four of its six cells — so what is asserted is the table, and
// the typed reply is the cell that separates the design from the tie.
import { describe, expect, it } from "vitest";

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

  it.todo("T1.69 (C23 I73, §7f) — not deferred on a component: the reply's composition lands in this MR's next commit: choosing reply… moves one question from replacing to floating, with its id and its owner unchanged");

  it.todo("T4.70 (C23 I74, C22 I80, §7f) — not deferred on a component: the prompt's slot lands in this MR's next commit: a replacing question leaves the region's height and the transcript's rows where they were");
});
