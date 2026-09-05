/**
 * C16 §2, §7 — decoding. Tiers 1 and 3.
 *
 * The decoder is the only part of C16 with no dependency on C13, C14, C15 or
 * C06, so it is tested here against bytes alone. Every cell of §7's two tables
 * is covered, and the two paste machines carry their negative controls in the
 * same test as their positive ones — a fixture that only ever sends a fast burst
 * proves the timer exists and not that it discriminates
 * (`test/support/README.md`).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createDecoder, ESC_DISAMBIGUATION_MS } from "../../src/interaction/router/decode.js";
import type { Decoder, InputEvent } from "../../src/interaction/router/types.js";

const enc = new TextEncoder();

/** A clock the test moves by hand; C16 reads no ambient time (I9). */
function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function decoder(
  over: Partial<{ bracketedPaste: boolean; mouse: boolean }> = {},
  c = clock(),
): { d: Decoder; c: ReturnType<typeof clock> } {
  const d = createDecoder({
    capabilities: { bracketedPaste: true, mouse: true, ...over },
    now: c.now,
  });
  return { d, c };
}

const feed = (d: Decoder, s: string): readonly InputEvent[] => d.push(enc.encode(s));

const names = (events: readonly InputEvent[]): string[] =>
  events.map((e) => (e.kind === "key" ? e.key.name : e.kind));

type Mouse = Extract<InputEvent, { kind: "mouse" }>;

/**
 * A whole mouse record with every flag false and the pointer at the origin, so
 * each row spells out only what the sequence under test sets — and `toEqual`
 * still checks the rest is *unset*. A helper that defaulted a flag to `true`
 * would pass a decoder that set every bit.
 */
const mouse = (over: Partial<Mouse> & Pick<Mouse, "button"> | Partial<Mouse>): Mouse => ({
  kind: "mouse",
  row: 0,
  col: 0,
  button: "button0",
  press: true,
  shift: false,
  meta: false,
  ctrl: false,
  motion: false,
  ...over,
});

