/**
 * What must not reach disk (§3, I5, I19, I24–I26).
 *
 * `j22` R12 specified entropy alone — length ≥ 20 and ≥ 3.5 bits per character —
 * which redacts every UUID and every Git SHA in the history of a tool whose
 * commonest argument is a UUID. So redaction is positional first and entropy
 * second, and §7b's table is what the rules below were shaped by: four of its
 * rows destroy a legitimate command and two leak a secret under the obvious
 * implementation.
 *
 * **This file works in code-unit space and is allowed to** (SS40): it splices
 * C18's spans back into the string they were measured in, exactly as the
 * tokeniser that produced them does. Nothing here measures display width.
 */

import { tokenise, type Token } from "./deps.js";

export const REDACTED = "[REDACTED]";

/** Which rule fired, for T2.12 — a right answer through the wrong rule is a redactor about to give a wrong one. */
export type Rule = "P1" | "P2" | "E";
export type Fired = Readonly<{ rule: Rule; value: string }>;
export type Redaction = Readonly<{ text: string; fired: readonly Fired[] }>;

/**
 * The keyword set, matched **at a boundary** (B1).
 *
 * A bare `/token/` matches `--tokens`, and a redactor that turns a count into
 * `[REDACTED]` is one people switch off. The boundaries keep `--gitlab-token`
 * and `--auth_token` while dropping `--tokens`.
 */
const SECRET = /(^|[-_])(token|password|passwd|secret|api[-_]?key|credential|auth)([-_]|$)/i;

