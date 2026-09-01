/**
 * Capability detection. Pure function over an injected env.
 *
 * C02 — see spec.
 * Implement to the spec's commitments and invariants; cite invariant
 * numbers in tests. If the spec is wrong, change the spec first.
 *
 * This is the only module in `src/` permitted to read TERM, COLORTERM,
 * TERM_PROGRAM, LANG, LC_ALL, LC_CTYPE, TMUX or COLORFGBG (I5, A03 SS10) — and
 * it reads them from the injected record, never from `process`. SS10's subject
 * is `process.env` rather than a name list, so this comment is what a reader
 * checks against and not what the scan matches.
 */

export type TerminalCapabilities = Readonly<{
  colourDepth: 1 | 4 | 8 | 24;
  unicode: "full" | "bmp" | "ascii";
  /**
   * Whether `East_Asian_Width=Ambiguous` glyphs occupy one cell or two (C02 I9).
   *
   * **The terminal decides, which is exactly what makes it a capability.** The
   * same `▁` is one cell under a Western locale and two under a CJK one, so a
   * measurer that assumes either is right about half the world — and the half it
   * is wrong about gets a table whose columns stop aligning, because C11 draws a
   * sparkline into a cell.
   *
   * Detected from the locale and overridable, never probed: a query would be
   * I2's I/O and there is no escape sequence for it anyway.
   */
  ambiguousWidth: "narrow" | "wide";
  /**
   * Whether the reader is looking at a dark background or a light one (I10).
   *
   * **From `COLORFGBG` alone, and the background is the field after the *last*
   * `;`.** The variable is `fg;bg` — rxvt, urxvt, Konsole, mintty — except that
   * rxvt writes three fields, `fg;default;bg`, when one colour is left at the
   * terminal's own. Taking the last field is right for both shapes; taking the
   * second is right for one of them.
   *
   * **`unknown` is a third value and not a default.** *Nothing stated* and
   * *stated light* are different facts, and a two-valued field has to pick one
   * of them to mean both — which is precisely what its only consumer branches
   * on: C22 chooses a theme from a detected polarity and must not choose from an
   * absent one (→ C22 I68).
   *
   * **The certain range stops at 15, on a layer rule.** A terminal may write a
   * 256-colour index and 16–255 *is* knowable — C10 holds the cube and validates
   * its floors against it — but C10 is L1 and this is L0-terminal, so reaching
   * for it is an import upward and a second cube here is a second source of
   * truth for that table.
   */
  backgroundPolarity: "dark" | "light" | "unknown";
  synchronisedUpdate: boolean;
  bracketedPaste: boolean;
  mouse: boolean;
  imageProtocol: "none" | "iterm2" | "kitty" | "sixel";
  altScreen: boolean;
}>;

/**
 * Warnings are returned, never emitted (I8). Detection runs before the terminal
 * is acquired and before C22 has a diagnostics path; C22 §8 orders release
 * before printing, so C02 decides what is wrong and C22 decides when the user
 * is told.
 *
 * Not exported: nothing consumes it yet, and §2 spells the return type inline.
 * It gets a name in the spec when C22 consumes it.
 */
type Detection = Readonly<{
  capabilities: TerminalCapabilities;
  warnings: readonly string[];
}>;

/**
 * §4, machine-readable. Every capability field must have a row with a named
 * owner (I6, A03 EX12); T2.6 asserts this table and §4 of the spec are a
 * bijection with the record's own keys, so a field added without a fallback —
 * or a row left behind after one is removed — fails the build.
 */
export const DEGRADATION: Readonly<
  Record<keyof TerminalCapabilities, Readonly<{ behaviour: string; owner: string }>>
