/**
 * Bytes to `InputEvent`s.
 *
 * C16 §2, §7 — see spec. C01 puts the terminal in raw mode; this interprets the
 * bytes, and that split is deliberate: raw mode is terminal *state*, decoding is
 * input.
 *
 * Three machines live here and only one of them is obvious. §7's two tables are
 * the paste machines — bracketed and heuristic — and the third is the `Esc`
 * disambiguation window, which has no table because it has one state and one
 * timeout. All three are driven from `now()` and none holds a timer (I9).
 *
 * **The invariant most easily broken in this file is I12**: bytes buffered during
 * a paste are never dispatched as individual keys. Every early return that
 * touches `paste` is therefore written to fall through to the buffer rather than
 * to the emitter, and `flushHeuristic` is the only path that turns buffered text
 * back into keys.
 */

import type {
  Decoder,
  DecoderOptions,
  InputEvent,
  Key,
} from "./types.js";

/** §2: more than 8 characters within 30 ms with no intervening escape. */
const HEURISTIC_WINDOW_MS = 30;
const HEURISTIC_MIN_CHARS = 8;

/** §10 T3.4: an unterminated bracketed paste flushes rather than swallowing input. */
const PASTE_TIMEOUT_MS = 1000;

/**
 * How long a lone `ESC` waits to see whether it is a sequence prefix.
 *
 * **The spec does not state this number.** §2 calls it "the documented window"
 * and T1.2 cites "the documented disambiguation window", and every other timing
 * constant in C16 is written down — 8 characters, 30 ms, 1 s, 500 ms — so the
 * omission reads as an oversight rather than as deliberate latitude. 50 ms is
 * the assumption in force until the spec says otherwise: it is `vim`'s
 * `ttimeoutlen` default and comfortably above a local terminal's inter-byte gap
 * within one sequence, while staying below the ~100 ms at which a keypress stops
 * feeling immediate.
 *
 * Named and exported so a ruling is a one-line change and so T1.2 can assert
 * against the constant rather than against a literal it would have to keep in
 * step by hand.
 */
export const ESC_DISAMBIGUATION_MS = 50;

const CSI_FINAL = /[A-Za-z~]/;

/** `ESC [ A` and friends — the arrows, and Home/End in their letter form. */
const CSI_LETTER_KEYS: Readonly<Record<string, string>> = Object.freeze({
  A: "up",
  B: "down",
  C: "right",
  D: "left",
  H: "home",
  F: "end",
  P: "f1",
  Q: "f2",
  R: "f3",
  S: "f4",
});

/** `ESC [ 5 ~` and friends — the numeric form, including the function keys. */
const CSI_TILDE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  "1": "home",
  "2": "insert",
  "3": "delete",
  "4": "end",
  "5": "pageup",
  "6": "pagedown",
  "7": "home",
  "8": "end",
  "11": "f1",
  "12": "f2",
  "13": "f3",
  "14": "f4",
  "15": "f5",
  "17": "f6",
  "18": "f7",
  "19": "f8",
  "20": "f9",
  "21": "f10",
  "23": "f11",
  "24": "f12",
});

/**
 * xterm's modifier encoding: the parameter is a bitfield plus one.
 *
 * Plus one, so 1 means "no modifiers" — which is why a bare `ESC [ 1 ; 1 A` and
 * a bare `ESC [ A` mean the same thing and neither sets a flag.
 *
 * **Four bits, and reading three of them was a live defect** (C16 §2, T1.3e).
 * xterm's bit 8 is Meta and this function ignored it, so `CSI 1;9D` — Meta-Left —
 * arrived as a bare `left` and `CSI 1;10D` — Meta-Shift-Left — arrived as
 * `s+left`, which **is a bound key meaning something else**. Not the
 * unexecuted-binding class: that class is a binding no event can produce, dead
 * and silent. This one worked, and was wrong, and no test above the decoder could
 * see it because the decoder was producing a perfectly good key. `CSI 1;16D` —
 * all four bits — was correct by accident, since the other three were set.
 *
 * **Alt and Meta both set `meta`, deliberately.** `Key` carries one flag for the
 * pair and every binding above treats them as one key: a terminal sending Option
 * as Alt (bit 2) and one sending it as Meta (bit 8) are describing the same
 * keystroke, and splitting them here would put the terminal's configuration into
 * the keymap.
 */