const LENGTH_BAR = 20;
const ENTROPY_BAR = 3.5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 7–64: Git's short form through a SHA-256 digest, which this tool prints (B5). */
const HEX = /^[0-9a-f]{7,64}$/i;
const SEMVER = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const FLAG = /^--?[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const ROOTED = /^(?:~|\.{1,2})?\//;
/**
 * A URL, exempt for the same reason a path is: it names a resource, and the
 * part of one that carries a secret is an assignment the text scan already
 * reaches. Without it the entropy net redacts the whole address the moment a
 * query string makes it long enough, which is most of them.
 */
const URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `--flag=value`, split so the name can be tested and the value replaced. */
const FLAG_ASSIGN = /^(--?)([A-Za-z0-9][A-Za-z0-9_.-]*)=([\s\S]*)$/;
/** `NAME=value`, the environment form. */
const ENV_ASSIGN = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;

/**
 * The same assignment, found in text rather than in a token (B3).
 *
 * `sh -c "GITLAB_PASSWORD=hunter2 deploy"` is one token whose *text* carries the
 * assignment, and it is how a secret actually reaches the delegated shell path.
 * The same scan catches `?private_token=…` in a URL, which no positional rule
 * sees either. The value ends at whitespace, `&`, or a quote.
 */
const ENV_IN_TEXT = /(^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)=([^\s&'"]*)/g;

/**
 * Shannon entropy in bits per character.
 *
 * Over code points rather than code units: the frequency map is keyed by what
 * `for…of` yields, so a denominator of `text.length` would not be the number of
 * things counted and the probabilities would not sum to one.
 */
export function entropy(text: string): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / chars.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** The entropy net's bar, applied to a whole token or to one path segment. */
function overBar(text: string): boolean {
  return [...text].length >= LENGTH_BAR && entropy(text) >= ENTROPY_BAR;
}

/**
 * A path, by segments rather than by punctuation (B4).
 *
 * "Contains a slash" is the obvious test and it exempts base64, whose alphabet
 * contains `/` — so the entropy net stops catching the one thing it is for. A
 * path is a composition of names and a secret is one long high-entropy run, so
 * a slash-bearing token is a path when **no segment** trips the bar alone.
 */
function isPath(text: string): boolean {
  if (ROOTED.test(text)) return true;
  if (!text.includes("/")) return false;
  // Two clauses, and the corpus needed both. The segment bar catches an
  // unpadded blob whose run of entropy is the whole point of it; padding and a
  // `+` catch the base64 whose segments happen to fall under the bar, which is
  // most of them once a `/` splits the string in two. A path segment carries
  // neither character.
  return text
    .split("/")
    .every((segment) => !/[+=]/.test(segment) && !overBar(segment));
}

export function isExempt(text: string): boolean {
  return (
    UUID.test(text) ||
    HEX.test(text) ||
    SEMVER.test(text) ||
    FLAG.test(text) ||
    URL.test(text) ||
    isPath(text)
  );
}

type Slot = Readonly<{ text: string; start: number; end: number }>;

/** Whitespace slots, for a line C18 cannot parse — a paste is not obliged to be valid input. */
function fallbackSlots(line: string): readonly Slot[] {
  const slots: Slot[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    slots.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return slots;
}

function slotsOf(line: string): readonly Slot[] {
  const parsed = tokenise(line);
  if (!parsed.ok) return fallbackSlots(line);
  return parsed.value.map((t: Token) => ({ text: t.text, start: t.start, end: t.end }));
}

type Splice = Readonly<{ start: number; end: number; text: string; fired: Fired }>;

/** Where the `=` sits in the source, so the name survives and the value does not. */
function valueSpan(line: string, slot: Slot): Readonly<{ start: number; end: number }> {
  const eq = line.indexOf("=", slot.start);
  if (eq === -1 || eq >= slot.end) return { start: slot.start, end: slot.end };
  return { start: eq + 1, end: slot.end };
}

/**
 * The pieces of a compound token, by whitespace, with surrounding quote
 * characters trimmed off each so a splice cannot eat one.
 */
function atomsIn(line: string, from: number, to: number): readonly Slot[] {
  const out: Slot[] = [];
  const re = /\S+/g;
  const inner = line.slice(from, to);
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    let start = from + m.index;
    let end = start + m[0].length;
    while (start < end && /['"`]/.test(line[start] ?? "")) start += 1;
    while (end > start && /['"`]/.test(line[end - 1] ?? "")) end -= 1;
    if (start < end) out.push({ text: line.slice(start, end), start, end });
  }
  return out;
}

/** The positional and entropy rules as they apply to one atom, with no adjacency. */
function atomRule(line: string, atom: Slot): Splice | null {
  const assign = FLAG_ASSIGN.exec(atom.text) ?? ENV_ASSIGN.exec(atom.text);
  const value = assign === null ? null : (assign[assign.length - 1] ?? "");
  const name =
    assign === null || value === null ? null : atom.text.slice(0, atom.text.length - value.length - 1);

  if (name !== null && value !== null && value !== "" && SECRET.test(name.replace(/^--?/, ""))) {
    const eq = line.indexOf("=", atom.start);
    const rule: Rule = name.startsWith("-") ? "P1" : "P2";
    return { start: eq + 1, end: atom.end, text: REDACTED, fired: { rule, value } };
  }

  // **Both halves of an assignment, and the whole token when it is not one.**
  // Applied to a whole token the net redacts `--run=<uuid>` at forty-two
  // characters and `--family=digit-classifier` at twenty-five — three of the
  // five shapes I5 protects, destroyed by the rule written to protect them.
  // Applied to the value alone it walks past `ijx3IdkOu1RvEsOaQI5tMwrFcSjvWw==`,
  // because base64 padding parses as a thirty-character name and a value of
  // `=`, and the blob is the *name*.
  const whole = assign === null || value === null || value === "" ? atom.text : null;
  if (whole !== null && overBar(whole) && !isExempt(whole)) {
    return { start: atom.start, end: atom.end, text: REDACTED, fired: { rule: "E", value: whole } };
  }
  if (name !== null && overBar(name) && !isExempt(name)) {
    return {
      start: atom.start,
      end: atom.end,
      text: REDACTED,
      fired: { rule: "E", value: atom.text },
    };
  }
  if (name !== null && value !== null && overBar(value) && !isExempt(value)) {
    const eq = line.indexOf("=", atom.start);
    return { start: eq + 1, end: atom.end, text: REDACTED, fired: { rule: "E", value } };
  }
  return null;
}

function redactLine(line: string): Redaction {
  const slots = slotsOf(line);
  const splices: Splice[] = [];
  const consumed = new Set<number>();

  slots.forEach((slot, i) => {
    if (consumed.has(i)) return;

    // **A quoted compound is not an atom, and it is not opaque either.**
    // `sh -c "GITLAB_PASSWORD=hunter2 deploy"` is a single token whose text is a
    // whole command: splicing by its span would take `deploy` and the closing
    // quote along with the secret, and the entropy net would redact the command
    // wholesale. Skipping it entirely is what the first attempt did, and T5.4
    // found the hole that leaves — `curl -H 'PRIVATE-TOKEN: ghp_…'` carries a
    // secret that is neither an assignment nor a flag value, so nothing but the
    // net will catch it and the net was outside the quotes.
    //
    // So the rules run again *inside* the token, over its source range split on
    // whitespace with quote characters trimmed off each piece.
    if (/\s/.test(slot.text)) {
      for (const atom of atomsIn(line, slot.start, slot.end)) {
        const splice = atomRule(line, atom);
        if (splice !== null) splices.push(splice);
      }
      return;
    }

    const flagged = FLAG_ASSIGN.exec(slot.text);
    if (flagged !== null && SECRET.test(flagged[2] ?? "")) {
      if (flagged[3] === "") return; // `--password=` — nothing to redact, and no `[REDACTED]` for nothing
      const span = valueSpan(line, slot);
      splices.push({ ...span, text: REDACTED, fired: { rule: "P1", value: flagged[3] ?? "" } });
      return;
    }

    // A valueless secret flag takes the **next** token, and only when that token
    // is not itself a flag (B2). Without the guard `--api-key --verbose` redacts
    // the following flag and the entry stops describing what was run.
    if (FLAG.test(slot.text) && SECRET.test(slot.text.replace(/^--?/, ""))) {
      const next = slots[i + 1];
      if (next !== undefined && !next.text.startsWith("-")) {
        consumed.add(i + 1);
        splices.push({
          start: next.start,
          end: next.end,
          text: REDACTED,
          fired: { rule: "P1", value: next.text },
        });
      }
      return;
    }

    const assigned = ENV_ASSIGN.exec(slot.text);
    if (assigned !== null && SECRET.test(assigned[1] ?? "")) {
      if (assigned[2] === "") return;
      const span = valueSpan(line, slot);
      splices.push({ ...span, text: REDACTED, fired: { rule: "P2", value: assigned[2] ?? "" } });
      return;
    }

    // The entropy net last, and only on what the positional rules left. It is
    // the same rule that runs inside a compound, which is why it lives in
    // `atomRule` rather than here: two copies of the net is how the inside of a
    // quote ends up with a different policy from the outside.
    const splice = atomRule(line, slot);
    if (splice !== null) splices.push(splice);
  });

  let out = line;
  const fired: Fired[] = [];
  for (const splice of [...splices].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, splice.start) + splice.text + out.slice(splice.end);
    fired.unshift(splice.fired);
  }

  // The text-level pass, after the token-level one. Re-matching an assignment
  // whose value is already `[REDACTED]` replaces it with itself, so the two
  // passes compose without either needing to know about the other.
  out = out.replace(ENV_IN_TEXT, (whole, lead: string, name: string, value: string) => {
    if (!SECRET.test(name) || value === "" || value === REDACTED) return whole as string;
    fired.push({ rule: "P2", value });
    return `${lead}${name}=${REDACTED}`;
  });

  return { text: out, fired };
}

/**
 * Redaction, line by line, before escaping (I19).
 *
 * C17 §4 shipped three newline bindings, so a submitted command can carry a
 * newline and the assignment can sit on its third line. The other order scans
 * `\n`-joined text in which the environment rule has no line to anchor to.
 */
export function redact(command: string): Redaction {
  const fired: Fired[] = [];
  const lines = command.split("\n").map((line) => {
    const done = redactLine(line);
    fired.push(...done.fired);
    return done.text;
  });
  return { text: lines.join("\n"), fired };
}