describe("C16 §2 — key decoding", () => {
  it("T1.3h (I17): `\\r` is enter and `\\n` is Ctrl-J — asserted as a pair", () => {
    // They were the same event, and only `\r` was ever asserted. A binding on
    // Ctrl-J — one of the two terminal-independent newline bindings C17 I12
    // requires — resolved against something nothing could produce, and the
    // table still read as satisfied because the row was there.
    //
    // The pair is one test deliberately: either half alone passes under the
    // collapse, since `enter` for both satisfies the first and `Ctrl-J` for
    // both satisfies the second.
    const { d } = decoder();

    expect(feed(d, "\r")).toEqual([
      { kind: "key", key: { name: "enter", ctrl: false, meta: false, shift: false, sequence: "\r" } },
    ]);
    expect(feed(d, "\n")).toEqual([
      { kind: "key", key: { name: "j", ctrl: true, meta: false, shift: false, sequence: "\n" } },
    ]);
  });

  it("T1.3j (I17): Shift-Enter decodes, in both forms a terminal sends it", () => {
    // The third instance, and the one the mechanical check found rather than a
    // person. `u` is not in the letter table and `27` is not in the tilde
    // table, so both sequences were discarded as well-formed-but-unknown —
    // which reads identically to a key the terminal did not send.
    //
    // **Both forms in one test**, because a terminal sends one or the other:
    // supporting either alone leaves the binding unreachable on half of them,
    // and a test asserting either alone passes in that state.
    const { d } = decoder();

    expect(feed(d, "[13;2u")).toEqual([
      { kind: "key", key: { name: "enter", ctrl: false, meta: false, shift: true, sequence: "[13;2u" } },
    ]);
    expect(feed(d, "[27;2;13~")).toEqual([
      { kind: "key", key: { name: "enter", ctrl: false, meta: false, shift: true, sequence: "[27;2;13~" } },
    ]);

    // And an ordinary letter through the same branch, so the fix is a codepoint
    // path rather than an Enter special case.
    expect(feed(d, "[97;5u")).toEqual([
      { kind: "key", key: { name: "a", ctrl: true, meta: false, shift: false, sequence: "[97;5u" } },
    ]);
  });

  it("T1.3p (C16 §2, C02 I12): the kitty `CSI u` arm — whole records, event type optional", () => {
    // **Every row asserts the whole record with `toStrictEqual`**, because the
    // field under test is optional: `toEqual` treats `event: undefined` and no
    // `event` as the same record, and the claim here is that legacy sequences
    // carry *no* field, not an undefined one.
    const { d } = decoder();
    const k = (name: string, sequence: string, over: Partial<{ ctrl: boolean; meta: boolean; shift: boolean }> = {}) =>
      ({ name, ctrl: false, meta: false, shift: false, sequence, ...over });

    // Shift-Enter pressed — the row T1.3j already has, unchanged in shape.
    expect(feed(d, "\x1b[13;2u")).toStrictEqual([{ kind: "key", key: k("enter", "\x1b[13;2u", { shift: true }) }]);
    // Esc under the protocol: a complete sequence, so no window and no prefix.
    expect(feed(d, "\x1b[27u")).toStrictEqual([{ kind: "key", key: k("escape", "\x1b[27u") }]);
    // A repeat and a release, with the modifier intact on both. **This is the
    // line that was wrong**: `Number("2:3")` is NaN, so `13;2:3` used to arrive
    // as a bare `enter` with every modifier gone — the live-binding class.
    expect(feed(d, "\x1b[13;2:2u")).toStrictEqual([
      { kind: "key", key: k("enter", "\x1b[13;2:2u", { shift: true }), event: "repeat" },
    ]);
    expect(feed(d, "\x1b[13;2:3u")).toStrictEqual([
      { kind: "key", key: k("enter", "\x1b[13;2:3u", { shift: true }), event: "release" },
    ]);
    // An explicit press carries the field; an absent sub-parameter does not.
    expect(feed(d, "\x1b[97;1:1u")).toStrictEqual([{ kind: "key", key: k("a", "\x1b[97;1:1u"), event: "press" }]);
    // ctrl+shift+a: 1 + (1 | 4) = 6.
    expect(feed(d, "\x1b[97;6u")).toStrictEqual([
      { kind: "key", key: k("a", "\x1b[97;6u", { ctrl: true, shift: true }) },
    ]);
    // An alternate key code (`97:65`, flag 4) is ignored in favour of the base.
    expect(feed(d, "\x1b[97:65;2u")).toStrictEqual([{ kind: "key", key: k("a", "\x1b[97:65;2u", { shift: true }) }]);
  });

  it("T1.3q (C16 §2): the `u` arm's modifier bits are kitty's — bit 8 folds into nothing, bit 32 into meta", () => {
    const { d } = decoder();
    const only = (s: string) => {
      const [e] = feed(d, s);
      return e?.kind === "key" ? { ctrl: e.key.ctrl, meta: e.key.meta, shift: e.key.shift } : e;
    };
    // alt: 1 + 2 = 3 → meta. kitty meta: 1 + 32 = 33 → meta. Both, 35 → meta.
    expect(only("\x1b[97;3u")).toEqual({ ctrl: false, meta: true, shift: false });
    expect(only("\x1b[97;33u")).toEqual({ ctrl: false, meta: true, shift: false });
    // super: 1 + 8 = 9 → **no modifier**. `⌘a` is not `Alt-a`.
    expect(only("\x1b[97;9u")).toEqual({ ctrl: false, meta: false, shift: false });
    // And the control the row needs: the same bit *is* meta through the xterm
    // arm, so a decoder that shared one function between the two would fail one
    // of the two rows rather than passing both.
    expect(only("\x1b[1;9D")).toEqual({ ctrl: false, meta: true, shift: false });
  });

  it("T1.3r (C16 §2, C02 §3): a lone modifier key arrives named, never as a private-use glyph", () => {
    // The flags C01 pushes do not ask for these (bit 8 is not pushed); a terminal
    // configured to send them anyway must not insert U+E061 into the prompt.
    const { d } = decoder();
    expect(names(feed(d, "\x1b[57441u"))).toEqual(["shift"]);
    expect(names(feed(d, "\x1b[57442;5u"))).toEqual(["ctrl"]);
    expect(names(feed(d, "\x1b[57447;2:3u"))).toEqual(["shift"]);
    expect(feed(d, "\x1b[57447;2:3u")[0]).toMatchObject({ event: "release" });
  });

  it("T1.3s (C16 §2): a `CSI u` sequence is decoded whatever the record says — the decoder takes no keyboard capability", () => {
    // xterm's `formatOtherKeys=1` sends the same bytes with no protocol pushed,
    // and the decoder has no way to know which encoder sent them. So the arm is
    // not gated, and a terminal that sends `CSI u` unasked still produces the key.
    const { d } = decoder({ bracketedPaste: false, mouse: false });
    expect(names(feed(d, "\x1b[13;2u"))).toEqual(["enter"]);
  });

  it("T1.3e (C16 §2, I17): xterm's Meta bit is read, so 1;10D and 1;16D are different keys", () => {
    // **The row that failed before `modifiersOf` read bit 8**, and the reason it
    // needed fabricating rather than finding. xterm's modifier parameter is
    // `1 + (shift 1 | alt 2 | ctrl 4 | meta 8)`, and this function read three of
    // the four — so Meta was dropped silently and the event arrived as a
    // **different, live** key rather than as nothing.
    //
    // Not the unexecuted-binding class T2.13 was built for. That class is a
    // binding no event can produce: dead, and silent, and a walk of the keymap
    // finds it. This one *worked*. `⌥⇧←` on a Meta-sending terminal decoded as
    // `⇧←`, so extend-by-word would have extended by character while every
    // assertion about `⇧←` passed — **a suite indexed by which keys the decoder
    // produces agrees with the defect, because it produces a perfectly good
    // key.** Nothing above the decoder can see it.
    //
    // **Both wire forms, and the pair is the assertion.** `1;16D` sets all four
    // bits and was correct *by accident* — the other three were set, so the
    // missing read changed nothing. Asserting it alone passes in the broken
    // state; asserting that the two forms differ is what fails.
    const { d } = decoder();

    // Meta-Left: every modifier was lost, and it arrived as a bare arrow.
    expect(feed(d, "[1;9D")).toEqual([
      { kind: "key", key: { name: "left", ctrl: false, meta: true, shift: false, sequence: "[1;9D" } },
    ]);

    // Meta-Shift-Left, the ⌥⇧← a terminal sends when Option is Meta rather than
    // Alt. This is the one that meant something else.
    const metaShift = feed(d, "[1;10D");
    expect(metaShift).toEqual([
      { kind: "key", key: { name: "left", ctrl: false, meta: true, shift: true, sequence: "[1;10D" } },
    ]);

    // Alt-Shift-Left — the *other* wire form of the same keystroke. Both bits
    // mean one key to every binding above, so the two forms must agree.
    expect(feed(d, "[1;4D")).toEqual([
      { kind: "key", key: { name: "left", ctrl: false, meta: true, shift: true, sequence: "[1;4D" } },
    ]);

    // Shift-Left, which is the key 1;10D used to become. The pair is the point:
    // these two must not be the same event.
    const shiftOnly = feed(d, "[1;2D");
    expect(shiftOnly).toEqual([
      { kind: "key", key: { name: "left", ctrl: false, meta: false, shift: true, sequence: "[1;2D" } },
    ]);
    expect(metaShift[0], "1;10D and 1;2D are different keys").not.toEqual(shiftOnly[0]);

    // All four bits — correct before the fix and after it, which is why it is
    // here as the control rather than as the subject.
    expect(feed(d, "[1;16D")).toEqual([
      { kind: "key", key: { name: "left", ctrl: true, meta: true, shift: true, sequence: "[1;16D" } },
    ]);
  });

  it("T1.3i (I17): a modified key carries the unmodified key's name", () => {
    // `Alt-Enter` arrived as {name: "\r", meta: true} — the byte, not the name
    // the keymap uses — so C17 I12's other terminal-independent newline binding
    // also resolved against an event nothing produced. Both halves of I12 were
    // broken in the decoder, in two different branches, and the keymap read as
    // complete either way.
    const { d } = decoder();
    const events = feed(d, "\u001b\r");

    expect(events).toEqual([
      { kind: "key", key: { name: "enter", ctrl: false, meta: true, shift: false, sequence: "\u001b\r" } },
    ]);
  });

  it("T1.1: byte sequences decode to the documented keys", () => {
    const { d } = decoder();
    const cases: ReadonlyArray<readonly [string, Partial<Record<string, unknown>>]> = [
      ["a", { name: "a", ctrl: false, meta: false }],
      ["Z", { name: "Z" }],
      ["\r", { name: "enter" }],
      ["\t", { name: "tab" }],
      ["", { name: "backspace" }],
      [" ", { name: "space" }],
      ["", { name: "a", ctrl: true }],
      ["", { name: "z", ctrl: true }],
      ["[A", { name: "up" }],
      ["[B", { name: "down" }],
      ["[C", { name: "right" }],
      ["[D", { name: "left" }],
      ["[H", { name: "home" }],
      ["[F", { name: "end" }],
      ["[3~", { name: "delete" }],
      ["[5~", { name: "pageup" }],
      ["[6~", { name: "pagedown" }],
      ["OP", { name: "f1" }],
      ["[15~", { name: "f5" }],
      ["x", { name: "x", meta: true }],
      ["[1;5A", { name: "up", ctrl: true }],
      ["[1;2D", { name: "left", shift: true }],
    ];

    for (const [bytes, want] of cases) {
      const [event] = feed(d, bytes);
      expect(event?.kind, bytes).toBe("key");
      if (event?.kind !== "key") continue;
      for (const [k, v] of Object.entries(want)) {
        expect(event.key[k as keyof typeof event.key], `${bytes} → ${k}`).toBe(v);
      }
    }
  });

  it("T1.2: a lone Esc is told from a sequence prefix by the window", () => {
    // The prefix case: more bytes arrive before the window elapses, so nothing
    // is emitted early and the sequence decodes whole.
    const { d, c } = decoder();
    expect(feed(d, ""), "nothing decidable yet").toEqual([]);
    c.advance(ESC_DISAMBIGUATION_MS - 1);
    expect(names(feed(d, "[A"))).toEqual(["up"]);

    // The lone case: the window elapses with nothing following.
    const two = decoder();
    expect(feed(two.d, "")).toEqual([]);
    two.c.advance(ESC_DISAMBIGUATION_MS);
    expect(names(two.d.poll())).toEqual(["escape"]);
  });

  it("T3.14: a multi-byte character split across two chunks is one key", () => {
    const { d } = decoder();
    const bytes = enc.encode("é");
    expect(bytes.length, "two bytes, so the split is real").toBe(2);

    expect(d.push(bytes.slice(0, 1)), "half a codepoint decides nothing").toEqual([]);
    const events = d.push(bytes.slice(1));
    expect(names(events)).toEqual(["é"]);
  });

  it("T3.13: a malformed sequence is discarded and the next key decodes", () => {
    const { d } = decoder();
    expect(names(feed(d, "[999Za"))).toEqual(["a"]);
  });
});

