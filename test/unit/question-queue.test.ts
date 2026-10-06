// C23 §7g — a question's life: the reply, the queue, the three resolutions.
//
// **Driven through `answerHandler`, never by calling `settle`.** The host's
// rules are what a key means in a state, and a row that reached past the
// handler would pass on the day the classification was wrong — which is
// T6.106's mutation.
import { describe, expect, it } from "vitest";

import { createConfirmHost } from "../../src/shell/confirm.js";
import { approvalPrompt, DENY_KEY } from "../../src/shell/documents.js";
import { createOverlayManager } from "../../src/viewport/overlay/index.js";
import type { InputEvent } from "../../src/interaction/router/types.js";
import type { AskAnswer, AskOptions, Choice } from "../../src/shell/local/registry.js";
import { buildSession } from "../support/session.js";
import { localContext } from "../../src/testing/producer-context.js";
import { fakeStdin } from "../support/fake-terminal.js";

const REGION = { width: 80, height: 24 } as const;

const YES_NO_REPLY: readonly Choice[] = [
  { key: "n", label: "no", default: true },
  { key: "y", label: "yes" },
  { key: "r", label: "reply…", reply: true },
];

/** A chip's sentinel, as the editor holds it, and what it stands for. */
const CHIP = "";
const CHIP_CONTENT = "line one\nline two";
const CHIP_LABEL = "[#1 pasted]";

type World = Readonly<{
  confirm: ReturnType<typeof createConfirmHost>;
  overlays: ReturnType<typeof createOverlayManager>;
  /** The prompt's line as the editor holds it — a chip is its sentinel. */
  line: () => string;
  type: (text: string) => void;
  press: (name: string) => boolean;
  asked: string[];
  answered: string[];
  expired: string[];
  /** Fire every timer armed and not disposed, in the order armed. */
  fire: () => void;
  /** How many timers are armed and not disposed. */
  armed: () => number;
  title: () => string | null;
}>;

const world = (): World => {
  const overlays = createOverlayManager({
    registry: { measureSequence: (b) => b.length }, // cells-ok — a row count
  });
  let line = "";
  let held: string | null = null;
  const asked: string[] = [];
  const answered: string[] = [];
  const expired: string[] = [];
  const timers: { fn: () => void; live: boolean }[] = [];
  const confirm = createConfirmHost({
    overlays,
    anchor: () => ({ row: 20, rows: 1 }),
    // The editor's `resolved` and its drawn line, over the one sentinel.
    draft: () => line.replaceAll(CHIP, CHIP_CONTENT),
    drawn: () => line.replaceAll(CHIP, CHIP_LABEL),
    holdDraft: () => {
      held = line;
      line = "";
    },
    restoreDraft: () => {
      line = held ?? "";
      held = null;
    },
    keepReply: () => line,
    resumeReply: (kept) => {
      line = kept as string;
    },
    schedule: (fn) => {
      const t = { fn, live: true };
      timers.push(t);
      return { [Symbol.dispose]: () => void (t.live = false) };
    },
    expired: (opts, ms) => expired.push(`${opts.question} after ${String(ms / 1000)}s`),
    announce: { asked: (opts) => asked.push(opts.question), answered: (label) => answered.push(label) },
    overlayRegion: () => REGION,
    invalidate: () => undefined,
  });
  return {
    confirm,
    overlays,
    line: () => line,
    type: (text) => {
      line = text;
    },
    press: (name) => {
      const verdict = confirm.answerHandler()?.({ kind: "key", key: { name } } as InputEvent) ?? false;
      return verdict !== false && verdict !== "pass";
    },
    asked,
    answered,
    expired,
    fire: () => {
      for (const t of [...timers]) {
        if (!t.live) continue;
        t.live = false;
        t.fn();
      }
    },
    armed: () => timers.filter((t) => t.live).length,
    title: () => {
      const found = /"title":"([^"]*)"/u.exec(JSON.stringify(overlays.stack.find((l) => l.id === "confirm")?.content ?? ""));
      return found === null ? null : found[1]!;
    },
  };
};

