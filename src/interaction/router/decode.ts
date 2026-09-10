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

/**
 * ECMA-48's five **control string** introducers, by the byte after `ESC`
 * (C16 §2a, I32).
 *
 * DCS `P`, SOS `X`, OSC `]`, PM `^`, APC `_`. Each opens a string that runs to
 * `ST` — `ESC \` — and, for OSC alone, to `BEL`. Before this set existed the
 * Meta arm claimed all five, so a terminal's answer to a query arrived as a
 * **bindable** key with its payload typed into the prompt behind it: measured
 * at 164 events from eight real replies captured from XTerm(398) and kitty
 * 0.41.1 (F1035, F1043).
 *
 * **Five and not the three that had been asked.** F1035 found the hole through
 * APC (the graphics reply), DCS (`XTVERSION`) and OSC (a colour query), which
 * are the protocols something happened to query. SOS and PM are in the set
 * because the set is the introducers; a set named for its first members becomes
 * a membership rule, and no terminal has to send one for the arm to be right.
 */
const STRING_INTRODUCERS: ReadonlySet<string> = new Set(["P", "X", "]", "^", "_"]);

/**
 * How far the string arm scans before deciding the terminator is not coming.
 *
 * **The cap is this arm's own hazard rather than a defect it repairs** (§2a row
 * f). An unterminated `CSI` ends on the next typed letter — `CSI_FINAL` matches
 * any of them, and `ESC [ 1 ; 2` followed by `hello` emits `e l l o` with the
 * `h` taken as the final. A control string has no such bound, so without a cap
 * an introducer whose terminator never arrives would hold every later keystroke
 * in `pending` for the rest of the session. At HEAD before this arm the same
 * bytes decoded as keys at once and nothing wedged.
 *
 * **The cap is the backstop and not the usual recovery.** A stray `ESC` ends the
 * string as malformed (`stringLength`), and every escape sequence supplies one:
 * an arrow key, an `Esc`, and — inside a bracketed paste — the `CSI 201~` end
 * marker itself. So an unterminated introducer un-wedges on the reader's next
 * non-printable, and the cap only bites on a run of printables with nothing else
 * in it.
 *
 * **256, and the argument rests on the direction it can be wrong.** The longest
 * reply measured here is kitty's `EBADPNG:Not a PNG file` at 30 bytes;
 * `XTVERSION` is 17 and a colour query 24, so 256 is 8.5× the longest. Too small
 * truncates a real reply and its tail types into the prompt — which is exactly
 * what happened before this arm existed, so it is bounded by no-worse-than-today.
 * Too large loses the reader's keystrokes **silently**, which reads as a hung
 * application. The second failure is the worse one, so the number is chosen small
 * rather than generous, and it is the length of a reply nothing in `src/` asks
 * for: no query is sent today (§2a), and whoever sends the first one owns this
 * number.
 *
 * The recovery is the SS3 arm's: **the introducer is discarded and the payload
 * decodes on** (row g) — the one disposition that cannot swallow what the
 * reader typed.
 */