describe("C16 §7 — bracketed paste", () => {
  it("T1.4, T1.5, T1.6: buffering emits nothing, the end marker emits one paste", () => {
    const { d } = decoder();
    expect(feed(d, "[200~"), "T1.4: entering buffering emits nothing").toEqual([]);
    expect(feed(d, "hello world"), "T1.5 (I12): buffered bytes are not keys").toEqual([]);

    const events = feed(d, "[201~");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "paste", text: "hello world" });
  });

  it("T3.5, T3.6: a stray end marker is ignored; a second start does not nest", () => {
    const { d } = decoder();
    expect(feed(d, "[201~"), "T3.5: end with no start").toEqual([]);

    feed(d, "[200~");
    feed(d, "ab");
    expect(feed(d, "[200~"), "T3.6: second start ignored").toEqual([]);
    feed(d, "cd");
    expect(feed(d, "[201~")[0]).toEqual({ kind: "paste", text: "abcd" });
  });

  it("T3.2: an end-marker-like payload does not terminate the paste early", () => {
    const { d } = decoder();
    feed(d, "[200~");
    feed(d, "literally 201~ text");
    expect(d.poll().filter((e) => e.kind === "paste"), "still open").toEqual([]);
    expect(feed(d, "[201~")[0]).toEqual({ kind: "paste", text: "literally 201~ text" });
  });

  it("T3.3: control characters are stripped from the payload, not from keys", () => {
    const { d } = decoder();
    feed(d, "[200~");
    feed(d, "ab");
    expect(feed(d, "[201~")[0]).toEqual({ kind: "paste", text: "ab" });

    // The same byte as a keystroke is a key, not something to strip.
    expect(names(feed(d, ""))).toEqual(["g"]);
  });

  it("T3.4 (I12): an unterminated paste flushes after a second, never as keys", () => {
    const { d, c } = decoder();
    feed(d, "[200~");
    feed(d, "stalled");

    c.advance(999);
    expect(d.poll(), "not yet").toEqual([]);
    c.advance(1);

    const events = d.poll();
    expect(events).toEqual([{ kind: "paste", text: "stalled" }]);
  });

  it("T3.1: a very large paste is one event and no per-character work", () => {
    const { d } = decoder();
    const text = "x".repeat(100_000);
    feed(d, "[200~");
    feed(d, text);
    const events = feed(d, "[201~");

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: "paste", text });
  });
});