function modifiersOf(param: string | undefined): Pick<Key, "ctrl" | "meta" | "shift"> {
  const bits = param === undefined ? 0 : Math.max(0, Number(param) - 1);
  return {
    shift: (bits & 1) !== 0,
    meta: (bits & 2) !== 0 || (bits & 8) !== 0,
    ctrl: (bits & 4) !== 0,
  };
}

/**
 * kitty's modifier field, for the `u` arm alone (C02 §3, C16 §2).
 *
 * Plus one, like xterm's, and the low three bits agree — shift 1, alt 2, ctrl 4.
 * **Bit 8 is folded into nothing**: it is xterm's Meta and kitty's Super, and
 * `⌘a` arriving as `Alt-a` is the live-binding class `modifiersOf`'s comment
 * records, one encoding over. kitty's own meta is bit 32 and joins alt in
 * `meta`, the pair the `CSI 1;m X` arm already folds. Stated blind spot: an
 * xterm at `formatOtherKeys=1` loses a Meta modifier here; its default format is
 * `CSI 27;m;k ~`, which `modifiersOf` keeps.
 */
function kittyModifiersOf(param: string | undefined): Pick<Key, "ctrl" | "meta" | "shift"> {
  const bits = param === undefined || param === "" ? 0 : Math.max(0, Number(param) - 1);
  // Written as `=== bit` rather than `!== 0` so these three lines do not
  // duplicate `modifiersOf`'s: `tools/mutate/runs/c16-modifiers.mjs` anchors on
  // that function's text, and an anchor matching twice is a run that edits the
  // wrong function (MA4).
  return {
    shift: (bits & 1) === 1,
    meta: (bits & 2) === 2 || (bits & 32) === 32,
    ctrl: (bits & 4) === 4,
  };
}

/** `:1` press, `:2` repeat, `:3` release; anything else is no event field at all. */
const KITTY_EVENT: Readonly<Record<string, "press" | "repeat" | "release">> = Object.freeze({
  "1": "press",
  "2": "repeat",
  "3": "release",
});

/**
 * The modifier keys' functional codes, so a terminal that reports a lone `⇧`
 * yields a named key rather than a private-use glyph inserted into the prompt.
 * The flags C01 pushes do not ask for these (C02 §3's table, bit 8); a terminal
 * configured to send them regardless still gets a name.
 */
const KITTY_MODIFIER_KEYS: Readonly<Record<number, string>> = Object.freeze({
  57441: "shift",
  57442: "ctrl",
  57443: "alt",
  57444: "super",
  57445: "hyper",
  57446: "meta",
  57447: "shift",
  57448: "ctrl",
  57449: "alt",
  57450: "super",
  57451: "hyper",
  57452: "meta",
});

function key(
  name: string,
  sequence: string,
  mods: Partial<Pick<Key, "ctrl" | "meta" | "shift">> = {},
  event?: "press" | "repeat" | "release",
): InputEvent {
  const k = Object.freeze({
    name,
    ctrl: mods.ctrl ?? false,
    meta: mods.meta ?? false,
    shift: mods.shift ?? false,
    sequence,
  });
  // The field is *absent*, not `undefined`, when the sequence carried no event
  // type: `toStrictEqual` tells the two apart and every record above is legacy.
  return event === undefined
    ? Object.freeze({ kind: "key", key: k })
    : Object.freeze({ kind: "key", key: k, event });
}

/**
 * C09 I18 at the input boundary (T3.3).
 *
 * Applied to paste payloads only. A control character arriving as a *keystroke*
 * is a key — `Ctrl-A` is 0x01 — and stripping there would delete the ctrl
 * bindings. In a paste it is content that would move the cursor or change the
 * colour of everything after it.
 */
/**
 * The wheel's four directions, indexed by `Cb & 3` when bit 64 is set (§2's
 * table): xterm reports a horizontal wheel as buttons 6 and 7, which is 64 + 2
 * and 64 + 3. Order is the wire encoding, not a preference.
 */