> = Object.freeze({
  colourDepth: Object.freeze({
    behaviour:
      "Tones resolve to the nearest 256- or 16-colour value with the contrast floor preserved; with no colour at all, tone becomes typographic — bold, dim, inverse",
    owner: "C10",
  }),
  unicode: Object.freeze({
    behaviour:
      "Box drawing → `+ - |`; sparklines → `.:|#`; braille plots → coarse block plot; badges lose glyphs",
    owner: "C09 C12",
  }),
  ambiguousWidth: Object.freeze({
    behaviour:
      "Every East_Asian_Width=Ambiguous glyph is measured and drawn as narrow, which is the Western convention and today's behaviour; where the locale says otherwise the wide arm is used and the ramps that would double in width are replaced by narrow ones",
    owner: "C09 C12",
  }),
  backgroundPolarity: Object.freeze({
    behaviour:
      "`unknown` keeps the app's own opening theme — the set's first key, or whatever the reader persisted. Nothing is painted differently and no notice is drawn: a terminal that does not say is a terminal the framework does not guess about",
    owner: "C22",
  }),
  synchronisedUpdate: Object.freeze({
    behaviour: "Frames written unwrapped; tearing possible under heavy repaint, accepted",
    owner: "C03",
  }),
  bracketedPaste: Object.freeze({
    behaviour:
      "Multi-line paste detected heuristically by inter-keystroke timing; a notice is committed on first use",
    owner: "C17",
  }),
  mouse: Object.freeze({
    behaviour:
      "Every mouse affordance has a keyboard equivalent, so nothing is lost — only convenience",
    owner: "C11 C15",
  }),
  imageProtocol: Object.freeze({
    behaviour:
      "Nothing renders an image in v1, so its absence costs nothing; blocks that would carry one render their text form",
    owner: "C09",
  }),
  altScreen: Object.freeze({
    behaviour: "The shell refuses to open, prints help, exits 0",
    owner: "L4",
  }),
});

// --- reading the environment ------------------------------------------------

/**
 * Own-property lookup, with the empty string treated as unset.
 *
 * Both halves earn their place: `Object.hasOwn` keeps `__proto__` and friends
 * out of every rule below (T3.9), and the empty-string check means `TMUX=""`
 * is not-in-tmux rather than in-a-session-named-nothing (T3.6). Doing it once
 * here is why neither concern appears in the seven rules.
 */