/** Whether a promise has settled, read after the microtasks it queued. */
const settled = async (p: Promise<unknown>): Promise<boolean> => {
  let done = false;
  void p.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

const ask = (w: World, question: string, extra: Partial<AskOptions> = {}): Promise<AskAnswer> =>
  w.confirm.ask({ question, choices: YES_NO_REPLY, ...extra });

describe("C23 §7g — the reply, the queue, the three resolutions", () => {
  it("T1.99 (C23 I89): esc in a typed reply returns to the choices, restores the draft, and keeps the composed text for the next reply…", async () => {
    const w = world();
    w.type("the reader's own line");
    const answer = ask(w, "Proceed?");

    expect(w.press("r"), "reply… is consumed").toBe(true);
    expect(w.confirm.composing).toBe(true);
    expect(w.line(), "the prompt is borrowed, empty").toBe("");
    w.type("because");

    expect(w.press("escape"), "esc is consumed").toBe(true);
    // **Back one level, not an answer** — the whole state, asserted together.
    expect(await settled(answer), "unresolved").toBe(false);
    expect(w.confirm.open, "still open").toBe(true);
    expect(w.confirm.composing, "at its choices").toBe(false);
    expect(w.confirm.replacing, "and replacing the prompt again (C23 I73)").not.toBeNull();
    expect(w.line(), "the held draft is back").toBe("the reader's own line");
    expect(w.answered, "nothing announced as answered").toEqual([]);

    // `reply…` again puts the composed text back, and the draft is held again.
    w.press("r");
    expect(w.line(), "what was composed comes back").toBe("because");
    expect(w.press("return")).toBe(true);
    await expect(answer).resolves.toEqual({ key: "r", text: "because", outcome: "answered" });
    expect(w.line(), "and the reader's line after the answer").toBe("the reader's own line");

    // **`esc` at the choices still answers** (C23 I36) — the control.
    const second = ask(w, "Again?");
    w.press("escape");
    await expect(second).resolves.toEqual({ key: "n", outcome: "answered" });
  });

  it("T1.100 (C23 I90): a reply holding a chip answers with the chip's content, and is announced as drawn", async () => {
    const w = world();
    const answer = ask(w, "Why?");
    w.press("r");
    w.type(`see ${CHIP} here`);
    w.press("return");
    await expect(answer).resolves.toEqual({ key: "r", text: `see ${CHIP_CONTENT} here`, outcome: "answered" });
    expect(w.answered, "the linear stream reads the label, not the paste").toEqual([`see ${CHIP_LABEL} here`]);
  });

  it("T1.101 (C23 I91): a second question waits; the first's title counts it; the first answered, the second is pushed under the same id and announced once", async () => {
    const w = world();
    const pushes: string[] = [];
    w.overlays.subscribe((c) => {
      if (c.kind === "push" || c.kind === "pop" || c.kind === "dismiss") pushes.push(`${c.kind}:${c.id}`);
    });
    const q1 = ask(w, "First?");
    expect(w.title()).toBe("Confirm");
    const q2 = ask(w, "Second?");

    // Waiting: nothing pushed, nothing announced; the head counts it.
    expect(w.overlays.stack.map((l) => l.id), "one layer").toEqual(["confirm"]);
    expect(w.asked, "announced once, for the first").toEqual(["First?"]);
    expect(w.confirm.waiting).toBe(1);
    expect(w.title(), "the open question counts what waits").toBe("Confirm - 1 more");
    expect(JSON.stringify(w.overlays.top?.content), "and it is the first on screen").toContain("First?");

    // The first answered: its layer goes, then the second is pushed.
    const layerBefore = w.overlays.top;
    expect(w.press("y")).toBe(true);
    await expect(q1).resolves.toEqual({ key: "y", outcome: "answered" });
    expect(pushes, "disposed, then pushed — never two under one id").toEqual([
      "push:confirm",
      expect.stringMatching(/^(pop|dismiss):confirm$/u),
      "push:confirm",
    ]);
    expect(w.overlays.top, "a new layer").not.toBe(layerBefore);
    expect(JSON.stringify(w.overlays.top?.content)).toContain("Second?");
    expect(w.title(), "nothing behind it now").toBe("Confirm");
    expect(w.asked, "announced when shown, once").toEqual(["First?", "Second?"]);
    expect(await settled(q2), "the second is still open").toBe(false);
    w.press("n");
    await expect(q2).resolves.toEqual({ key: "n", outcome: "answered" });
    expect(w.overlays.stack, "and nothing is left").toEqual([]);
  });

  it("T1.102 (C23 I92): a signal aborted before ask, while open, and while waiting — each resolves cancelled with the default's key", async () => {
    // Before `ask`: resolved at once, nothing pushed.
    const w = world();
    const gone = new AbortController();
    gone.abort();
    await expect(ask(w, "Late?", { signal: gone.signal })).resolves.toEqual({ key: "n", outcome: "cancelled" });
    expect(w.overlays.stack, "nothing pushed").toEqual([]);
    expect(w.asked, "nothing announced").toEqual([]);

    // While open, and mid-reply: the draft comes back before it resolves.
    const open = new AbortController();
    w.type("mine");
    const q1 = ask(w, "Open?", { signal: open.signal });
    const behind = new AbortController();
    const q2 = ask(w, "Behind?", { signal: behind.signal });
    const q3 = ask(w, "Third?");
    expect(w.title()).toBe("Confirm - 2 more");

    // The waiting one withdrawn: never drawn, and the count loses it.
    behind.abort();
    await expect(q2).resolves.toEqual({ key: "n", outcome: "cancelled" });
    expect(w.title(), "the head's count").toBe("Confirm - 1 more");
    expect(w.asked).toEqual(["Open?"]);

    w.press("r");
    w.type("half a reply");
    open.abort();
    await expect(q1).resolves.toEqual({ key: "n", outcome: "cancelled" });
    expect(w.line(), "the held draft restored").toBe("mine");
    // The next one is promoted, and it was never the withdrawn one.
    expect(w.asked).toEqual(["Open?", "Third?"]);
    w.press("y");
    await expect(q3).resolves.toEqual({ key: "y", outcome: "answered" });

    // **The default, never the first choice** — the order is the control.
    const marked = new AbortController();
    const last = w.confirm.ask({
      question: "Delete?",
      choices: [{ key: "y", label: "delete" }, { key: "n", label: "keep", default: true }],
      signal: marked.signal,
    });
    marked.abort();
    await expect(last).resolves.toEqual({ key: "n", outcome: "cancelled" });
  });

  it("T1.103 (C23 I92): expiresAfterMs through an injected schedule resolves expired and toasts the question's expiry", async () => {
    const w = world();
    const q = ask(w, "seams disconnected", { expiresAfterMs: 41_000 });
    expect(w.armed(), "armed when shown").toBe(1);
    w.fire();
    await expect(q).resolves.toEqual({ key: "n", outcome: "expired" });
    expect(w.expired).toEqual(["seams disconnected after 41s"]);
    expect(w.overlays.stack).toEqual([]);

    // Answered first, the timer is disposed and never fires.
    const answered = ask(w, "Quick?", { expiresAfterMs: 1_000 });
    w.press("y");
    await expect(answered).resolves.toEqual({ key: "y", outcome: "answered" });
    expect(w.armed(), "disposed by the answer").toBe(0);

    // A waiting question's timer is not armed until it is shown.
    const head = ask(w, "Head?");
    const waiting = ask(w, "Waiting?", { expiresAfterMs: 5_000 });
    expect(w.armed(), "not yet put to the reader").toBe(0);
    w.press("y");
    await head;
    expect(w.armed(), "armed at promotion").toBe(1);
    w.fire();
    await expect(waiting).resolves.toEqual({ key: "n", outcome: "expired" });

    // **And the toast, through a built session** (`R-BLK-881`): hollow and
    // muted, `○`, never `ok`'s `✓` — the question resolved itself. A second's
    // real timer, because the session's `schedule` is its ambient one.
    const stdin = fakeStdin();
    let resolved: unknown = null;
    const session = await buildSession(
      {
        stdin: stdin as never,
        manifest: {
          schema: "tui.manifest/1",
          binary: "prism",
          version: "1.0.0",
          tools: [{ name: "q", local: true, summary: "ask", args: [], flags: [] }],
        },
        localHandlers: {
          q: async (_argv: unknown, ctx: { ask: (o: unknown) => Promise<unknown> }) => {
            resolved = await ctx.ask({ question: "seams disconnected", choices: YES_NO_REPLY, expiresAfterMs: 1_000 });
            return { schema: "tui.view/1", status: "ok", blocks: [] };
          },
        },
      } as never,
      { columns: 80, rows: 30 },
    );
    for (const ch of "/q\r") {
      stdin.emit(ch);
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(resolved, "open").toBeNull();
    await new Promise((r) => setTimeout(r, 1_100));
    expect(resolved).toEqual({ key: "n", outcome: "expired" });
    const footer = session.screen().text.find((l) => l.includes("the question expired"));
    expect(footer, "the toast").toMatch(/○ the question expired · seams disconnected after 1s/u);
    expect(footer, "and not `ok`'s mark").not.toContain("✓");
  });

  it("T1.104 (C23 I93): two defaults, a default on reply…, a default on an inspection — each rejects with nothing queued, pushed or held", async () => {
    const cases: readonly (readonly Choice[])[] = [
      [{ key: "a", label: "a", default: true }, { key: "b", label: "b", default: true }],
      [{ key: "a", label: "a" }, { key: "r", label: "reply…", reply: true, default: true }],
      [{ key: "a", label: "a" }, { key: "s", label: "show", inspect: true, default: true }],
    ];
    for (const choices of cases) {
      const w = world();
      w.type("draft");
      await expect(w.confirm.ask({ question: "Bad?", choices })).rejects.toThrow(/C23 I93/u);
      expect(w.overlays.stack, "nothing pushed").toEqual([]);
      expect(w.confirm.waiting, "nothing queued").toBe(0);
      expect(w.line(), "nothing held").toBe("draft");
      // Behind an open question too: rejected, not queued.
      const open = ask(w, "Open?");
      await expect(w.confirm.ask({ question: "Bad?", choices })).rejects.toThrow(/C23 I93/u);
      expect(w.confirm.waiting).toBe(0);
      w.press("y");
      await open;
    }

    // No default: the last choice that answers, neither a reply nor an inspection.
    const w = world();
    const q = w.confirm.ask({
      question: "Which?",
      choices: [
        { key: "a", label: "a" },
        { key: "b", label: "b" },
        { key: "r", label: "reply…", reply: true },
        { key: "s", label: "show", inspect: true },
      ],
    });
    expect(JSON.stringify(w.overlays.top?.content), "the selection opens on b").toMatch(
      /"id":"confirm-choice-b","cells":\{"mark":\{"text":"","glyph":"bullet"\}/u,
    );
    w.press("escape");
    await expect(q).resolves.toEqual({ key: "b", outcome: "answered" });
  });

  it("T1.105 (C23 I94): approvalPrompt's choices are deny then allow, with deny the default; esc at an approval resolves deny", async () => {
    const prompt = approvalPrompt({ name: "rm", args: "-rf build" });
    expect(prompt.choices.map((c) => [c.key, c.label, c.default === true])).toEqual([
      [DENY_KEY, "deny", true],
      ["y", "allow", false],
    ]);
    const w = world();
    const q = w.confirm.ask(prompt);
    w.press("escape");
    await expect(q).resolves.toEqual({ key: DENY_KEY, outcome: "answered" });
  });

  it("T1.107 (C23 I93, F1495): a set in which no choice answers is refused by ask and by the testing stand-in", async () => {
    // **Every choice a reply or an inspection** (§8a A6.11 rows 1–3). `esc`
    // resolved with `defaultStart`'s last choice as an *answer*, with no text —
    // it settles directly and never opens the reply — and on an approval that
    // key is not `deny`.
    const none: readonly (readonly [string, readonly Choice[]])[] = [
      ["reply alone", [{ key: "r", label: "reply…", reply: true }]],
      ["inspection alone", [{ key: "s", label: "show", inspect: true }]],
      ["inspection and reply", [{ key: "s", label: "show", inspect: true }, { key: "r", label: "reply…", reply: true }]],
    ];
    const stand = localContext();
    for (const [label, choices] of none) {
      const w = world();
      w.type("draft");
      await expect(w.confirm.ask({ question: "Bad?", choices }), label).rejects.toThrow(/none answers.*\(C23 I93\)/u);
      expect(w.overlays.stack, `${label}: nothing pushed`).toEqual([]);
      expect(w.confirm.waiting, `${label}: nothing queued`).toBe(0);
      expect(w.line(), `${label}: nothing held`).toBe("draft");
      // **The stand-in refuses the same set with the same words**, or a handler
      // tested against it passes on a question the shell throws on.
      await expect(stand.ask({ question: "Bad?", choices }), `${label}: the stand-in`).rejects.toThrow(/none answers.*\(C23 I93\)/u);
    }

    // **The control**: one choice that answers is enough, and `esc` resolves it.
    const w = world();
    const q = w.confirm.ask({ question: "Fine?", choices: [{ key: "a", label: "a" }, { key: "r", label: "reply…", reply: true }] });
    expect(w.overlays.stack.map((l) => l.id), "asked").toEqual(["confirm"]);
    w.press("escape");
    await expect(q).resolves.toEqual({ key: "a", outcome: "answered" });
    await expect(stand.ask({ question: "Fine?", choices: [{ key: "a", label: "a" }, { key: "r", label: "reply…", reply: true }] })).resolves.toEqual({
      key: "a",
      outcome: "answered",
    });
  });
});

describe("C23 §7h — the question's form, owed at the spec commit", () => {
  it.todo(
    "T1.108 (C23 I104, C04 I151, §028): a question pushed through the real confirm host has no panel in its content; its first block is a notice with the question glyph, warn tone and one default span, its last a pills block with buttons whose chips are the labels in order and carry no action; an inspection's content is a panel — not deferred on a component: the same round's code commit replaces it",
  );
  it.todo(
    "T1.109 (C23 I104, I94, I36): focusedBox names the chip of the default, which is neither first nor last, moves with the arrows, is null in a reply and the same chip after esc, is the inspection's box in an inspection, and is null once settled — not deferred on a component: the same round's code commit replaces it",
  );
});