const WHEEL_DIRECTIONS = ["wheelUp", "wheelDown", "wheelLeft", "wheelRight"] as const;

function stripControls(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** The single-byte keys that are not letters. */
function namedControl(ch: string): InputEvent | null {
  switch (ch) {
    // `\r` and `\n` are different keys (I17). Enter sends `\r` in raw mode and
    // Ctrl-J sends `\n`, so collapsing them removes one of the two
    // terminal-independent newline bindings C17 I12 requires — a binding that
    // resolves against an event nothing can produce, which is §5's
    // unconstructible-rung class one layer lower. It also decides what a
    // newline inside an unbracketed paste means: `enter` submits every line of
    // a pasted block, `Ctrl-J` inserts it.
    case "\r":
      return key("enter", ch);
    case "\n":
      return key("j", ch, { ctrl: true });
    case "\t":
      return key("tab", ch);
    case "":
      return key("backspace", ch);
    case "\u001b":
      return key("escape", ch);
    case " ":
      return key("space", ch);
    default:
      return null;
  }
}

/**
 * A codepoint parameter, named the way the same key is named unprefixed.
 *
 * Reuses `namedControl` rather than carrying a second table: I17's whole
 * subject is that one key has one name, and a second naming path is how the
 * meta branch came to call Enter `\r` while the keymap called it `enter`.
 */
function otherKeyName(param: string | undefined): string | null {
  const code = Number(param);
  if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) return null;
  const ch = String.fromCodePoint(code);
  const named = namedControl(ch);
  return named !== null && named.kind === "key" ? named.key.name : ch;
}

type PasteState =
  | Readonly<{ mode: "normal" }>
  | Readonly<{ mode: "buffering"; text: string; since: number }>;

type Heuristic = Readonly<{ text: string; opened: number }> | null;