describe("C16 §7 — the paste heuristic", () => {
  it("T3.7: a burst is one paste and typing is keys — both, in one test", () => {
    // **The negative case is the positive control.** A fixture that only sends a
    // fast burst proves a timer exists; it does not prove the timer
    // discriminates, and a decoder that called everything a paste would pass the
    // first assertion alone.
    const burst = decoder({ bracketedPaste: false });
    feed(burst.d, "x".repeat(12));
    burst.c.advance(30);
    const pasted = burst.d.poll();
    expect(pasted).toHaveLength(1);
    expect(pasted[0]).toEqual({ kind: "paste", text: "x".repeat(12) });

    // Nine characters over 200 ms — above the eight-character threshold, so only
    // the timing can tell them apart.
    const typed = decoder({ bracketedPaste: false });
    const out: InputEvent[] = [];
    for (let i = 0; i < 9; i += 1) {
      out.push(...feed(typed.d, "a"));
      typed.c.advance(22);
      out.push(...typed.d.poll());
    }
    typed.c.advance(30);
    out.push(...typed.d.poll());

    expect(out.every((e) => e.kind === "key"), "no paste from typing").toBe(true);
    expect(out).toHaveLength(9);
  });

  it("T3.7 boundary: eight characters emit eight keys, nine emit one paste", () => {
    for (const [count, kind] of [[8, "key"], [9, "paste"]] as const) {
      const { d, c } = decoder({ bracketedPaste: false });
      feed(d, "y".repeat(count));
      c.advance(HEURISTIC_ELAPSE);
      const events = d.poll();
      expect(events[0]?.kind, `${String(count)} characters`).toBe(kind);
      expect(events, `${String(count)} characters`).toHaveLength(kind === "paste" ? 1 : count);
    }
  });

  it("T3.7b, T3.7c: an escape from idle is a key; mid-run it flushes the buffer", () => {
    const idle = decoder({ bracketedPaste: false });
    expect(feed(idle.d, "[A"), "T3.7b: no buffering begins").toHaveLength(1);

    // T3.7c — the cell §2's prose left open. Six printables then an escape: the
    // six are keys, and neither discarded nor emitted as a paste.
    const mid = decoder({ bracketedPaste: false });
    feed(mid.d, "abcdef");
    const events = feed(mid.d, "[A");
    expect(names(events)).toEqual(["a", "b", "c", "d", "e", "f", "up"]);
  });

  it("I6 on the heuristic path: bounded work, not one event", () => {
    // The qualification, asserted as the guarantee rather than as the wording.
    const { d, c } = decoder({ bracketedPaste: false });
    const chunks = 25;
    const events: InputEvent[] = [];
    for (let i = 0; i < chunks; i += 1) {
      events.push(...feed(d, "z".repeat(400)));
      c.advance(30);
      events.push(...d.poll());
    }
    c.advance(30);
    events.push(...d.poll());

    expect(events.length, "one event per window, not one per character").toBeLessThan(chunks + 5);
    expect(events.every((e) => e.kind === "paste")).toBe(true);
  });
});