function read(env: Readonly<NodeJS.ProcessEnv>, key: string): string | undefined {
  if (!Object.hasOwn(env, key)) return undefined;
  const value = env[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

// --- the rules (§3) ---------------------------------------------------------

function detectColourDepth(
  term: string | undefined,
  colorterm: string | undefined,
  terminal: TerminalName | null,
): TerminalCapabilities["colourDepth"] {
  // Order matters, and the dumb gate comes first: a dumb terminal renders no
  // colour whatever COLORTERM claims about the emulator (T3.3). Absent TERM is
  // dumb — see §3.
  if (term === undefined || term === "dumb") return 1;
  if (colorterm === "truecolor" || colorterm === "24bit") return 24;
  // **The identification, below `COLORTERM`** (I11). A real Ghostty sets
  // `COLORTERM`, so this row looks like an artefact of our own harness stripping
  // it — and it is not: **`ssh` allocates a pty and forwards `TERM`, never
  // `COLORTERM`**. A kitty user connecting to a machine running a Calcium app got
  // 24-bit images and 4-bit colour from one terminal, decided by which variable
  // survived.
  //
  // Below `COLORTERM` because that is the terminal speaking for itself and a name
  // is us inferring. **The `TMUX` gate used to be this line's and is now the
  // identification's** — `detect` hands over a `terminal` that is already `null`
  // inside a multiplexer, so the rule is stated once for every reader instead of
  // once per reader (F432).
  if (terminal !== null) return 24;
  if (term.includes("256color")) return 8;
  return 4;
}

/**
 * POSIX precedence, not disjunction: the first variable that is *set* wins and
 * the others are not consulted, so `LC_ALL=C` suppresses a UTF-8 `LANG` (T3.8).
 */
function detectUnicode(
  lcAll: string | undefined,
  lcCtype: string | undefined,
  lang: string | undefined,
): TerminalCapabilities["unicode"] {
  const locale = lcAll ?? lcCtype ?? lang;
  if (locale === undefined) return "ascii";
  // Hyphen optional, case-insensitive: UTF-8, utf-8 and UTF8 all count (T1.4).
  return /UTF-?8/i.test(locale) ? "full" : "ascii";
}

/**
 * East Asian locales, where the convention is that ambiguous glyphs are wide
 * (C02 I9, §3).
 *
 * **Language subtags, matched at the start**, so `ja_JP.UTF-8`, `zh_CN`, `ko`
 * and `ja` all count and `jamaica` does not — a substring test would match the
 * latter, which is the kind of thing a locale list gets wrong quietly.
 *
 * **Imperfect on purpose, and the direction of the error is chosen.** A Western
 * user with a Japanese locale set gets `wide` and sees wider ramps; a CJK user
 * on a terminal configured for narrow declares the override. Both are visible;
 * the alternative — defaulting narrow and detecting nothing — is invisible to
 * exactly the users who need it, which is the whole argument for detecting at
 * all (§3).
 */
const WIDE_AMBIGUOUS_LANGUAGES: readonly string[] = ["ja", "zh", "ko"];

/** §3, and `detectUnicode`'s precedence: first variable *set* wins. */
function detectAmbiguousWidth(
  lcAll: string | undefined,
  lcCtype: string | undefined,
  lang: string | undefined,
): TerminalCapabilities["ambiguousWidth"] {
  const locale = lcAll ?? lcCtype ?? lang;
  if (locale === undefined) return "narrow";
  const subtag = locale.toLowerCase().split(/[_.@-]/u)[0] ?? "";
  return WIDE_AMBIGUOUS_LANGUAGES.includes(subtag) ? "wide" : "narrow";
}

/**
 * §3, I10. `COLORFGBG` is `fg;bg`, and rxvt's three-field `fg;default;bg` is why
 * the background is taken **after the last `;`** rather than as the second
 * field: the last-field rule is right for both shapes and the second-field rule
 * is right for one.
 *
 * **Three-valued, and `unknown` carries the weight.** Absent, empty, no
 * separator, a non-numeric background (`15;default` is a real value) and an
 * index above 15 all answer `unknown` — because the consumer acts on `dark` and
 * `light` and must not act on a guess (→ C22 I68).
 *
 * **No warning when it says nothing.** C02 warns about rejected overrides (I8)
 * and about nothing else; an absent `TERM_PROGRAM` does not warn either.
 */
function detectBackgroundPolarity(
  colorfgbg: string | undefined,
): TerminalCapabilities["backgroundPolarity"] {
  if (colorfgbg === undefined) return "unknown";
  const cut = colorfgbg.lastIndexOf(";");
  if (cut === -1) return "unknown";
  const background = colorfgbg.slice(cut + 1).trim();
  // A digit test before the parse: `parseInt` reads `15abc` as 15 and `""` as
  // NaN, and only one of those two is a value this rule should decline.
  if (!/^\d+$/u.test(background)) return "unknown";
  const index = Number(background);
  // 0–6 are the dark half of the base eight, 7 is light grey, 8 is bright black
  // and 9–15 are the bright half. Above 15 the answer is C10's table and C10 is
  // a layer up, so it is declined rather than guessed at.
  if (index > 15) return "unknown";
  return index === 7 || index > 8 ? "light" : "dark";
}

/**
 * **The emulators this file can name, and the only place it names them** (I11).
 *
 * Three rules used to identify a terminal separately — `synchronisedUpdate` by
 * `TERM_PROGRAM`, `imageProtocol` by `TERM` *or* `TERM_PROGRAM`, `colourDepth` by
 * neither — and **two of them disagreed**. With `TERM=xterm-ghostty` alone, which
 * is what `docker exec -e TERM` forwards and what `ssh` forwards, the record said
 * `imageProtocol: "kitty"` and `synchronisedUpdate: false`: one terminal, two
 * lists, opposite answers, and the demo tore on every frame while its images
 * worked (F418).
 *
 * **The disagreement was seen and written down as correct.** T1.7 carried
 * `expect(caps({ TERM: "xterm-ghostty" }).synchronisedUpdate).toBe(false)` under a
 * comment saying the first draft of the row had assumed otherwise *and it does
 * not* — a reader hunting their own assumptions went to the code, found `false`
 * and recorded it. **The sentence is true about the code and false about
 * Ghostty**, which implements synchronised update and is in the program list for
 * that reason. A row that records which variable happened to be consulted reads
 * exactly like a row that records a decision.
 *
 * So the invariant is not *the lists agree* — three copies that happen to agree
 * pass an agreement test and are still three copies. It is that **there is one
 * list**, which is a property a scan can see (T1.12, T6.11).
 */
type TerminalName = "kitty" | "ghostty" | "iterm2" | "wezterm" | "windowsterminal";

/** `TERM` is rewritten by a multiplexer; `TERM_PROGRAM` survives one. Both, therefore. */
const BY_TERM: Readonly<Record<string, TerminalName>> = {
  "xterm-kitty": "kitty",
  "xterm-ghostty": "ghostty",
};
const BY_PROGRAM: Readonly<Record<string, TerminalName>> = {
  "iterm.app": "iterm2",
  ghostty: "ghostty",
  wezterm: "wezterm",
  windowsterminal: "windowsterminal",
};

function identifyTerminal(
  term: string | undefined,
  termProgram: string | undefined,
): TerminalName | null {
  const byTerm = term === undefined ? undefined : BY_TERM[term];
  if (byTerm !== undefined) return byTerm;
  const program = termProgram?.toLowerCase();
  const byProgram = program === undefined ? undefined : BY_PROGRAM[program];
  return byProgram ?? null;
}

/**
 * **Ghostty is here on a measurement rather than on a claim.**
 * `tools/terminal-probe` sends the shipped encoder's own transmission and reads
 * the reply: Ghostty 1.3.1 answers `OK` for four PNGs and `EINVAL: invalid data`
 * for a corrupted control, so the protocol is present and success is
 * distinguishable from failure (F415).
 *
 * **WezTerm and Windows Terminal are `none`, owed and not claimed.** Neither has
 * been measured here and the asymmetry decides it: placeholders addressing an
 * image the terminal never received draw *nothing*, where a wrong `none` draws a
 * dither. The expiry is an instrument rather than a hope — run the probe there
 * and read the verdict.
 *
 * **`synchronisedUpdate` and `colourDepth` have no table of their own**, because
 * the membership criterion for the map above *is* being an emulator modern enough
 * to name, and there is no member for which either is false. A terminal added for
 * which one is false needs a column before it needs a row — and a column whose
 * value never varies is the first thing to distrust, which is why that expiry is
 * written here rather than assumed.
 */
const IMAGE_PROTOCOL: Readonly<Record<TerminalName, TerminalCapabilities["imageProtocol"]>> = {
  kitty: "kitty",
  ghostty: "kitty",
  iterm2: "iterm2",
  wezterm: "none",
  windowsterminal: "none",
};

function detect(env: Readonly<NodeJS.ProcessEnv>): TerminalCapabilities {
  const term = read(env, "TERM");
  const termProgram = read(env, "TERM_PROGRAM");

  // Absent TERM is treated as dumb throughout (§3). A record that has already
  // concluded the shell cannot open has no business claiming bracketed paste.
  const usable = term !== undefined && term !== "dumb";
  // **Asked once, read three times** (I11). Not gated by `usable`, on §3's
  // boundary: `TERM=dumb` is a statement about terminfo and iTerm2 supports
  // synchronised update whatever it claims.
  const identified = identifyTerminal(term, termProgram);
  const inTmux = read(env, "TMUX") !== undefined;
  // **Identification is not capability, and the second question is asked here**
  // (I11, F432). *Which emulator is this* and *does a sequence reach it* are
  // different questions; inside a multiplexer we are not talking to the emulator
  // we identified, so every reader below sees `null` rather than each of them
  // remembering to gate.
  //
  // **Measured rather than assumed**, tmux 3.5a with `-f /dev/null`, searched in
  // tmux's own output: an unwrapped APC transmission is **absent** and
  // `ESC [ ? 2026 h` is **absent**, against a bare pty where both are present.
  // Not near misses — the bytes are consumed, so `imageProtocol` addressed an
  // image that never arrived and `synchronisedUpdate` promised a wrapper nothing
  // received.
  //
  // **The fix is not here.** The DCS-wrapped form does reach the emulator, at
  // tmux's default config, and wrapping a sequence belongs to `escapes.ts` — the
  // file that owns every sequence. Until then this is the conservative answer,
  // and it is the one `mouse` (D34) and `colourDepth` already give.
  const terminal = inTmux ? null : identified;

  return {
    colourDepth: detectColourDepth(term, read(env, "COLORTERM"), terminal),
    unicode: detectUnicode(read(env, "LC_ALL"), read(env, "LC_CTYPE"), read(env, "LANG")),
    ambiguousWidth: detectAmbiguousWidth(
      read(env, "LC_ALL"),
      read(env, "LC_CTYPE"),
      read(env, "LANG"),
    ),
    // Not gated by `usable`, on §3's boundary: the gate applies to rules derived
    // from `TERM`, and this one is derived from `COLORFGBG`. It is also inert at
    // `TERM=dumb` — depth 1 colours nothing — which is a separate fact and the
    // reason the combination is asserted rather than assumed (T3.12).
    backgroundPolarity: detectBackgroundPolarity(read(env, "COLORFGBG")),
    synchronisedUpdate: terminal !== null,
    bracketedPaste: usable,
    mouse: usable && !inTmux,
    imageProtocol: terminal === null ? "none" : IMAGE_PROTOCOL[terminal],
    altScreen: usable,
  };
}

// --- overrides --------------------------------------------------------------

const isBoolean = (v: unknown): boolean => typeof v === "boolean";

function oneOf(...allowed: readonly unknown[]): (v: unknown) => boolean {
  return (v: unknown) => allowed.includes(v);
}

/**
 * A predicate per field rather than a cast. An override arrives from a config
 * file, so it is untrusted input: an unknown key is ignored (T3.4) and a known
 * key with an out-of-range value is dropped with a warning (T3.5). A bad config
 * file never produces an invalid record.
 */
const VALIDATORS: Readonly<Record<keyof TerminalCapabilities, (v: unknown) => boolean>> =
  Object.freeze({
    colourDepth: oneOf(1, 4, 8, 24),
    unicode: oneOf("full", "bmp", "ascii"),
    ambiguousWidth: oneOf("narrow", "wide"),
    backgroundPolarity: oneOf("dark", "light", "unknown"),
    synchronisedUpdate: isBoolean,
    bracketedPaste: isBoolean,
    mouse: isBoolean,
    imageProtocol: oneOf("none", "iterm2", "kitty", "sixel"),
    altScreen: isBoolean,
  });

const FIELDS = Object.keys(VALIDATORS) as (keyof TerminalCapabilities)[];

// --- public interface (§2) --------------------------------------------------

export function detectCapabilities(
  env: Readonly<NodeJS.ProcessEnv>,
  overrides?: Partial<TerminalCapabilities>,
): Detection {
  const resolved: Record<string, unknown> = { ...detect(env) };
  const warnings: string[] = [];

  if (overrides !== undefined) {
    for (const field of FIELDS) {
      if (!Object.hasOwn(overrides, field)) continue;
      const value: unknown = overrides[field];
      if (value === undefined) continue;
      if (VALIDATORS[field](value)) {
        resolved[field] = value;
      } else {
        warnings.push(
          `[terminal] ${field}: ${JSON.stringify(value)} is not a valid value; ` +
            `keeping the detected ${JSON.stringify(resolved[field])}`,
        );
      }
    }
  }

  // A fresh, frozen record per call. No module-scope cache: two calls with the
  // same input are deeply equal and share no reference (I3, T2.3, T6.7).
  return Object.freeze({
    capabilities: Object.freeze(resolved) as TerminalCapabilities,
    warnings: Object.freeze(warnings),
  });
}

/**
 * Alternate screen is the sole hard requirement (D28). No other capability can
 * prevent the shell opening (I7) — everything else has a fallback in §4.
 */
export function isUsable(caps: TerminalCapabilities): boolean {
  return caps.altScreen;
}