const STRING_MAX_BYTES = 256;

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
   * I12 at every `ESC` arm: while a bracketed paste buffers, a sequence is
   * payload and not a key (§2b, F1045).
   *
   * **This check lived inside `decodeCsi` and nowhere else**, so I12 held on one
   * arm of four: a pasted OSC-8 hyperlink dispatched `Alt-]`, `Alt-\`, `Alt-]`,
   * `Alt-\` **before** the paste event and reached the consumer with its `]` and
   * `\` gone; `ESC O A` in a payload emitted `up`; `ESC z` emitted `Alt-z`; and a
   * trailing lone `ESC` emitted `escape` at the next `poll()`. `ls
   * --hyperlink=auto`, `gh` and any terminal-aware pager emit OSC 8, and a `PS1`
   * line carries OSC 0 — so the hole §2a found from the reply side is reachable
   * with nothing asking a terminal anything.
   *
   * One helper called by four arms rather than four copies: the CSI arm calls it
   * too, because a reimplemented rule keeps its birthday clauses and this is how
   * the CSI arm came to be the only one that had it.
   */
  function bufferPayload(i: number, consumed: number): boolean {
    if (paste.mode !== "buffering") return false;
    paste = Object.freeze({
      mode: "buffering",
      text: paste.text + pending.slice(i, i + consumed),
      since: paste.since,
    });
    return true;
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
      // **I12's fourth arm** (§2b, T3.19). While a bracketed paste buffers this
      // `ESC` may be the head of the `CSI 201~` end marker, so it is not yet
      // decidable — and answering it as a key here emits a keystroke out of a
      // paste, which is the one thing I12 forbids. Waiting is safe because the
      // paste has its own backstop: T3.4's 1 s timeout flushes a paste that
      // stops arriving, and `nextDeadline` already carries it.
      if (paste.mode === "buffering") return 0;
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
      // Before the name lookup, so a *malformed* SS3 inside a paste is payload
      // too — the discard below is a decision about a key, and there is no key
      // here to decide about (§2b, I12).
      if (bufferPayload(i, 3)) return 3;
      const name = CSI_LETTER_KEYS[rest[1] as string];
      if (name === undefined) return 3; // malformed SS3: discard, decode on (T3.13)
      flushHeuristic(out);
      return out.push(key(name, `\u001b O${rest[1] as string}`)), 3;
    }

    // **A control string is consumed whole and emits nothing** (I32, §2a). This
    // sits above the Meta arm because the Meta arm is the fallback: every
    // introducer has to be taken out of it by name, and until they were, a
    // terminal's answer to a query arrived as `Alt-_`, `Alt-P` or `Alt-]` with
    // its payload typed into the prompt and `Alt-\` — or `Ctrl-G`, on XTerm's
    // `BEL`-terminated form — closing.
    //
    // **`ESC \` with no opener is not a string and stays `Alt-\`** (§2a row b):
    // `\` is not an introducer, so the arm never claims it, and declining a byte
    // leaves no state behind to remember having declined it.
    if (STRING_INTRODUCERS.has(rest[0] as string)) return decodeString(i, rest, out);

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
    // I12's third arm (§2b, T3.19): `ESC z` inside a paste is payload.
    if (bufferPayload(i, 2)) return 2;
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
    // The buffering branch is `bufferPayload`'s now rather than this arm's own
    // copy: it was the only arm that had it, and three others needed it (§2b).
    if (bufferPayload(i, consumed)) return consumed;
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
   * A control string — `ESC P|X|]|^|_ … ST` — consumed whole, emitting nothing
   * (I32, §2a).
   *
   * **Nothing, not something harmless.** The CSI arm has answered a DECRQM reply
   * with no event since it was written, and this is the same answer for the
   * shapes it does not cover. Making a reply *readable* is a reply channel, and
   * a reply channel is C02's (C02 §8) — a ruling that names an operation checks
   * the operation exists first, and there is no seam here to report a graphics
   * error through. So `q=1` becomes safe to send; it does not become useful.
   */
  function decodeString(i: number, rest: string, out: InputEvent[]): number {
    const consumed = stringLength(rest);
    if (consumed === 0) return 0; // incomplete: wait for the terminator (trace 1)
    // While a paste buffers, the string is payload — including the malformed and
    // capped dispositions, which lose bytes from a payload if they are skipped.
    if (bufferPayload(i, consumed)) return consumed;
    // §7's escape cell, exactly as the CSI arm applies it: an escape means the
    // accumulated run was typing, and typed characters are keys. A reply is not
    // typing, and the alternative is a `paste` event with a terminal's answer
    // inside it.
    flushHeuristic(out);
    return consumed;
  }

  /**
   * How many characters of `pending` the control string occupies, counting the
   * `ESC`; `0` when it is not yet decidable.
   *
   * `rest` is everything after the `ESC`, so `rest[0]` is the introducer and
   * every index below carries `+1` for the `ESC` that is not in it.
   *
   * Three terminations and a wait, each a cell of §2a's classification table:
   *
   * - **`BEL`, for OSC alone** (row d). Measured 2026-09-10: XTerm(398) mirrors
   *   the query's terminator — three `BEL`-terminated OSC queries came back
   *   `BEL`-terminated — while its `XTVERSION`, a DCS reply with no `BEL` form,
   *   came back `ST`-terminated in the same capture; kitty 0.41.1 answers `ST`
   *   whatever it is asked. Both forms occur, so an arm reading one is wrong on
   *   one of the two emulators installed here. DCS, SOS, PM and APC carry
   *   arbitrary payloads — kitty's graphics data is base64 — and a `BEL` inside
   *   one of those is payload, which is the narrower rule and the one that
   *   cannot eat a reply in half.
   * - **`ST`**, the `ESC \` pair.
   * - **A stray `ESC`** (row e): ECMA-48 §8.3.14 makes the only `ESC` legal
   *   inside a control string the one that opens `ST`, so anything else ends the
   *   string as malformed and decodes on its own. `test/support/pty.ts`'s
   *   `ESCAPE_ALTERNATIVES` is the same ruling already in this repository, and
   *   it was found by looking for one rather than by deriving it.
   * - **A trailing `ESC`** is not yet decidable: it may be half of an `ST`.
   */
  function stringLength(rest: string): number {
    const admitsBel = rest[0] === "]";
    for (let j = 1; j < rest.length; j += 1) {
      const c = rest[j] as string;
      if (admitsBel && c === "\u0007") return j + 2;
      if (c !== "\u001b") continue;
      if (j + 1 >= rest.length) return 0;
      return rest[j + 1] === "\\" ? j + 3 : j + 1;
    }
    // No terminator yet. `2` discards the `ESC` and the introducer and lets the
    // payload decode on — the SS3 arm's disposition, and the only recovery that
    // cannot swallow what the reader typed (§2a row g).
    return rest.length > STRING_MAX_BYTES ? 2 : 0;
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
