/**
 * C16 §6 — the keymap as data. Tiers 1, 2 and 3.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** The repo root, for the rows that run a tool or read the registry. */
const ROOT = new URL("../..", import.meta.url).pathname;
import { describe, expect, it } from "vitest";

import { createKeymap, KeymapError, defaultKeymap, keyText } from "../../src/interaction/router/keymap.js";
import { createDecoder } from "../../src/interaction/router/decode.js";
import { REGISTRY_BINDINGS } from "../../src/interaction/router/registry-bindings.js";
import type { Binding, FocusTarget, Key } from "../../src/interaction/router/types.js";

const k = (name: string, mods: Partial<Key> = {}): Key => ({
  name,
  ctrl: false,
  meta: false,
  shift: false,
  sequence: name,
  ...mods,
});

const bind = (target: Binding["target"], name: string, action: string, mods = {}): Binding => ({
  target,
  key: { name, ...mods },
  action,
});

describe("C16 §6 — construction", () => {
  it("T2.4 (I10): a duplicate (target, key) fails at construction, naming both", () => {
    let raised: unknown;
    try {
      createKeymap([bind("prompt", "a", "first"), bind("prompt", "a", "second")]);
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(KeymapError);
    const message = String((raised as Error).message);
    expect(message, "the winner").toContain("first");
    expect(message, "and the loser — naming one sends the reader after a binding that is fine")
      .toContain("second");
  });

  it("modifiers are part of the identity, so ctrl-a and a are not a duplicate", () => {
    expect(() =>
      createKeymap([bind("prompt", "a", "plain"), bind("prompt", "a", "ctrl", { ctrl: true })]),
    ).not.toThrow();
  });

  it("the same key on two targets is not a duplicate", () => {
    expect(() =>
      createKeymap([bind("prompt", "down", "enterBlock"), bind("overlay", "down", "menuNext")]),
    ).not.toThrow();
  });
});

describe("C16 §6 — precedence, not merely presence", () => {
  it("a block binding wins over a base liveBlock binding of a different key set", () => {
    // **The order test, not the membership test** (A03 §2). Asserting that every
    // binding resolves says nothing about which one wins where two could — and
    // the keymap is a table with precedence, so that is the property.
    const map = createKeymap([bind("liveBlock", "j", "moveDown")]);
    expect(map.resolve("liveBlock", k("j"))?.action).toBe("moveDown");

    map.mergeBlock([{ key: { name: "s" }, action: "rowActivate" }]);
    expect(map.resolve("liveBlock", k("s"))?.action, "block binding is live").toBe("rowActivate");
    expect(map.resolve("liveBlock", k("j"))?.action, "base binding survives the merge").toBe(
      "moveDown",
    );
  });

  it("a withdrawn block keymap stops resolving, and the base is untouched", () => {
    const map = createKeymap([bind("liveBlock", "j", "moveDown")]);
    const withdraw = map.mergeBlock([{ key: { name: "s" }, action: "rowActivate" }]);

    withdraw();
    expect(map.resolve("liveBlock", k("s")), "s does nothing once the block freezes").toBeNull();
    expect(map.resolve("liveBlock", k("j"))?.action).toBe("moveDown");
  });

  it("a second block replaces the first rather than accumulating", () => {
    const map = createKeymap([]);
    map.mergeBlock([{ key: { name: "s" }, action: "rowUp" }]);
    map.mergeBlock([{ key: { name: "f" }, action: "rowDown" }]);

    expect(map.resolve("liveBlock", k("s")), "the older block's binding is gone").toBeNull();
    expect(map.resolve("liveBlock", k("f"))?.action).toBe("rowDown");
  });
});

describe("C16 §6 — a colliding block key is placed, not refused (I27)", () => {
  it("T2.4b (I27): a key `global` binds lands at `interaction`, and the global is not shadowed", () => {
    // **The policy this replaces threw here**, and its first consumer would have
    // tripped it on every key it has — the widget design binds `↑` `↓` `PgUp`
    // `PgDn` `Esc`, all built-ins. The mode C26 §4f describes is for exactly
    // these keys: `interaction` is the one rung where the built-ins are out of
    // scope, so the key is bound there and fires once the reader has entered
    // the block, while the global keeps its slot untouched.
    const map = createKeymap([bind("global", "s", "themeSwitch")]);
    map.mergeBlock([{ key: { name: "s" }, action: "rowActivate" }]);

    expect(map.resolve("global", k("s"))?.action, "the global is untouched").toBe("themeSwitch");
    expect(map.resolve("liveBlock", k("s")), "nothing lands at liveBlock for a colliding key").toBeNull();
    expect(map.resolve("interaction", k("s"))?.action, "the block's key is in interaction").toBe("rowActivate");
  });

  it("T2.4c (I27): a key `liveBlock` binds lands at `interaction` too, and a free key at `liveBlock`", () => {
    // **The fabricated collision, on the real table.** `up` is `rowUp` at
    // `liveBlock`; a block binding it must not take the arrow away from
    // navigation, and must still be able to have it once the reader is inside.
    // `x` is free, so it works from the first `↓` (A01 D4) — the two halves of
    // one block keymap landing at two targets is the ruling, not an accident.
    // Both actions are union members no default row binds (I19), so the listing
    // below is the block's rows and nothing else.
    const map = createKeymap(defaultKeymap);
    map.mergeBlock([
      { key: { name: "up" }, action: "toggleSeries1" },
      { key: { name: "x" }, action: "toggleSeries2" },
    ]);

    expect(map.resolve("liveBlock", k("up"))?.action, "navigation keeps the arrow").toBe("rowUp");
    expect(map.resolve("interaction", k("up"))?.action, "the block has it inside").toBe("toggleSeries1");
    expect(map.resolve("liveBlock", k("x"))?.action, "a free key needs no mode").toBe("toggleSeries2");
    expect(map.resolve("interaction", k("x")), "and is not duplicated inside").toBeNull();

    // `/help` lists both, at their targets — nothing silent (I19).
    const listed = map.entries().filter((b) => b.action === "toggleSeries1" || b.action === "toggleSeries2");
    expect(listed.map((b) => `${b.target}:${b.action}`).sort()).toEqual(["interaction:toggleSeries1", "liveBlock:toggleSeries2"]);
  });

  it("T2.4d (I10, I27): the same key twice inside one block keymap is still a construction error", () => {
    // The refusal that survives: the block's author wrote both and neither can
    // win. It is raised at commit, because the block does not exist until then.
    const map = createKeymap([]);
    expect(() =>
      map.mergeBlock([
        { key: { name: "s" }, action: "rowUp" },
        { key: { name: "s" }, action: "rowDown" },
      ]),
    ).toThrow(KeymapError);
    expect(map.resolve("liveBlock", k("s")), "and a refused merge leaves nothing behind").toBeNull();
  });

  it("T2.4f (I19): an action outside the union is refused at merge, and a member no default row binds is not", () => {
    // **The refusal that used to be silent.** `bound()` resolves a block binding
    // and then looks it up in L4's effect table, so an action outside the union
    // resolved and did nothing at every press, and nobody saw it. Refused here
    // instead, naming the key and the action, and leaving nothing behind.
    const map = createKeymap(defaultKeymap);
    expect(() => map.mergeBlock([{ key: { name: "s" }, action: "sort" }])).toThrow(
      /binds s to "sort", which names no built-in action \(C16 I19\)/,
    );
    expect(map.resolve("liveBlock", k("s")), "a refused merge leaves nothing behind").toBeNull();

    // **The control, and the case the first cut got wrong.** `toggleSeries1` is
    // in the union and in the effect table and bound by no default row — it
    // reaches the keymap only through a plot's `mergeBlock` (C12 I116). A check
    // against *the actions the rows bind* refuses it; the union does not.
    map.mergeBlock([{ key: { name: "1" }, action: "toggleSeries1" }]);
    expect(map.resolve("liveBlock", k("1"))?.action).toBe("toggleSeries1");
  });

  it("T2.4e (I27): withdrawal takes both halves", () => {
    const map = createKeymap([bind("global", "s", "themeSwitch")]);
    const withdraw = map.mergeBlock([
      { key: { name: "s" }, action: "rowActivate" },
      { key: { name: "f" }, action: "rowDown" },
    ]);
    withdraw();
    expect(map.resolve("interaction", k("s")), "the colliding half is gone").toBeNull();
    expect(map.resolve("liveBlock", k("f")), "and the free half").toBeNull();
    expect(map.resolve("global", k("s"))?.action, "the base survives").toBe("themeSwitch");
  });
});

describe("C16 §6 — /help renders from the table dispatch uses", () => {
  it("T4.9: entries() returns the very objects resolve() returns", () => {
    // **Identity, not equality.** The anti-drift property is satisfiable two ways
    // — the same lookup, or a second one that agrees today — and comparing two
    // results cannot tell them apart. A help renderer that walked its own copy
    // would produce equal objects and fail this.
    const map = createKeymap([
      bind("prompt", "tab", "complete"),
      bind("global", "q", "quit", { ctrl: true }),
    ]);
    map.mergeBlock([{ key: { name: "s" }, action: "rowActivate" }]);

    const listed = map.entries();
    expect(listed.length, "base bindings and the live block's").toBe(3);

    for (const entry of listed) {
      const resolved = map.resolve(entry.target, k(entry.key.name, entry.key));
      expect(resolved, `/help lists ${entry.action}, which dispatch must resolve`).toBe(entry);
    }
  });

  it("a binding withdrawn from dispatch disappears from help in the same call", () => {
    const map = createKeymap([bind("prompt", "tab", "complete")]);
    const withdraw = map.mergeBlock([{ key: { name: "s" }, action: "rowActivate" }]);
    expect(map.entries().some((e) => e.action === "rowActivate")).toBe(true);

    withdraw();
    expect(map.entries().some((e) => e.action === "rowActivate"), "help cannot outlive dispatch").toBe(
      false,
    );
  });
});

describe("§6 — the default table (C17 I12)", () => {
  it("T2.11 (C17 I12): three newline bindings, two of them terminal-independent", () => {
    // Asserted against `defaultKeymap` rather than a table the test writes.
    // A fixture keymap here would assert nothing about what ships: the point of
    // I12 is that the rows exist in the table `/help` renders and dispatch
    // resolves, and a test that builds its own has checked its own arithmetic.
    const newline = defaultKeymap.filter((b) => b.action === "insertNewline");

    expect(newline, "three bindings — C17 §4").toHaveLength(3);

    // Both halves of I12, and they count different things. Shift-Enter is the
    // one many terminals cannot distinguish, so it cannot be one of the two
    // that always work; an assertion on the count alone passes with it removed,
    // and one on the reliable pair alone passes with it the only row.
    const independent = newline.filter((b) => b.key.shift !== true);
    expect(independent, "at least two that no terminal can fail to send").toHaveLength(2);
    expect(
      independent.map((b) => `${b.key.ctrl === true ? "ctrl-" : "meta-"}${b.key.name}`).sort(),
      "Alt-Enter and Ctrl-J",
    ).toEqual(["ctrl-j", "meta-enter"]);
    expect(
      newline.some((b) => b.key.shift === true && b.key.name === "enter"),
      "and Shift-Enter, for the terminals that do distinguish it",
    ).toBe(true);
  });

  it("T1.32 (I24): every focus target has bindings, derived from the union", () => {
    // **The coverage set comes from the union, not from a list beside it.** A
    // hand-written list of targets agrees with itself and never notices the one
    // that was never bound — which is exactly how `pushedView` sat in
    // `FocusTarget` from the day C16 was written with no row anywhere, so
    // `activeTarget` resolved to it and every key fell through to step 3.
    //
    // `global` is included: it earned its rows when scrolling was bound (I23),
    // and exempting it would be the exception that hides the next one.
    //
    // **`copyMode` is exempt, and this test is what made the exemption
    // explicit.** The invariant was first written as "every target", and this
    // row failed on `copyMode` as well as on the target it was written for.
    // That one is legitimate: copy mode's only key is Ctrl-C, which §5's ladder
    // owns by construction and the keymap deliberately does not, so a binding
    // there would be the second mechanism I23 objects to. Named here with its
    // reason rather than dropped from the list — an unrecorded exemption reads
    // as coverage.
    const TARGETS: readonly FocusTarget[] = [
      "overlay",
      "pushedView",
      "prompt",
      "liveBlock",
      "global",
    ];
    const bound = new Set(defaultKeymap.map((b) => b.target));
    for (const t of TARGETS) {
      expect(bound.has(t), `${t} has no binding — a name in the union and nothing else`).toBe(true);
    }
    expect(bound.has("copyMode"), "copyMode binds exactly its own dismissal, `Esc` (C16 §5c, I24)").toBe(true);
  });

  it("T1.33 (I24): the pushed view's seven keys resolve, and Esc is viewPop", () => {
    const at = (name: string): string | undefined =>
      defaultKeymap.find((b) => b.target === "pushedView" && b.key.name === name)?.action;

    expect(at("n")).toBe("viewNextHunk");
    expect(at("p")).toBe("viewPrevHunk");
    expect(at("g")).toBe("viewTop");
    expect(at("G")).toBe("viewBottom");
    expect(at("pageup")).toBe("viewPageUp");
    expect(at("pagedown")).toBe("viewPageDown");
    // **`viewPop`, not `dismiss`.** `dismiss` pops whatever is on top; this one
    // knows it is closing *its* view and drops the offset with it. And it is
    // not §5's Ctrl-C rung under another name — that rung is cancellation.
    expect(at("escape")).toBe("viewPop");
  });

  it("T2.13 (I17): every default binding is a key the decoder can actually produce", () => {
    // **T2.12 constructs the Key from the binding, which is the shape that
    // hides this entirely**: a row saying `{name: "\r"}` resolves perfectly
    // against a Key built from `{name: "\r"}`. I17 is the other direction — a
    // key the keymap can name must be a key the *decoder* produces — and the
    // only way to ask it is to send the bytes a terminal sends and see what
    // comes out.
    //
    // It has now found three. `\n` decoded to `enter`, so Ctrl-J's row
    // resolved against an event nothing could send. The meta branch passed its
    // character through raw, so Alt-Enter arrived as `{name: "\r", meta}`.
    // And Shift-Enter's two wire forms — `CSI 13;2u` and xterm's
    // `CSI 27;2;13~` — were both discarded as well-formed-but-unknown, which
    // made the row unreachable in every terminal that sends it.
    //
    // **A binding with no byte sequence here fails**, and that is the check
    // rather than an inconvenience: a row nobody can name the wire form of is a
    // row nobody can press.
    const BYTES: Record<string, readonly string[]> = {
      // Both forms, because a terminal sends one or the other and a rule
      // satisfied by either is satisfied on half the terminals.
      "prompt s+enter": ["\u001b[13;2u", "\u001b[27;2;13~"],
      "prompt m+enter": ["\u001b\r"],
      "prompt c+j": ["\n"],

      // C19 §6's seven. Written with `\u001b` rather than a raw byte: the two
      // rows above carry literal escapes and read as `[13;2u` on every screen
      // they are shown on, which is SS43's argument arriving in a directory the
      // rule does not scan.
      "prompt tab": ["\t"],
      // Both forms: `\u001bOC` is what a terminal in application cursor mode
      // sends, and a rule satisfied by only the normal form is satisfied on half
      // the terminals — which is exactly how Shift-Enter came to be unreachable.
      "prompt right": ["\u001b[C", "\u001bOC"],
      // **`panel`, because the menu and the search are panels** (C15 §2c, I27).
      // The four rows moved target with the kind; the bytes did not move,
      // which is the point — a substate is reached by the same keys a question
      // was, and only the owner changed.
      "panel tab": ["\t"],
      "panel down": ["\u001b[B", "\u001bOB"],
      "panel up": ["\u001b[A", "\u001bOA"],
      "panel enter": ["\r"],
      // **A lone `Esc` is the one form that needs time.** The same byte begins
      // every sequence above, so it is held for the disambiguation window and
      // the key arrives from `poll` once the window closes. A fixed clock cannot
      // express that, which is why the loop below steps one.
      //
      // Twice, because `dismiss` is bound at both an overlay and a panel: the
      // kinds differ on how they come to be escapable and not on what closes
      // them (C15 I26).
      "overlay escape": ["\u001b"],
      "panel escape": ["\u001b"],

      // **The captured child's one key** (C16 I49, R-BLK-908). `⌃]` is
      // `0x1d` — the ASCII group separator, which is what `ctrl` does to `]`
      // — and it is a byte rather than a name a terminal has to be persuaded
      // to send, which is half the argument for it as the base candidate.
      // `⌥esc` is `ESC ESC`: the second `ESC` closes the first's
      // disambiguation window, so it needs the stepped clock exactly as a
      // lone `Esc` does, and it is `enhanced-terminal` only.
      "child c+]": ["\u001d"],
      "child m+escape": ["\u001b\u001b"],

      // C20's four. The arrows carry both forms for the reason the `right`
      // row above gives — a rule satisfied by only the normal form is
      // satisfied on half the terminals — and `\u0012` is Ctrl-R, a byte
      // rather than a name a terminal has to be persuaded to send.
      "prompt up": ["\u001b[A", "\u001bOA"],
      "prompt down": ["\u001b[B", "\u001bOB"],
      "prompt c+r": ["\u0012"],
      "panel c+r": ["\u0012"],

      // C17's editing set (I21). **This table is the check the ruling asked
      // for**, and it earned it: every meta form here is one a terminal has to
      // be persuaded to send, and a binding whose wire form nobody could name
      // is the fourteen-unexecuted-bindings defect arriving from the other end.
      "prompt backspace": ["\u007f"],
      "prompt c+h": ["\u0008"],
      "prompt delete": ["\u001b[3~"],
      "prompt c+w": ["\u0017"],
      // ESC-prefixed, which is how a terminal sends a meta-modified key when it
      // has no `modifyOtherKeys` — and the decoder's 50 ms window is what tells
      // it from a lone `Esc` followed by a keystroke.
      "prompt m+backspace": ["\u001b\u007f"],
      "prompt m+d": ["\u001bd"],
      "prompt c+u": ["\u0015"],
      "prompt c+k": ["\u000b"],
      "prompt c+y": ["\u0019"],
      "prompt c+a": ["\u0001"],
      "prompt c+e": ["\u0005"],
      // Both forms, for the reason the arrows above carry both.
      "prompt home": ["\u001b[H", "\u001b[1~"],
      "prompt end": ["\u001b[F", "\u001b[4~"],
      "prompt m+b": ["\u001bb"],
      "prompt m+f": ["\u001bf"],
      "prompt c+left": ["\u001b[1;5D"],
      "prompt c+right": ["\u001b[1;5C"],
      "prompt left": ["\u001b[D", "\u001bOD"],
      // The byte that would be SIGTSTP if raw mode did not clear `ISIG`, which
      // is why this row exists rather than a reasoned assurance.
      "prompt c+z": ["\u001a"],
      "prompt m+z": ["\u001bz"],

      // --- selection (C17 §5b) ---------------------------------------------
      //
      // **`⌥⇧←` carries BOTH forms, and step 0 is why it can.** A terminal
      // sending Option as Alt gives `CSI 1;4D`; one sending it as Meta gives
      // `CSI 1;10D`, and `modifiersOf` read three of xterm's four modifier bits
      // — so the second decoded as `s+left`, which is a *different bound key*.
      // Listing one form here would have passed on half the terminals, which is
      // the same argument Shift-Enter's row makes above.
      //
      // `⇧⌃a`/`⇧⌃e` are absent rather than approximated: ctrl+shift+letter is
      // `0x01`, the collision that already cost `⌃⇧a` and `⌃_`.
      "prompt s+left": ["\u001b[1;2D"],
      "prompt s+right": ["\u001b[1;2C"],
      "prompt ms+left": ["\u001b[1;4D", "\u001b[1;10D"],
      "prompt ms+right": ["\u001b[1;4C", "\u001b[1;10C"],
      "prompt s+home": ["\u001b[1;2H"],
      "prompt s+end": ["\u001b[1;2F"],
      "prompt m+a": ["\u001ba"],
      "prompt m+w": ["\u001bw"],

      // --- the transcript's selection (C26 §5c) ----------------------------
      //
      // `⇧↑`/`⇧↓` reach the letter table with `modifiersOf("2")`, and plain `y`
      // is a byte. The application-cursor form has no modified variant, so
      // unlike the unshifted arrows these carry one wire form each.
      "liveBlock s+up": ["\u001b[1;2A"],
      "liveBlock s+down": ["\u001b[1;2B"],
      "liveBlock y": ["y"],
      // `⌃a` is the byte `0x01`, the same one `prompt c+a` walks above — one
      // byte, two targets, two actions (C26 §5c).
      "liveBlock c+a": ["\u0001"],
      // **A plain printable, and T2.13 is what said the first choice was not.**
      // The binding was written as a bare key name and this table has no default:
      // a row with no wire form fails, which is how it was found that nobody
      // could press it. `[` and `]` are their own bytes, exactly as `y` is —
      // and this table is what measured that rather than assuming it.
      "liveBlock [": ["["],
      "liveBlock ]": ["]"],
      // **Step 8's five, and the shifted brackets are the reason this table is
      // the check.** A terminal sends `{` as the byte `{` with no shift flag —
      // the modifier is the layout's and never reaches the wire — so a binding
      // written as `{name: "[", shift: true}` would resolve against an event
      // nothing sends, which is Shift-Enter's defect on a printable. Measured
      // here rather than assumed, exactly as `[` and `]` were.
      "liveBlock {": ["{"],
      "liveBlock }": ["}"],
      "liveBlock +": ["+"],
      "liveBlock =": ["="],
      "liveBlock -": ["-"],
      "liveBlock r": ["r"],
      "liveBlock o": ["o"],

      // Copy mode's entry, at both targets it is bound to (C16 §5b). The key is
      // provisional — which key enters copy mode is the rebindable-keys row's
      // question — and its *wire form* is not: this check fired on the binding
      // the moment it was added, before the mode had a producer, which is what
      // it is for.
      "prompt m+v": ["\u001bv"],
      "liveBlock m+v": ["\u001bv"],

      // The pushed view (I24). **The plain letters are the interesting rows**,
      // and they are only bindable at this target: a prompt takes `n` and `p`
      // as text, and §6 rejected `g`/`G` for the transcript for exactly that
      // reason. A pushed view has no prompt competing for them, so the bytes
      // are the characters themselves — `G` is `⇧g`, which a terminal sends as
      // the capital rather than as a modifier.
      // --- §6a, M6: the design's routes -----------------------------------
      //
      // **`⌥⇧C` is `m+C` and not `ms+c`**: `ESC C` names the character it
      // carries and sets no shift bit, which is what this row refused the first
      // spelling on — the binding was written before it was pressed, and the
      // rule caught it in the same pass.
      "prompt m+C": ["\u001bC"],
      "liveBlock m+C": ["\u001bC"],
      "prompt m+V": ["\u001bV"],
      "liveBlock m+V": ["\u001bV"],
      "global f1": ["\u001bOP", "\u001b[11~"],
      "liveBlock ?": ["?"],
      "prompt s+tab": ["\u001b[Z"],
      "global m+up": ["\u001b[1;3A"],
      "global m+down": ["\u001b[1;3B"],
      "prompt cs+c": ["\u001b[99;6u"],
      "prompt cs+v": ["\u001b[118;6u"],
      "global m+p": ["\u001bp"],
      "global m+,": ["\u001b,"],
      "global m+.": ["\u001b."],
      "global c+tab": ["\u001b[9;5u"],
      "global cs+tab": ["\u001b[9;6u"],
      "global m+1": ["\u001b1"],
      // **`⌘↑`/`⌘↓`, and they are the rows I41 is about** (§6a). `CSI 1;9A` is
      // the xterm-shaped arrow with modifier bit 8 — the *same bytes* a terminal
      // with no protocol sends for `⌥↑`. What makes it a distinct chord is the
      // negotiated protocol, which is why the decoder below is built at the
      // binding's own profile rather than at one fixed setting.
      "global u+up": ["\u001b[1;9A"],
      "global u+down": ["\u001b[1;9B"],
      "global u+1": ["\u001b[49;9u"],
      "global m+2": ["\u001b2"],
      "global u+2": ["\u001b[50;9u"],
      "global m+3": ["\u001b3"],
      "global u+3": ["\u001b[51;9u"],
      "global m+4": ["\u001b4"],
      "global u+4": ["\u001b[52;9u"],
      "global m+5": ["\u001b5"],
      "global u+5": ["\u001b[53;9u"],
      "global m+6": ["\u001b6"],
      "global u+6": ["\u001b[54;9u"],
      "global m+7": ["\u001b7"],
      "global u+7": ["\u001b[55;9u"],
      "global m+8": ["\u001b8"],
      "global u+8": ["\u001b[56;9u"],
      "global m+9": ["\u001b9"],
      "global u+9": ["\u001b[57;9u"],

      "pushedView n": ["n"],
      "pushedView p": ["p"],
      "pushedView g": ["g"],
      "pushedView G": ["G"],
      "pushedView pageup": ["\u001b[5~"],
      "pushedView pagedown": ["\u001b[6~"],
      "pushedView up": ["\u001b[A", "\u001bOA"],
      "pushedView down": ["\u001b[B", "\u001bOB"],
      // The section gesture (C16 I33). The same two wire forms `liveBlock`
      // already proves — `CSI Z` for the shifted arm, which the decoder answers
      // with `{name: "tab", shift: true}` — at a third target, resolved by the
      // ladder rather than by a second table.
      "pushedView tab": ["\t"],
      "pushedView s+tab": ["\u001b[Z"],
      "pushedView escape": ["\u001b"],
      // Copy mode's own dismissal (C16 §5c): the same lone byte, resolved when
      // `activeTarget` answers `copyMode`.
      "copyMode escape": ["\u001b"],

      // Scrolling (I23). **This is the check the ruling asked for**, and it
      // came out positive: `⌃Home` and `⌃End` reach the decoder in both of the
      // forms terminals send them in, so no decoder branch was widened and no
      // candidate was dropped. `CSI 1;5H` lands in the letter table with
      // `modifiersOf("5")` setting ctrl; `CSI 7;5~` lands in the tilde table at
      // the same name with the same modifiers. Both are listed for the reason
      // the arrows carry both — a rule satisfied by one form is satisfied on
      // half the terminals.
      "global pageup": ["\u001b[5~"],
      "global pagedown": ["\u001b[6~"],
      // C04 I48 — the same two wire forms at a second target, which is the
      // ladder resolving one key by priority rather than a duplicate the
      // conflict rule refuses. Pressable end to end: scroll-wiring T4.41
      // types these exact bytes into a session and reads the frame move.
      "liveBlock pagedown": ["\u001b[6~"],
      "liveBlock pageup": ["\u001b[5~"],
      "global c+home": ["\u001b[1;5H", "\u001b[7;5~"],
      "global c+end": ["\u001b[1;5F", "\u001b[8;5~"],

      // The live block (I22). `escape` needs the disambiguation window to
      // close, like `overlay escape` above.
      "liveBlock escape": ["\u001b"],
      "liveBlock down": ["\u001b[B", "\u001bOB"],
      "liveBlock up": ["\u001b[A", "\u001bOA"],
      // F21's binding. `\r` is what a terminal sends for Return, and it is the
      // same byte `overlay enter` resolves — which is the argument for the key:
      // a reader who has accepted a menu item has already learnt it.
      "liveBlock enter": ["\r"],

      // Between entries (C26 I21, §4g). **`⇧tab` is the row this table refused
      // on arrival**: `CSI Z` is what every terminal sends for backtab and the
      // decoder discarded it as well-formed-but-unknown, so the binding named a
      // key nothing produced — the fourth instance of I17's class and the first
      // found before the row shipped rather than after. The bare form only; a
      // parameterised `Z` stays malformed (router-decode T3.13).
      "liveBlock tab": ["\t"],
      "liveBlock s+tab": ["\u001b[Z"],
      // The horizontal pair (C22 I76). The same two wire forms the prompt's
      // `left`/`right` carry, at the target where they used to be dropped.
      "liveBlock left": ["\u001b[D", "\u001bOD"],
      "liveBlock right": ["\u001b[C", "\u001bOC"],
      // Re-run (C23 I18): the prompt's newline pair, at the other target.
      "liveBlock s+enter": ["\u001b[13;2u", "\u001b[27;2;13~"],
      "liveBlock m+enter": ["\u001b\r"],
    };

    // Per profile (M6, I35), for T2.12's reason: an enhanced route resolves on
    // an enhanced terminal and nowhere else.
    const maps = {
      "default-terminal": createKeymap(defaultKeymap, "default-terminal"),
      "enhanced-terminal": createKeymap(defaultKeymap, "enhanced-terminal"),
    } as const;
    const enc = new TextEncoder();

    for (const b of defaultKeymap) {
      // **`keyText`, not a copy of it** (M6). This held its own three-modifier
      // spelling, and when `Key` gained `super` the copy did not — so `⌘↑` and
      // `↑` collapsed to one slot here and the row reported that `global up`
      // had no wire form. A second formatter is a second thing to drift, which
      // is the module note's own argument arriving in the test that checks it.
      const slot = `${b.target} ${keyText(b.key)}`;
      const sequences = BYTES[slot];

      expect(sequences, `${slot} has no wire form — nobody can press it`).toBeDefined();

      for (const seq of sequences ?? []) {
        // A steppable clock rather than a constant, because a lone `Esc` is
        // decidable only once the disambiguation window closes — the byte that
        // means "escape" is the byte that begins every other sequence here.
        // Everything else answers on `push` and is unaffected by the advance.
        let t = 1_000;
        // **The decoder is built at the binding's own profile** (I41). A single
        // protocol setting cannot answer this row: bit 8 is Meta without a
        // protocol and Super with one, so `CSI 1;9A` is `⌥↑` on one terminal and
        // `⌘↑` on another, and a fixed `"none"` reported the enhanced chord as
        // having no wire form — which is how the byte came to be recorded as
        // unsendable in the first place.
        const decoder = createDecoder({
          capabilities: {
            bracketedPaste: true,
            mouse: true,
            keyboardProtocol: b.profile === "enhanced-terminal" ? "kitty" : "none",
          },
          now: () => t,
        });
        const pushed = decoder.push(enc.encode(seq));
        t += 1_000;
        const events = [...pushed, ...decoder.poll()];
        const keys = events.filter((e) => e.kind === "key");

        expect(keys, `${slot}: ${JSON.stringify(seq)} decodes to one key`).toHaveLength(1);
        const decoded = keys[0];
        if (decoded?.kind !== "key") continue;
        expect(
          maps[b.profile ?? "default-terminal"].resolve(b.target, decoded.key),
          `${slot}: ${JSON.stringify(seq)}`,
        ).toBe(b);
      }
    }
  });

  it("T2.12: every default binding resolves to the object the table holds", () => {
    // The anti-drift property, on the rows that ship. `/help` traverses the same
    // objects dispatch returns (module note), so identity is what makes "a
    // binding help shows is a binding dispatch would resolve" checkable.
    // **Per profile** (M6, I35). A binding resolves in the profile it declares
    // and in no other, so a single walk against the default keymap reported the
    // enhanced rows as unresolvable — which is the axis working, not a defect.
    // Identity is still what is asserted; only the number of tables moved.
    const maps = {
      "default-terminal": createKeymap(defaultKeymap, "default-terminal"),
      "enhanced-terminal": createKeymap(defaultKeymap, "enhanced-terminal"),
    } as const;

    for (const b of defaultKeymap) {
      const keymap = maps[b.profile ?? "default-terminal"];
      const resolved = keymap.resolve(b.target, {
        name: b.key.name,
        ctrl: b.key.ctrl ?? false,
        meta: b.key.meta ?? false,
        shift: b.key.shift ?? false,
        ...(b.key.super === true ? { super: true } : {}),
        sequence: b.key.name,
      });
      expect(resolved, `${b.target}:${keyText(b.key)} resolves in ${b.profile ?? "both"}`).toBe(b);
    }

    // **And the control the split needs**: an enhanced-only route does not
    // resolve on a terminal without the protocol. Without this the row above is
    // satisfied by a `profile` field nothing reads.
    const enhanced = defaultKeymap.find((b) => b.profile === "enhanced-terminal");
    expect(enhanced, "there is an enhanced-only route to test with").toBeDefined();
    if (enhanced !== undefined) {
      expect(
        maps["default-terminal"].resolve(enhanced.target, {
          name: enhanced.key.name,
          ctrl: enhanced.key.ctrl ?? false,
          meta: enhanced.key.meta ?? false,
          shift: enhanced.key.shift ?? false,
          ...(enhanced.key.super === true ? { super: true } : {}),
          sequence: enhanced.key.name,
        }),
        "an enhanced route is not reachable on a default terminal",
      ).toBeNull();
    }
  });
});

describe("C16 I23 — the line's extremes and the document's", () => {
  it("T2.16 (I23): Home and ⌃Home are different slots, on different targets", () => {
    // **The claim is the discrimination, not the presence.** Both keys exist in
    // the table and a row asserting each resolves would pass with `keyText`
    // ignoring modifiers entirely — which is the one edit that breaks this, and
    // it is one line. So the two are asserted against each other.
    const map = createKeymap(defaultKeymap);

    expect(map.resolve("prompt", k("home"))?.action, "the line's start").toBe("home");
    expect(map.resolve("prompt", k("end"))?.action, "the line's end").toBe("end");

    expect(map.resolve("global", k("home", { ctrl: true }))?.action, "the document's top").toBe(
      "scrollTop",
    );
    expect(map.resolve("global", k("end", { ctrl: true }))?.action, "and its bottom").toBe(
      "scrollBottom",
    );

    // **The half that makes the ruling work.** `global` is last in the ladder,
    // so the prompt keeps an unmodified `Home` at every moment it has focus —
    // and the modified pair is not bound on `prompt` at all, which is what lets
    // it fall through. A binding here would take the scroll away silently.
    expect(map.resolve("prompt", k("home", { ctrl: true })), "⌃Home is not the prompt's").toBeNull();
    expect(map.resolve("prompt", k("end", { ctrl: true })), "nor ⌃End").toBeNull();
    expect(map.resolve("global", k("home")), "and plain Home is not global's").toBeNull();
  });

  it("T2.16b (I23): every scroll operation C14 exposes as a key has a binding", () => {
    // The row that would have caught the original defect. Two of the four had
    // callers in L4 and no route from a keyboard, and nothing compared the set
    // of operations with the set of bound actions — each was individually fine.
    const bound = new Set(defaultKeymap.filter((b) => b.target === "global").map((b) => b.action));
    // **The four, and the claim is that all four are bound** — not that nothing
    // else is. M6 put the design's `global` routes here too (§6a): help, the
    // agent strip, `posture.cycle` and the `⌥`/`⌘` spellings of paging and the
    // document ends. The row's finding was *an operation with no route*, and a
    // set-equality that has to be edited every time a route is added measures
    // the table's size rather than that.
    for (const action of ["scrollBottom", "scrollPageDown", "scrollPageUp", "scrollTop"]) {
      expect(bound, `C14's ${action} has a route from a keyboard`).toContain(action);
    }
    // What set-equality was also buying — *an action bound here that L4 cannot
    // execute* — is not lost: `defaultKeymap` is `readonly BuiltinBinding[]` and
    // L4's table is `Record<KeyAction, KeyEffect>`, so that case does not
    // compile (§6, I19). The control this row still owes is that the walk has a
    // corpus at all: a filter that matched nothing satisfies every loop above it.
    expect(bound.size, "the global target has bindings to walk").toBeGreaterThan(4);
  });
});

describe("C16 I17 — the rule, over the half a table walk cannot reach", () => {
  it("T2.13b (I17): every `key.name` literal in src/ names a key the decoder emits", () => {
    // **T2.13 walks `defaultKeymap`; this walks the source.** The rule says "a
    // key the keymap can name must be a key the decoder produces", and its
    // mechanism only ever covered names in the table. The fourth instance was
    // `key.name === "return"` in C22's prompt handler, against a decoder that
    // has only ever emitted `enter` — so Enter did not submit, and no walk of
    // the keymap could have reached the comparison.

    // **Collected by pressing, never declared.** A list written here is a
    // second table to drift from the decoder, which is the defect the rule is
    // about. So the set is whatever the real decoder emits for a corpus of the
    // wire forms terminals send.
    const enc = new TextEncoder();
    const ESC = "\u001b";
    const corpus: string[] = [];
    for (let b = 1; b <= 0x7f; b += 1) corpus.push(String.fromCharCode(b));
    for (const final of "ABCDFHPQRS") corpus.push(`${ESC}[${final}`, `${ESC}O${final}`);
    for (let n = 1; n <= 34; n += 1) corpus.push(`${ESC}[${String(n)}~`);
    for (const code of [13, 9, 27, 32, 65, 97]) {
      corpus.push(`${ESC}[${String(code)};2u`, `${ESC}[27;2;${String(code)}~`);
    }

    const produced = new Set<string>();
    for (const seq of corpus) {
      let t = 1_000;
      const decoder = createDecoder({
        capabilities: { bracketedPaste: true, mouse: true, keyboardProtocol: "none" },
        now: () => t,
      });
      const pushed = decoder.push(enc.encode(seq));
      t += 1_000;
      for (const e of [...pushed, ...decoder.poll()]) {
        if (e.kind === "key") produced.add(e.key.name);
      }
    }

    // The fixture responds before it is asserted against: a corpus that decoded
    // to nothing would make every literal below "not produced" and the test
    // would fail for the wrong reason, or — worse, with the assertion inverted
    // — pass having checked nothing.
    expect(produced.has("enter"), "the corpus reaches the decoder").toBe(true);
    expect(produced.has("return"), "and `return` is not a name it emits").toBe(false);

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = `${dir}/${entry}`;
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts")) files.push(path);
      }
    };
    walk("src");

    const offenders: string[] = [];
    const contributors = new Set<string>();
    let scanned = 0;
    // `key.name`, `e.key.name`, `k.name` — the comparison, not the assignment,
    // because the decoder itself is where these names are *made*.
    const literal = /\bkey\.name\s*[=!]==?\s*"([^"]*)"/g;
    for (const file of files) {
      if (file.endsWith("src/interaction/router/decode.ts")) continue; // where they come from
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(literal)) {
        const name = m[1] ?? "";
        scanned += 1;
        contributors.add(file);
        if (!produced.has(name)) offenders.push(`${file}: "${name}"`);
      }
    }

    // **A floor, because zero literals passes exactly like zero offenders** —
    // a regex that stopped matching would report a clean tree. A03 §2's vacuity
    // class, applied to this test.
    //
    // **The floor came down from 5 when the scroll table left `construct.ts`**
    // (C16 I23), and a bare number is the wrong shape for that: it is lowered
    // to match whatever the tree happens to hold, which is the assertion
    // following the code rather than constraining it. So the files are named as
    // well. Both still hold comparisons for reasons that are not going away —
    // the Ctrl-C rungs discriminate on `d` and `c` in `router.ts`, and
    // `construct.ts` tests `enter` for submission — and a rename that emptied
    // either fails here rather than quietly halving the scan.
    expect(scanned, "the scan found the comparisons it exists to read").toBeGreaterThan(2);
    expect(
      [...contributors].sort(),
      // **Three now** (M5): `intercepts.ts` classifies the three reserved routes
      // §103 reads before the ladder, and two of them are keys — `pageup`,
      // `pagedown`, `up`, `down` and `c`. It is the newest reason a key name is
      // compared in `src/`, and naming it here is what keeps the floor a
      // statement about the tree rather than a number that follows it.
      "the three files that hold key-name comparisons, named so the floor cannot drift down alone",
    ).toEqual([
      "src/interaction/router/intercepts.ts",
      "src/interaction/router/router.ts",
      "src/shell/construct.ts",
    ]);
    expect(offenders, "a key nothing can press").toEqual([]);
  });
});