export function createDecoder(options: DecoderOptions): Decoder {
  const { capabilities, now } = options;

  const utf8 = new TextDecoder("utf-8");
  let pending = "";
  let paste: PasteState = Object.freeze({ mode: "normal" });
  let heuristic: Heuristic = null;
  /** When a trailing lone `ESC` started waiting; `null` when none is. */
  let escSince: number | null = null;

  /**
   * Everything the heuristic accumulated, as events (§7's elapse cell).
   *
   * More than eight is one paste; eight or fewer are that many keys. This is the
   * **only** place buffered text becomes keys, which is what makes I12 checkable
   * by reading one function rather than by auditing every branch.
   */
  function flushHeuristic(out: InputEvent[]): void {
    if (heuristic === null) return;
    const { text } = heuristic;
    heuristic = null;
    if (text.length === 0) return;

    if (text.length > HEURISTIC_MIN_CHARS) {
      out.push(Object.freeze({ kind: "paste", text: stripControls(text) }));
      return;
    }
    for (const ch of text) out.push(namedControl(ch) ?? key(ch, ch));
  }

  /**
   * A printable on the heuristic path: buffer it, opening the window if closed.
   *
   * The window is stamped from the **first** buffered character and never
   * restamped — §7's "from the first, not the last". Restamping is the natural
   * thing to write and it is a gap timer, which nine characters at 22 ms apart
   * never closes.
   */
  function accumulate(ch: string, out: InputEvent[]): void {
    const t = now();
    if (heuristic !== null && t - heuristic.opened >= HEURISTIC_WINDOW_MS) {
      flushHeuristic(out);
    }
    heuristic =
      heuristic === null
        ? Object.freeze({ text: ch, opened: t })
        : Object.freeze({ text: heuristic.text + ch, opened: heuristic.opened });
  }

  /**
   * Decode from `pending[i]`, returning how many characters were consumed.
   *
   * Zero means "not yet decidable" — an incomplete sequence, or a trailing `ESC`
   * whose window has not elapsed — and the caller stops, leaving the remainder in
   * `pending` for the next chunk or poll. That single convention is what makes a
   * sequence split across chunks work without a second code path (T3.13, T3.14).
   */
  function decodeAt(i: number, out: InputEvent[]): number {
    const ch = pending[i] as string;

    if (ch !== "\u001b") {
      if (paste.mode === "buffering") {
        paste = Object.freeze({ mode: "buffering", text: paste.text + ch, since: paste.since });
        return 1;
      }
      if (!capabilities.bracketedPaste && ch >= " " && ch !== "") {
        accumulate(ch, out);
        return 1;
      }
      // A control byte on the heuristic path ends the run (§7's escape cell
      // covers ESC; the same reasoning covers Ctrl-A — it is not typing).
      flushHeuristic(out);

      const code = ch.codePointAt(0) ?? 0;
      const named = namedControl(ch);
      if (named !== null) return out.push(named), 1;
      if (code >= 1 && code <= 26) {
        return out.push(key(String.fromCharCode(96 + code), ch, { ctrl: true })), 1;
      }
      return out.push(key(ch, ch)), 1;
    }

    // From here, `ch` is ESC.
    const rest = pending.slice(i + 1);

    if (rest.length === 0) {
      // Nothing after it yet. Either a lone Escape or the head of a sequence
      // still in flight, and only time tells them apart (T1.2).
      if (escSince === null) escSince = now();
      if (now() - escSince < ESC_DISAMBIGUATION_MS) return 0;
      escSince = null;
      flushHeuristic(out);
      return out.push(key("escape", "\u001b")), 1;
    }
    escSince = null;

    if (rest[0] === "[") return decodeCsi(i, rest, out);

    if (rest[0] === "O") {
      if (rest.length < 2) return 0;
      const name = CSI_LETTER_KEYS[rest[1] as string];
      if (name === undefined) return 3; // malformed SS3: discard, decode on (T3.13)
      flushHeuristic(out);
      return out.push(key(name, `\u001b O${rest[1] as string}`)), 3;
    }

    // ESC + printable is Meta (T1.1). Ink 7 no longer sets meta on a bare
    // Escape, which is why that case is decided above by the window and not here.
    //
    // **The character is named the same way it would be unprefixed** (I17). It
    // was passed through raw, so `Alt-Enter` arrived as `{name: "\r", meta}`
    // while the keymap — and every reader — calls that key `enter`. C17 I12
    // names Alt-Enter as one of the two newline bindings that work everywhere,
    // and it resolved against an event nothing could produce: the same defect
    // as `\n` decoding to `enter`, one path over, and both were found by
    // pressing the bindings rather than by reading the decoder.
    flushHeuristic(out);
    const metaChar = rest[0] as string;
    const named = namedControl(metaChar);
    const name = named !== null && named.kind === "key" ? named.key.name : metaChar;
    return out.push(key(name, `\u001b${metaChar}`, { meta: true })), 2;
  }

  function decodeCsi(i: number, rest: string, out: InputEvent[]): number {
    let j = 1;
    while (j < rest.length && !CSI_FINAL.test(rest[j] as string)) j += 1;
    if (j >= rest.length) return 0; // incomplete; wait for more bytes

    const body = rest.slice(1, j);
    const final = rest[j] as string;
    const consumed = j + 2; // ESC, '[', body…, final
    const sequence = pending.slice(i, i + consumed);

    if (final === "~" && (body === "200" || body === "201")) {
      return pasteMarker(body, consumed, out);
    }

    // Anything reaching here is not paste content, so a run of typing ends.
    if (paste.mode === "buffering") {
      paste = Object.freeze({ mode: "buffering", text: paste.text + sequence, since: paste.since });
      return consumed;
    }
    flushHeuristic(out);

    if (body.startsWith("<")) return mouse(body, final, consumed, out);

    const params = body.split(";");
    const mods = modifiersOf(params[1]);

    // The two forms a terminal uses to report a key it cannot express as a
    // bare byte — which is every modified Enter, Tab and Space, and therefore
    // both of the shapes `defaultKeymap`'s Shift-Enter row can arrive in.
    //
    // **Third of the class, and found the same way as the first two.** C16 I17
    // says a key the keymap can name must be a key the decoder produces, and
    // the check that walks `defaultKeymap` through a real decoder is what
    // reported it: `CSI 13;2u` fell through to `CSI_LETTER_KEYS["u"]` and
    // `CSI 27;2;13~` to `CSI_TILDE_KEYS["27"]`, both undefined, both discarded
    // as well-formed-but-unknown. Shift-Enter was unreachable in every terminal
    // that sends it, which is every terminal that has it.
    // **`CSI code[:alt] ; mods[:event] [; text] u`**, which is both xterm's
    // `formatOtherKeys=1` and the kitty keyboard protocol C01 pushes (C02 §3,
    // C16 §2). Sub-parameters are split on `:` and the first of each is what
    // this arm reads: the alternate key code and the associated text are bits
    // C01 does not push, and the event type is carried as an optional field.
    //
    // The line this replaces read `params[1]` whole, so `13;2:3` — Shift-Enter
    // released — went through `Number("2:3")`, which is `NaN`, and every
    // modifier was lost on every repeat and release. Under the protocol a lone
    // `Esc` is `CSI 27 u` and reaches here as a complete sequence: it is never
    // a prefix and the 50 ms window above never runs for it.
    if (final === "u") {
      const codeParam = (params[0] ?? "").split(":")[0];
      const [modParam, eventParam] = (params[1] ?? "").split(":");
      const code = Number(codeParam);
      const name = KITTY_MODIFIER_KEYS[code] ?? otherKeyName(codeParam);
      if (name === null) return consumed;
      const event = eventParam === undefined ? undefined : KITTY_EVENT[eventParam];
      return out.push(key(name, sequence, kittyModifiersOf(modParam), event)), consumed;
    }

    if (final === "~") {
      // xterm's `modifyOtherKeys`: the key is the *third* parameter and 27 is
      // the marker, not a keycode — so this is checked before the tilde table,
      // which has no 27 and would discard it.
      if (params[0] === "27") {
        const name = otherKeyName(params[2]);
        if (name === null) return consumed;
        return out.push(key(name, sequence, mods)), consumed;
      }
      const name = CSI_TILDE_KEYS[params[0] ?? ""];
      if (name === undefined) return consumed; // unknown but well-formed: discard
      return out.push(key(name, sequence, mods)), consumed;
    }

    // **`CSI Z` is `⇧tab`, and it was discarded as well-formed-but-unknown
    // until a binding needed it** (C26 §4g row c, I17). Every terminal sends
    // backtab this way and none sends a `CSI 1;2` form for it — the shift is in
    // the final letter rather than in a parameter — so it is a row of its own
    // rather than an entry in the letter table, whose finals carry no modifier.
    // Found the way the other three were: T2.13 walks the keymap through this
    // decoder, and the `⇧tab` row would have failed on arrival.
    //
    // **The bare form only.** `CSI 999 Z` is malformed and stays discarded
    // (T3.13) — the first version of this line took any `Z` final and turned a
    // malformed sequence into a keystroke, which the existing row caught.
    if (final === "Z" && body === "") return out.push(key("tab", sequence, { shift: true })), consumed;

    const name = CSI_LETTER_KEYS[final];
    if (name === undefined) return consumed;
    return out.push(key(name, sequence, mods)), consumed;
  }

  /**
   * `CSI 200~` and `CSI 201~`, which are §7's first table.
   *
   * A start marker while buffering is ignored rather than nested, and an end
   * marker with no start is ignored — T3.5 and T3.6. Both are `return consumed`
   * with no emission, and both are easy to write as a state change instead.
   */
  function pasteMarker(body: string, consumed: number, out: InputEvent[]): number {
    if (body === "200") {
      if (paste.mode === "normal") {
        flushHeuristic(out);
        paste = Object.freeze({ mode: "buffering", text: "", since: now() });
      }
      return consumed;
    }
    if (paste.mode === "buffering") {
      const { text } = paste;
      paste = Object.freeze({ mode: "normal" });
      out.push(Object.freeze({ kind: "paste", text: stripControls(text) }));
    }
    return consumed;
  }

  /**
   * SGR mouse: `CSI < Cb ; x ; y M|m`. Dropped entirely when the capability is
   * absent (I3, T3.12).
   *
   * **`Cb` is a bit field and every bit is carried** (§2's table, I30). Bits 0–1
   * are the button, 4/8/16 the modifiers, 32 a mode-1002 motion report, 64 the
   * wheel with bits 0–1 selecting its four directions, 128 buttons 8–11. The
   * line this replaces was `code >= 64 ? (code === 64 ? "wheelUp" : "wheelDown")
   * : \`button${code & 3}\`` — two bits read of eight, so ctrl-wheel-up (80)
   * scrolled down, shift-click was click and a drag was a stream of presses
   * (T1.3k–T1.3n). Nothing here interprets a bit: what a modified click does is
   * §4's and the keymap's.
   */
  function mouse(body: string, final: string, consumed: number, out: InputEvent[]): number {
    if (!capabilities.mouse) return consumed;

    const [b, x, y] = body.slice(1).split(";");
    const code = Number(b);
    if (!Number.isFinite(code)) return consumed;

    const low = code & 3;
    const button =
      (code & 64) !== 0
        ? WHEEL_DIRECTIONS[low as 0 | 1 | 2 | 3]
        : (code & 128) !== 0
          ? (`button${8 + low}` as const)
          // `3` in bits 0–1 outside the wheel and 128 ranges is *no button* —
          // what 1003 sends for a pointer moving with nothing held (C01 I21).
          // Named, not folded onto `button3`: that is a button nobody pressed.
          : low === 3
            ? "none"
            : (`button${low}` as const);
    out.push(
      Object.freeze({
        kind: "mouse",
        row: Math.max(0, Number(y) - 1),
        col: Math.max(0, Number(x) - 1),
        button,
        press: final === "M",
        shift: (code & 4) !== 0,
        meta: (code & 8) !== 0,
        ctrl: (code & 16) !== 0,
        motion: (code & 32) !== 0,
      }),
    );
    return consumed;
  }

  function drain(): readonly InputEvent[] {
    const out: InputEvent[] = [];
    let i = 0;
    while (i < pending.length) {
      const consumed = decodeAt(i, out);
      if (consumed === 0) break;
      i += consumed;
    }
    pending = pending.slice(i);
    return Object.freeze(out);
  }

  return {
    push(chunk) {
      // `stream: true` is what makes a multi-byte character split across two
      // chunks arrive as one codepoint (T3.14) rather than two replacements.
      pending += utf8.decode(chunk, { stream: true });
      return drain();
    },

    poll() {
      const out: InputEvent[] = [];
      const t = now();

      if (paste.mode === "buffering" && t - paste.since >= PASTE_TIMEOUT_MS) {
        const { text } = paste;
        paste = Object.freeze({ mode: "normal" });
        out.push(Object.freeze({ kind: "paste", text: stripControls(text) }));
      }
      if (heuristic !== null && t - heuristic.opened >= HEURISTIC_WINDOW_MS) {
        flushHeuristic(out);
      }
      return Object.freeze([...out, ...drain()]);
    },

    reset() {
      // I18 — all four, and emitting nothing.
      //
      // **Every pending state, not the obvious one.** A reset that cleared only
      // the escape window passes any single-state test and still emits a child's
      // keystrokes inside the next paste, because the paste buffer and the
      // heuristic run are just as capable of spanning the suspension.
      //
      // Nothing is flushed: `flushHeuristic` turns an accumulated run into keys
      // because its *window closed*, and this window did not close — it stopped
      // mattering. The characters in it were typed at the child.
      pending = "";
      paste = Object.freeze({ mode: "normal" });
      heuristic = null;
      escSince = null;
    },

    nextDeadline() {
      const deadlines: number[] = [];
      if (paste.mode === "buffering") deadlines.push(paste.since + PASTE_TIMEOUT_MS);
      if (heuristic !== null) deadlines.push(heuristic.opened + HEURISTIC_WINDOW_MS);
      if (escSince !== null) deadlines.push(escSince + ESC_DISAMBIGUATION_MS);
      return deadlines.length === 0 ? null : Math.min(...deadlines);
    },
  };
}

export type { DecodeCapabilities, Decoder, InputEvent, Key } from "./types.js";
