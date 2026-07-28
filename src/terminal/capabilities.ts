/**
 * Capability detection. Pure function over an injected env.
 *
 * C02 — see spec.
 * Implement to the spec's commitments and invariants; cite invariant
 * numbers in tests. If the spec is wrong, change the spec first.
 *
 * This is the only module in `src/` permitted to read TERM, COLORTERM,
 * TERM_PROGRAM, LANG, LC_ALL, LC_CTYPE or TMUX (I5, A03 SS10) — and it reads
 * them from the injected record, never from `process`.
 */

export type TerminalCapabilities = Readonly<{
  colourDepth: 1 | 4 | 8 | 24;
  unicode: "full" | "bmp" | "ascii";
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
 */
export type Detection = Readonly<{
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
): TerminalCapabilities["colourDepth"] {
  // Order matters, and the dumb gate comes first: a dumb terminal renders no
  // colour whatever COLORTERM claims about the emulator (T3.3). Absent TERM is
  // dumb — see §3.
  if (term === undefined || term === "dumb") return 1;
  if (colorterm === "truecolor" || colorterm === "24bit") return 24;
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

const SYNCHRONISED_UPDATE_PROGRAMS: readonly string[] = [
  "iterm.app",
  "wezterm",
  "ghostty",
  "windowsterminal",
];

function detectSynchronisedUpdate(
  term: string | undefined,
  termProgram: string | undefined,
): boolean {
  if (term === "xterm-kitty") return true;
  if (termProgram === undefined) return false;
  return SYNCHRONISED_UPDATE_PROGRAMS.includes(termProgram.toLowerCase());
}

function detectImageProtocol(
  term: string | undefined,
  termProgram: string | undefined,
): TerminalCapabilities["imageProtocol"] {
  if (termProgram !== undefined && termProgram.toLowerCase() === "iterm.app") return "iterm2";
  if (term === "xterm-kitty") return "kitty";
  return "none";
}

function detect(env: Readonly<NodeJS.ProcessEnv>): TerminalCapabilities {
  const term = read(env, "TERM");
  const termProgram = read(env, "TERM_PROGRAM");

  // Absent TERM is treated as dumb throughout (§3). A record that has already
  // concluded the shell cannot open has no business claiming bracketed paste.
  const usable = term !== undefined && term !== "dumb";

  return {
    colourDepth: detectColourDepth(term, read(env, "COLORTERM")),
    unicode: detectUnicode(read(env, "LC_ALL"), read(env, "LC_CTYPE"), read(env, "LANG")),
    synchronisedUpdate: detectSynchronisedUpdate(term, termProgram),
    bracketedPaste: usable,
    mouse: usable && read(env, "TMUX") === undefined,
    imageProtocol: detectImageProtocol(term, termProgram),
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