/** The escape byte, spelled once: a literal one reads as nothing on a screen. */
const ESC = String.fromCharCode(27);

describe("C16 §6a — two profiles, and the registry's authority over the table (M6)", () => {
  const REGISTRY = JSON.parse(
    readFileSync("docs/design/language/calcium-registry.json", "utf8"),
  ) as { bindings: readonly Readonly<{ actionId: string; chord: string; scope: string; kind: string; status: string }>[] };

  const enc = new TextEncoder();
  const press = (seq: string): Key | null => {
    const d = createDecoder({
      capabilities: { bracketedPaste: true, mouse: true, keyboardProtocol: "none" } as never,
      now: () => 0,
    });
    const evs = [...d.push(enc.encode(seq)), ...d.poll()];
    const k = evs.find((e) => e.kind === "key");
    return k !== undefined && k.kind === "key" ? k.key : null;
  };

  it("T1.95 (I42): the generator reproduces `registry-bindings.ts` byte for byte", () => {
    // **What stops a generated file becoming a second hand-written record with a
    // longer name.** The file is committed, so it can be edited; this is the row
    // that notices. `--check` is the same comparison the pre-commit hook runs.
    const out = spawnSync("node", ["tools/generate-keymap.mjs", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(out.status, `${out.stdout}${out.stderr}`).toBe(0);
  });

  it("T1.96 (I42): every registry key binding reaches the generated file, by equality", () => {
    // **By equality, not containment.** A subset check passes a generator that
    // silently dropped a binding — which is the failure mode of a filter, and
    // this file is built by one (`kind === "key" && status === "current"`).
    const registry = JSON.parse(
      readFileSync(join(ROOT, "docs/design/language/calcium-registry.json"), "utf8"),
    ) as { bindings: readonly { kind: string; status: string; actionId: string }[] };
    const expected = registry.bindings
      .filter((b) => b.kind === "key" && b.status === "current")
      .map((b) => b.actionId)
      .sort();

    expect(
      REGISTRY_BINDINGS.map((b) => b.actionId).sort(),
      "the registry's current key bindings, all of them and no others",
    ).toEqual(expected);

    // And each one's chord is spellable as a `Key` — the generator throws rather
    // than emitting a null, so this asserts the shape that survived it.
    for (const b of REGISTRY_BINDINGS) {
      expect(b.key.name, `${b.actionId} has a name`).not.toBe("");
    }

    // **`chordOf`'s guard, pinned by its source, and the reason is a mutation
    // that survived.** Replacing the throw with a fallback key fails nothing:
    // the branch is unreachable while the assertion above holds, because every
    // `actionId` a row names is present. So the guard is defence for a state
    // this row makes impossible, and its only witness is that it is written —
    // which is the shape T1.38 already uses for `keys.ts`'s reservations.
    //
    // A fallback would be the worse failure of the two: a registry rename would
    // bind a chord nobody asked for and every row here would stay green, where a
    // throw makes the module unloadable and says which id went missing.
    const src = readFileSync(join(ROOT, "src/interaction/router/keymap.ts"), "utf8");
    expect(
      src,
      "chordOf throws on an unknown actionId rather than defaulting a chord",
    ).toContain("throw new Error(`no registry binding for ${actionId}`)");
  });

  it("T1.97 (I42): the table is the rows it was — generation moved where a chord is written and nothing else", () => {
    // **The row that makes M6 a refactor rather than a change.** 122 rows,
    // compared as a set of `(target, key, action, profile)`; 59 of them take
    // their chord from the registry through `chordOf`. If generation had altered
    // one chord, one target or one profile, this is where it shows.
    //
    // **121 until M8**, which moved six rows from `overlay` to `panel` and added
    // the 122nd: `escape → dismiss` is bound at both, because a panel is
    // escapable by its kind and an overlay by its `dismissal` (C15 I26, I27).
    // **124 from M9**: the captured child's `host.detach`, once per profile.
    // They are the only two rows at `child`, because the child's handler
    // consumes what it does not bind and there is nothing else to list.
    //
    // The count is pinned as well as the set: a table that lost a row *and*
    // gained an equal one would satisfy a set comparison alone.
    const rows = defaultKeymap
      .map((b) => `${b.target}\t${keyText(b.key)}\t${b.action}\t${b.profile ?? "both"}`)
      .sort();
    expect(rows).toHaveLength(124);
    expect(new Set(rows).size, "no two rows are identical").toBe(124);

    // Every row whose chord the registry names resolves to the registry's key —
    // the join asserted from the table's side, so a `chordOf` call that silently
    // fell back to a literal would fail here.
    const byAction = new Map(REGISTRY_BINDINGS.map((b) => [b.actionId, keyText(b.key)]));
    const registryChords = new Set(byAction.values());
    const fromRegistry = defaultKeymap.filter((b) => registryChords.has(keyText(b.key)));
    expect(
      fromRegistry.length,
      // 60 and not 61: `host.detach` has two registry bindings, and the set
      // this counts against is a set of **chord texts** — `⌥esc` is already in
      // it as the `escape` action's own enhanced spelling, so the second row
      // joins an entry rather than adding one. Counting bindings would give 61
      // and would be counting a different thing.
      "the rows the registry supplies a chord for",
    ).toBe(60);
  });

  it("T1.94 (I41): ⌘↑ and ⌥↑ are two actions under the enhanced profile and one under the base", () => {
    // **The pair I34's accidental resolution could not distinguish.** `⌘↑` and
    // `↑` were one key because `Key` had no `super`; `⌘↑` and `⌥↑` were one key
    // because the decoder folded bit 8. This asserts the outcome rather than
    // either mechanism: the bytes reach two different actions.
    const resolve = (bytes: string, protocol: "none" | "kitty"): string | undefined => {
      const d = createDecoder({
        capabilities: { bracketedPaste: true, mouse: true, keyboardProtocol: protocol },
        now: () => 0,
      });
      const first = d.push(new TextEncoder().encode(bytes))[0];
      if (first === undefined || first.kind !== "key") return undefined;
      const km = createKeymap(
        defaultKeymap,
        protocol === "kitty" ? "enhanced-terminal" : "default-terminal",
      );
      return km.resolve("global", first.key)?.action;
    };

    expect(resolve("\u001b[1;9A", "kitty"), "⌘↑ is transcript.top").toBe("scrollTop");
    expect(resolve("\u001b[1;9B", "kitty"), "⌘↓ is transcript.bottom").toBe("scrollBottom");
    expect(resolve("\u001b[1;3A", "kitty"), "⌥↑ is still the page").toBe("scrollPageUp");
    expect(resolve("\u001b[1;3B", "kitty"), "⌥↓ is still the page").toBe("scrollPageDown");

    // **Under the base profile the old note is right and stays right.** Without
    // the protocol bit 8 *is* Meta, so `⌘↑`'s bytes are `⌥↑`'s and land on the
    // page — which is why the restored rows are `enhanced-terminal` only.
    expect(resolve("\u001b[1;9A", "none"), "no protocol: ⌘↑ genuinely is ⌥↑").toBe("scrollPageUp");
    expect(resolve("\u001b[1;9B", "none"), "and ⌘↓ is ⌥↓").toBe("scrollPageDown");
  });

  it("T1.34 (I34): `⌘1` and `⌥1` are different keys, and only the csi-u arm sets `super`", () => {
    // **The measurement §6a is built on, as a row.** Two registry bindings
    // resolved against the live keymap by accident because `Key` had no `super`:
    // `⌘↑` *was* `↑`. A modifier the type cannot hold is one the keymap cannot
    // refuse, and the failure mode is silent agreement rather than a collision.
    const cmd1 = press(`${ESC}[49;9u`);
    const alt1 = press(`${ESC}1`);
    expect(cmd1?.name, "⌘1 is the digit").toBe("1");
    expect(cmd1?.super, "and the protocol said super").toBe(true);
    expect(alt1?.name, "⌥1 is the same digit").toBe("1");
    expect(alt1?.super, "and this terminal could not say — absent, not false").toBeUndefined();
    expect(keyText(cmd1!), "so they are different slots").not.toBe(keyText(alt1!));

    // **The legacy arm keeps folding bit 8 into `meta`, deliberately**, and this
    // is the control that stops `super` leaking into a terminal that never
    // reported the protocol: `CSI 1;9A` carries the same bit and answers `⌥↑`.
    // That is also why `⌘↑` has no route — see the keymap's note.
    const legacy = press(`${ESC}[1;9A`);
    expect(legacy?.name).toBe("up");
    expect(legacy?.meta, "bit 8 folds to meta on the legacy arm").toBe(true);
    expect(legacy?.super, "and never to super").toBeUndefined();
  });

  it("T1.35 (I35): a profile is a condition — one table, and `resolve` refuses the wrong one", () => {
    // Two keymaps would be two things to keep in step and `/help` would render
    // one of them, which is the drift §6's opening paragraph forbids. So the
    // rows live together and the terminal decides which fire.
    const base = createKeymap(defaultKeymap, "default-terminal");
    const rich = createKeymap(defaultKeymap, "enhanced-terminal");
    const only = defaultKeymap.filter((b) => b.profile === "enhanced-terminal");

    // **The set, by equality, because a walk is blind to a row leaving it.**
    // Measured: dropping `profile` from the `⌃⇧V` row made it unconditional —
    // a chord bound on terminals that can never send it — and every row below
    // stayed green, because the mutation removed its own subject from the
    // corpus. §6a's table names exactly which actions need a second route, so
    // the list is a claim and not an inventory.
    expect(
      only.map((b) => `${b.action} ${keyText(b.key)}`).sort(),
      "the enhanced routes §6a names, and no others",
    ).toEqual([
      "agent1 u+1",
      "agent2 u+2",
      "agent3 u+3",
      "agent4 u+4",
      "agent5 u+5",
      "agent6 u+6",
      "agent7 u+7",
      "agent8 u+8",
      "agent9 u+9",
      "agentNext c+tab",
      "agentPrevious cs+tab",
      "copySelection cs+c",
      // **`⌥esc`, enhanced only** (I49, R-BLK-908). Without the protocol it is
      // `ESC ESC`, which is the lone-`Esc` disambiguation window rather than a
      // chord — and `esc` belongs to the child, so a base-profile row would
      // take the child's own key away on the terminals least able to say so.
      // `⌃]` is the base route and is unconditional, which is the pair.
      "hostDetach m+escape",
      // **`transcript.top`/`transcript.bottom`, enhanced only** (I41). Without
      // the protocol bit 8 is Meta, so these bytes *are* `⌥↑`/`⌥↓` and the rows
      // would collide with `scrollPageUp`/`scrollPageDown`. The profile is what
      // keeps them apart, which is this row's whole subject.
      "scrollBottom u+down",
      "scrollTop u+up",
      "yank cs+v",
    ]);

    for (const b of only) {
      const key: Key = {
        name: b.key.name,
        ctrl: b.key.ctrl ?? false,
        meta: b.key.meta ?? false,
        shift: b.key.shift ?? false,
        ...(b.key.super === true ? { super: true } : {}),
        sequence: b.key.name,
      };
      expect(rich.resolve(b.target, key), `${keyText(b.key)} fires on an enhanced terminal`).toBe(b);
      expect(base.resolve(b.target, key), `${keyText(b.key)} does not fire on a default one`).not.toBe(b);
    }

    // And `entries()` — what `/help` reads — carries only what can fire, so a
    // reader is never shown a chord their terminal cannot deliver.
    expect(base.entries().some((b) => b.profile === "enhanced-terminal")).toBe(false);
    expect(rich.entries().some((b) => b.profile === "enhanced-terminal")).toBe(true);
  });

  it("T1.36 (I36): every action in the table has a `default-terminal` route", () => {
    // An action reachable only where the protocol is reported is an action most
    // readers cannot reach. The enhanced rows are additions, never the only way.
    const base = new Set(
      defaultKeymap.filter((b) => b.profile !== "enhanced-terminal").map((b) => b.action),
    );
    const enhancedOnly = [...new Set(defaultKeymap.map((b) => b.action))].filter(
      (a) => !base.has(a),
    );
    expect(enhancedOnly, "no action is reachable only on an enhanced terminal").toEqual([]);
    // The control: the walk had a corpus, and there really are enhanced rows to
    // have failed it.
    expect(base.size).toBeGreaterThan(40);
    expect(defaultKeymap.some((b) => b.profile === "enhanced-terminal")).toBe(true);
  });

  it("T1.37 (I37): every current registry binding resolves, or is declared with the site that handles it", () => {
    // **The gate that makes the registry normative without deleting the table**
    // (R-KEY-007). The registry names 39 bindings; this table holds 85 rows over
    // ~65 actions, so agreement is asked of the rows the design speaks to.
    //
    // Three arms, and the third is the one that needs its owner named: without
    // it, *the design says `⇥` moves focus and the tree completes* and *the
    // design says `⇥` moves focus and nobody noticed* read identically.
    const ELSEWHERE: Readonly<Record<string, string>> = Object.freeze({
      // Handled outside the keymap, by a named site.
      confirm: "src/shell/construct.ts — the prompt's submit row; `overlay enter` and `liveBlock enter` are this table's",
      escape: "src/interaction/router/router.ts — the ladder's rungs; `overlay`, `copyMode`, `pushedView` and `child` each have one",
      interrupt: "src/interaction/router/intercepts.ts — a reserved route read before the ladder (§103)",
      "help.command": "src/data/manifest/framework.ts — `/help` is a verb, and `/help keys` is what `?` and F1 submit",
      // Owner captures, under R-KEY-003's own *unless the current owner
      // explicitly captures the action* clause. The owner is named because that
      // is what separates a ruled capture from an unnoticed disagreement.
      "focus.next": "captured by `prompt` for `complete` (C19 §6); `liveBlock`, `overlay` and `pushedView` each move focus on it",
      "move.up": "captured by `prompt` for `historyPrev` (C20); `liveBlock` moves a row and `overlay` a menu item",
      "move.down": "captured by `prompt` for `historyNext` (C20); `liveBlock` moves a row and `overlay` a menu item",
      "move.left": "captured by `prompt` for `left` (C17); `liveBlock` moves the crosshair",
      "move.right": "captured by `prompt` for `acceptGhostOrForward` (C19 §6)",
      "selection.up": "captured by `liveBlock` for `extendRowUp`; the prompt is one line and has no row above",
      "selection.down": "captured by `liveBlock` for `extendRowDown`; the prompt is one line and has no row below",
      "transcript.top": "`⌃home` → `scrollTop`; `⌘↑` has no wire form this decoder can tell from `⌥↑` — see the keymap's note",
      "transcript.bottom": "`⌃end` → `scrollBottom`; `⌘↓` likewise",
    });

    // The design's action name against this table's. Explicit, because the two
    // vocabularies were written years apart and a fuzzy match would make the
    // gate agree with itself.
    const ACTION_OF: Readonly<Record<string, string>> = Object.freeze({
      newline: "insertNewline",
      "focus.previous": "focusTranscript",
      "selection.left": "extendCharLeft",
      "selection.right": "extendCharRight",
      copy: "copySelection",
      paste: "yank",
      "help.f1": "helpKeymap",
      "help.question": "helpKeymap",
      "agent.next": "agentNext",
      "agent.previous": "agentPrevious",
      "agent.1": "agent1",
      "agent.2": "agent2",
      "agent.3": "agent3",
      "agent.4": "agent4",
      "agent.5": "agent5",
      "agent.6": "agent6",
      "agent.7": "agent7",
      "agent.8": "agent8",
      "agent.9": "agent9",
      "page.up": "scrollPageUp",
      "page.down": "scrollPageDown",
      "posture.cycle": "postureCycle",
      "values.toggle": "valuesToggle",
      "queue.drop": "queueDrop",
      "selection.native": "enterCopyMode",
      "selection.semantic": "enterSemanticSelection",
      // M9 — the captured child's one key (C16 I49, R-BLK-908). Two registry
      // bindings, one action: `⌃]` base and `⌥esc` enhanced.
      "host.detach": "hostDetach",
    });

    const base = createKeymap(defaultKeymap, "default-terminal");
    const rich = createKeymap(defaultKeymap, "enhanced-terminal");
    const current = REGISTRY.bindings.filter((b) => b.status === "current");
    expect(current.length, "the registry has bindings to check").toBeGreaterThan(30);

    const unanswered: string[] = [];
    for (const b of current) {
      if (b.actionId in ELSEWHERE) continue;
      const action = ACTION_OF[b.actionId];
      if (action === undefined) {
        unanswered.push(`${b.actionId} (${b.chord}) — no action named for it at all`);
        continue;
      }
      if (!defaultKeymap.some((row) => row.action === action)) {
        unanswered.push(`${b.actionId} (${b.chord}, ${b.scope}) → ${action}, which nothing binds`);
      }
    }
    expect(
      unanswered,
      "every current registry binding resolves, is handled by a named site, or is a declared capture",
    ).toEqual([]);

    // **The declaration list is driven, not a licence** (F102): an entry for a
    // binding the registry no longer has is a premise nobody re-checked.
    const ids = new Set(current.map((b) => b.actionId));
    expect(
      Object.keys(ELSEWHERE).filter((k) => !ids.has(k)),
      "no declaration outlives the binding it excuses",
    ).toEqual([]);

    // And the maps were built, so the two above are not satisfied by an empty
    // table — `createKeymap` throws on a collision, which is half the gate.
    expect(base.entries().length).toBeGreaterThan(80);
    expect(rich.entries().length).toBeGreaterThan(80);
  });

  it("T1.38 (I38): every reserved chord carries an explicit no-op, and none of them acts", () => {
    // §6's closed set makes an action with no executor uncompilable, so the
    // alternative to a declared no-op is leaving the chord unbound — and an
    // unbound chord is one an application takes.
    const RESERVED = [
      "agentNext", "agentPrevious", "agent1", "agent2", "agent3", "agent4", "agent5",
      "agent6", "agent7", "agent8", "agent9", "postureCycle", "valuesToggle", "queueDrop",
      "enterSemanticSelection",
    ] as const;
    for (const action of RESERVED) {
      expect(
        defaultKeymap.some((b) => b.action === action),
        `${action} has a chord reserved for it`,
      ).toBe(true);
    }
    // **And the executor is the declared no-op, read out of L4's table** — the
    // half that makes this a reservation rather than a list. `expect(RESERVED
    // .length).toBe(15)` was here first and is an array literal's own length:
    // A03 §2's vacuity class, written by hand.
    const effects = readFileSync("src/shell/keys.ts", "utf8");
    for (const action of RESERVED) {
      expect(
        new RegExp(`\\n\\s*${action}: reserved,`, "u").test(effects),
        `${action} is bound to the declared no-op, not to an effect that happens to do nothing`,
      ).toBe(true);
    }
    // The control: the pattern finds nothing for an action that *does* act, so
    // the loop above is not satisfied by a regex that matches anything.
    expect(/\n\s*insertNewline: reserved,/u.test(effects), "an acting effect is not reserved").toBe(false);
  });
});