describe("C16 §2 — the decoder writes nothing", () => {
  it("T2.9 (SS14): the decoder reaches no stream and emits no escape sequence", () => {
    // **The condition SS14's allow-entry is predicated on.** That entry lets this
    // one file hold escape literals because it *recognises* them; the moment it
    // emitted one it would be on the write path, and the entry would hide exactly
    // the thing SS14 exists to catch. So the allowance is paired with a check the
    // allowance cannot suppress.
    //
    // A source assertion rather than a spy, because there is no stream to spy on:
    // the module takes bytes and returns values, and proving it never writes means
    // proving it holds no writer.
    const src = readFileSync("src/interaction/router/decode.ts", "utf8");
    for (const forbidden of ["process.stdout", "process.stderr", ".write(", "console."]) {
      expect(src, `decode.ts must not reach a stream — found ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});

describe("C16 §4 — mouse", () => {
  it("T3.12 (I3): mouse events are dropped when the capability is absent", () => {
    const off = decoder({ mouse: false });
    expect(feed(off.d, "[<0;10;5M"), "dropped before decoding").toEqual([]);

    const on = decoder({ mouse: true });
    const events = feed(on.d, "[<0;10;5M");
    expect(events).toEqual([mouse({ row: 4, col: 9, button: "button0" })]);
  });

  it("a wheel event decodes as its own button, and release as press: false", () => {
    const { d } = decoder();
    expect(feed(d, "[<64;1;1M")).toEqual([mouse({ button: "wheelUp" })]);
    expect(feed(d, "[<65;1;1M")).toEqual([mouse({ button: "wheelDown" })]);
    expect(feed(d, "[<0;1;1m")).toEqual([mouse({ press: false })]);
  });
});

/**
 * C16 §2's SGR table (I30). Every row below asserts the **whole** record with
 * `toEqual`, because a row on `button` alone is satisfied by the decoder this
 * replaces — it produced a well-formed `button0` for a shift-click and a
 * well-formed `wheelDown` for ctrl-wheel-up, and nothing above it could tell.
 */
describe("C16 §2 — the SGR mouse arm carries every bit (I30)", () => {
  it("T1.3k (I30): ctrl-wheel-up is wheelUp with ctrl, not wheelDown", () => {
    const { d } = decoder();
    // 80 = 64 (wheel) + 16 (ctrl) + 0 (up). The shipped arm had `code === 64`
    // as the only wheel-up, so this scrolled the wrong way.
    expect(feed(d, "[<80;10;5M")).toEqual([
      mouse({ row: 4, col: 9, button: "wheelUp", ctrl: true }),
    ]);
    // The unmodified pair beside it is the control: a fix that reads bit 0 of
    // the wheel range must still tell these two apart.
    expect(feed(d, "[<64;10;5M")).toEqual([mouse({ row: 4, col: 9, button: "wheelUp" })]);
    expect(feed(d, "[<65;10;5M")).toEqual([mouse({ row: 4, col: 9, button: "wheelDown" })]);
    // Shift-wheel-down: 64 + 4 + 1.
    expect(feed(d, "[<69;1;1M")).toEqual([mouse({ button: "wheelDown", shift: true })]);
  });

  it("T1.3l (I30): a modified click carries shift, meta and ctrl", () => {
    const { d } = decoder();
    expect(feed(d, "[<4;10;5M")).toEqual([mouse({ row: 4, col: 9, button: "button0", shift: true })]);
    expect(feed(d, "[<8;10;5M")).toEqual([mouse({ row: 4, col: 9, button: "button0", meta: true })]);
    // 16, not 20: 20 is 16 + 4, ctrl *and* shift — the first draft of this row
    // said 20 and the whole-record assertion refused it.
    expect(feed(d, "[<16;10;5M")).toEqual([mouse({ row: 4, col: 9, button: "button0", ctrl: true })]);
    // All three on the middle button: 1 + 4 + 8 + 16.
    expect(feed(d, "[<29;10;5M")).toEqual([
      mouse({ row: 4, col: 9, button: "button1", shift: true, meta: true, ctrl: true }),
    ]);
    // The bare click beside them, so a decoder setting every flag true fails too.
    expect(feed(d, "[<2;10;5M")).toEqual([mouse({ row: 4, col: 9, button: "button2" })]);
  });

  it("T1.3m (I30): a drag is press, motion, release — and the motion report is not a second click", () => {
    const { d } = decoder();
    const events = feed(d, "[<0;1;1M[<32;2;1M[<0;3;1m");
    expect(events).toEqual([
      mouse({ row: 0, col: 0, button: "button0" }),
      mouse({ row: 0, col: 1, button: "button0", motion: true }),
      mouse({ row: 0, col: 2, button: "button0", press: false }),
    ]);
    // Motion with a modifier: 32 + 16 + 2 — a ctrl-drag on the right button.
    expect(feed(d, "[<50;5;5M")).toEqual([
      mouse({ row: 4, col: 4, button: "button2", ctrl: true, motion: true }),
    ]);
  });

  it("T1.3n (I30): horizontal wheel and buttons 8–11 have their own names", () => {
    const { d } = decoder();
    expect(feed(d, "[<66;1;1M")).toEqual([mouse({ button: "wheelLeft" })]);
    expect(feed(d, "[<67;1;1M")).toEqual([mouse({ button: "wheelRight" })]);
    const high = [128, 129, 130, 131].map((c) => feed(d, `[<${c};1;1M`)[0]);
    expect(high).toEqual([
      mouse({ button: "button8" }),
      mouse({ button: "button9" }),
      mouse({ button: "button10" }),
      mouse({ button: "button11" }),
    ]);
    // The 128 bit is read, not folded: 130 and 2 are different buttons.
    const low = feed(d, "[<2;1;1M")[0];
    expect(low).toEqual(mouse({ button: "button2" }));
    expect(high[2]).not.toEqual(low);
  });
});

describe("C16 §2 — reset across a suspension", () => {
  it("T1.16 (I18): each of the three pending states is discarded, emitting nothing", () => {
    // **Three cases, not one.** A reset that cleared only the escape window
    // passes any single-state test and still emits a child's keystrokes inside
    // the next paste — the paste buffer and the heuristic run span a suspension
    // just as readily.

    // 1 — a lone Esc waiting out its window.
    {
      const { d } = decoder();
      expect(names(feed(d, "")), "held, not yet decidable").toEqual([]);
      expect(d.nextDeadline(), "a deadline exists to be cleared").not.toBeNull();
      d.reset();
      expect(d.nextDeadline(), "and it is gone").toBeNull();
      // `[A` alone is not an arrow key; it is what an arrow key's tail looks
      // like. Two ordinary keys is the proof the Esc did not survive.
      expect(names(feed(d, "[A"))).toEqual(["[", "A"]);
    }

    // 2 — a paste accumulating between its markers.
    {
      const { d } = decoder();
      feed(d, "[200~child typed this");
      d.reset();
      const after = feed(d, "hi[201~");
      expect(
        after.filter((e) => e.kind === "paste"),
        "no paste, because no open marker survived the reset",
      ).toEqual([]);
      expect(names(after), "and the bytes after it are ordinary keys").toEqual(["h", "i"]);
    }

    // 3 — a run inside the heuristic's window.
    {
      const { d, c } = decoder({ bracketedPaste: false });
      feed(d, "abcdefghijkl");
      d.reset();
      c.advance(100);
      expect(d.poll(), "nothing is flushed: the window stopped mattering").toEqual([]);
    }
  });
});

const HEURISTIC_ELAPSE = 30;
