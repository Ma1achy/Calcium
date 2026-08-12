/**
 * `validateInvocation` — the pre-spawn gate. C05 §3, §6 — see spec.
 *
 * D17: a malformed invocation costs nothing rather than 300 ms of interpreter
 * startup to be told the same thing. C18 carries the result rather than
 * recomputing it, so this is the only place it happens.
 *
 * **It checks shape, never semantics** (I10). Whether a UUID exists, whether a
 * family is deployed, whether a candidate is promotable — all far-side concerns.
 * The temptation is a `path` check that touches the filesystem, and it is a
 * single line: it would also make this function impure, per-keystroke completion
 * do I/O, and the framework begin to know what the app means. T2.2 asserts no
 * I/O and T6.1 is what a semantic check trips over.
 *
 * The per-type checks are a `Record<ArgType, Check>` rather than a chain of
 * `if`s — the same shape as C04's `KIND_CHECKS` and C03's `WINDOWS`, and for
 * the same reason: a chain takes a new member silently and defaults it to
 * "fine", which is the one direction this mistake must not fall (T2.4).
 */

import type { ArgDef, ArgType, ErrorLike, FlagDef, ToolDef, ValidationResult } from "./types.js";

type Check = (
  raw: string,
  def: Readonly<{ values?: readonly string[]; pattern?: string }>,
) => Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false; message: string }>;

const INTEGER = /^[+-]?\d+$/;

/**
 * `30s`, `1h30m`, `500ms`, `-1h`. Syntax only — no notion of what is a sensible
 * span, and none of what a negative one means. `-1h` is "an hour ago" to one far
 * side and an error to another; C05 rejects what is malformed, never what is
 * merely wrong (I10), and a leading sign is not malformed.
 *
 * It is also load-bearing for the §3 remediation: `--since -1h` is refused with
 * a message recommending `--since=-1h`, and a recommendation that leads to a
 * second error is worse than no recommendation at all.
 */
const DURATION = /^[+-]?(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/;

const CHECKS: Readonly<Record<ArgType, Check>> = Object.freeze({
  string: (raw) => ({ ok: true, value: raw }),

  // No `existsSync`, and this is the line where it would go. A path that does
  // not exist is a far-side failure, and checking here would be I/O in a pure
  // function called on every keystroke by way of C18.
  path: (raw) => ({ ok: true, value: raw }),

  int: (raw) =>
    INTEGER.test(raw)
      ? { ok: true, value: Number(raw) }
      : { ok: false, message: `expected an integer, got "${raw}"` },

  bool: (raw) =>
    raw === "true" || raw === "false"
      ? { ok: true, value: raw === "true" }
      : { ok: false, message: `expected "true" or "false", got "${raw}"` },

  enum: (raw, def) =>
    def.values?.includes(raw) === true
      ? { ok: true, value: raw }
      : { ok: false, message: `expected one of ${(def.values ?? []).join(", ")}, got "${raw}"` },

  duration: (raw) =>
    DURATION.test(raw)
      ? { ok: true, value: raw }
      : { ok: false, message: `expected a duration such as 30s, 5m or 1h30m, got "${raw}"` },

  pattern: (raw, def) => {
    if (def.pattern === undefined) return { ok: false, message: `no pattern declared for this argument` };
    // `parseManifest` compiles every pattern, so this cannot throw for a parsed
    // manifest. A hand-built `ToolDef` can still reach here, and a throw would
    // be a crash rather than a rejection.
    try {
      return new RegExp(def.pattern, "u").test(raw)
        ? { ok: true, value: raw }
        : { ok: false, message: `"${raw}" does not match ${def.pattern}` };
    } catch {
      return { ok: false, message: `the declared pattern is not a valid regular expression` };
    }
  },
});

// --- errors ---------------------------------------------------------------

function err(
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>>,
  remediation?: string,
): ErrorLike {
  return Object.freeze({
    message,
    code,
    stage: "validation",
    details: Object.freeze(details),
    ...(remediation === undefined ? {} : { remediation }),
  });
}

/**
 * Levenshtein, capped. `--open-mrr` against a tool declaring `--open-mr` is the
 * case worth serving; `--zzzzz` gets no suggestion, because a wrong suggestion
 * is worse than none — it sends the reader to check a flag that was never the
 * problem.
 */
function distance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      current.push(value);
      if (value < best) best = value;
    }
    if (best > cap) return cap + 1; // no cell on this row can lead anywhere useful
    previous = current;
  }
  return previous[b.length] ?? cap + 1;
}

/**
 * The one distance-2 suggester (I18).
 *
 * Exported because C18 needs the same cutoff for unknown *verbs* and a second
 * implementation would agree about the distance and diverge about the tie-break
 * — which is where a suggestion is wrong rather than absent, and a wrong
 * suggestion is precisely what A01 A.2's cutoff exists to prevent. Same argument
 * as the shared tokeniser and `cells()`, one primitive over.
 *
 * **The tie-break is declaration order, and it is the part worth naming.** `<`
 * rather than `<=` means the first candidate at the minimum distance wins, so
 * the answer depends on the order the manifest declares its tools. That is
 * stable, cheap and arbitrary — and it is exactly the behaviour a second
 * implementation would get subtly different while passing every test written
 * against a manifest with no ties in it. T2.9 asserts it there.
 */
export function suggestName(
  name: string,
  candidates: readonly string[],
): string | undefined {
  let best: string | undefined;
  // **This is the cutoff, and `distance`'s cap is not.** The cap prunes the
  // matrix; raising it changes nothing observable, which a mutation pass
  // demonstrated by surviving. The number that decides is here, and A01 A.2's
  // "distance 2" means `d < 3`.
  let bestDistance = 3;
  for (const candidate of candidates) {
    const d = distance(name, candidate, 2);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}

function suggest(name: string, flags: readonly FlagDef[]): string | undefined {
  return suggestName(
    name,
    flags.map((f) => f.name),
  );
}

// --- the walk -------------------------------------------------------------

type Occurrence = Readonly<{ flag: FlagDef; raw: string | null }>;

function looksLikeFlag(token: string): boolean {
  return token.startsWith("-") && token !== "-";
}

export function validateInvocation(tool: ToolDef, argv: readonly string[]): ValidationResult {
  const errors: ErrorLike[] = [];
  const byName = new Map(tool.flags.map((f) => [f.name, f]));
  const byShort = new Map(tool.flags.filter((f) => f.short !== undefined).map((f) => [f.short, f]));

  const occurrences: Occurrence[] = [];
  const positionals: string[] = [];
  /** The argv the far side gets: everything except the shell's own switches. */
  const transmitted: string[] = [];
  let terminated = false;

  /** Is this token a flag the tool actually declares, long or short? */
  function declared(token: string): boolean {
    if (token.startsWith("--")) return byName.has(token.slice(2).split("=")[0] ?? "");
    const body = token.slice(1);
    const name = body.split("=")[0] ?? "";
    return [...name].every((c) => byShort.has(c)) && name.length > 0;
  }

  /**
   * The missing-value message, and where it says what to do instead.
   *
   * `--since -1h` is a missing-value failure under §3's permissive rule: `-1h`
   * reads as a flag, and guessing from the leading character would make the same
   * string mean two things on two tools. `--since=-1h` works, so the error names
   * that form rather than leaving the reader to find it.
   *
   * Two cases get the plain message instead, and both for T1.13's reason — a
   * wrong suggestion is worse than none, because it sends the reader to check
   * something that was never the problem:
   *
   *   - nothing follows the flag, so there is no token to quote and the
   *     recommendation would be a guess at what the user meant to type;
   *   - what follows is a flag this tool declares, so the user meant it as a
   *     flag and `--status=--mine` is not what they were reaching for.
   */
  function missingValue(flag: FlagDef, display: string, form: string, next: string | undefined): ErrorLike {
    const quotable =
      next !== undefined && next !== "--" && looksLikeFlag(next) && !declared(next);

    if (!quotable) {
      return err("missing_value", `${display} requires a value`, { tool: tool.name, flag: flag.name });
    }

    return err(
      "missing_value",
      `${display} expects a value; a value beginning with "-" must use ` +
        `${form}=${next}, or the parser reads it as a flag`,
      { tool: tool.name, flag: flag.name, value: next },
      `write it as ${form}=${next}`,
    );
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";

    // **`transmitted` is built by the walk that already understands the
    // grammar** (I21, F39). C18 needs the argv with the shell's own switches
    // removed, and deriving it there would be a second copy of the rules below
    // — where a value is inline or the next token, where `--` terminates. It is
    // built here, from one pass, and returned on the success arm.
    //
    // A switch spans exactly one token, which is why C05 refuses `shellOnly` on
    // anything else, and why this is a skip rather than a span.
    //
    // **The loop pushes one token per iteration; a valued flag spans two** (F148).
    // `--limit 400` reached the far side as `--limit`, because the value was
    // consumed by `i++` below and the top-of-loop push never saw it — silently,
    // on every type and on both forms, with only `--limit=400` surviving. So
    // each site that consumes a following token now transmits it there.
    if (!terminated && token.startsWith("--") && !token.includes("=")) {
      const f = byName.get(token.slice(2));
      if (f?.shellOnly === true) {
        // Recorded as an occurrence still: `--help` sets `args.help`, which is
        // how the shell learns it was asked for.
        occurrences.push({ flag: f, raw: null });
        continue;
      }
    }
    transmitted.push(token);

    // T3.7 — everything after `--` is positional, including tokens that look
    // like flags. A path named `--weird` is why this exists.
    if (terminated) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      terminated = true;
      continue;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      // T3.8 — split at the *first* `=`, so `--search=a=b` has the value `a=b`.
      // T3.9 — `--search=` is an empty string, which is not the same as absent.
      const name = eq === -1 ? body : body.slice(0, eq);
      const inline = eq === -1 ? null : body.slice(eq + 1);

      const flag = byName.get(name);
      if (flag === undefined) {
        const hint = suggest(name, tool.flags);
        errors.push(
          err(
            "unknown_flag",
            `"${tool.name}" has no flag --${name}`,
            { tool: tool.name, flag: name, ...(hint === undefined ? {} : { suggestion: hint }) },
            hint === undefined ? undefined : `did you mean --${hint}?`,
          ),
        );
        continue;
      }

      if (inline !== null) {
        occurrences.push({ flag, raw: inline });
        continue;
      }

      if (flag.type === "bool") {
        occurrences.push({ flag, raw: null });
        continue;
      }

      // A value may follow as its own token. The far side's own parser accepts
      // both forms, and rejecting `--status active` here would reject an
      // invocation that would have worked — the one failure mode a pre-spawn
      // gate must not have.
      const next = argv[i + 1];
      if (next === undefined || next === "--" || looksLikeFlag(next)) {
        errors.push(missingValue(flag, `--${flag.name}`, `--${flag.name}`, next));
        continue;
      }
      occurrences.push({ flag, raw: next });
      transmitted.push(next);
      i++;
      continue;
    }

    if (looksLikeFlag(token)) {
      const consumed = readShort(token, i);
      if (consumed === 1) transmitted.push(argv[i + 1] ?? "");
      i += consumed;
      continue;
    }

    positionals.push(token);
  }

  /** Returns how many *further* tokens it consumed — 1 for a space-separated value. */
  function readShort(token: string, index: number): number {
    const body = token.slice(1);
    const eq = body.indexOf("=");

    if (eq !== -1) {
      const name = body.slice(0, eq);
      const flag = byShort.get(name);
      if (flag === undefined) {
        errors.push(err("unknown_short_flag", `"${tool.name}" has no flag -${name}`, { tool: tool.name, flag: name }));
        return 0;
      }
      occurrences.push({ flag, raw: body.slice(eq + 1) });
      return 0;
    }

    const chars = [...body];

    // T3.10 — clustered shorts expand, and are rejected if any of them takes a
    // value. `-abc` where `-b` wants one has no sane reading: the remaining
    // characters are either its value or more flags, and guessing would make
    // the same string mean two things on two tools.
    if (chars.length > 1) {
      for (const char of chars) {
        const flag = byShort.get(char);
        if (flag === undefined) {
          errors.push(
            err("unknown_short_flag", `"${tool.name}" has no flag -${char}`, { tool: tool.name, flag: char }),
          );
          continue;
        }
        if (flag.type !== "bool") {
          errors.push(
            err(
              "clustered_value_flag",
              `-${char} (--${flag.name}) takes a value and cannot be clustered in "${token}"`,
              { tool: tool.name, flag: flag.name },
              `write it on its own: -${char}=<value>`,
            ),
          );
          continue;
        }
        occurrences.push({ flag, raw: null });
      }
      return 0;
    }

    const char = chars[0] ?? "";
    const flag = byShort.get(char);
    if (flag === undefined) {
      errors.push(err("unknown_short_flag", `"${tool.name}" has no flag -${char}`, { tool: tool.name, flag: char }));
      return 0;
    }
    if (flag.type === "bool") {
      occurrences.push({ flag, raw: null });
      return 0;
    }

    const next = argv[index + 1];
    if (next === undefined || next === "--" || looksLikeFlag(next)) {
      errors.push(missingValue(flag, `-${char} (--${flag.name})`, `-${char}`, next));
      return 0;
    }
    occurrences.push({ flag, raw: next });
    return 1;
  }

  return finish();

  // --- second pass: types, relations, arity -------------------------------

  function finish(): ValidationResult {
    const args: Record<string, unknown> = {};
    const counts = new Map<string, number>();

    for (const { flag, raw } of occurrences) {
      counts.set(flag.name, (counts.get(flag.name) ?? 0) + 1);

      if (raw === null) {
        args[flag.name] = true;
        continue;
      }

      if (flag.type === "bool") {
        errors.push(
          err("unexpected_value", `--${flag.name} is a switch and takes no value`, {
            tool: tool.name,
            flag: flag.name,
            value: raw,
          }),
        );
        continue;
      }

      const checked = CHECKS[flag.type](raw, flag);
      if (!checked.ok) {
        errors.push(
          err("bad_value", `--${flag.name}: ${checked.message}`, {
            tool: tool.name,
            flag: flag.name,
            value: raw,
            ...(flag.values === undefined ? {} : { values: flag.values }),
          }),
        );
        continue;
      }

      if (flag.repeatable === true) {
        const held = args[flag.name];
        args[flag.name] = Array.isArray(held) ? [...held, checked.value] : [checked.value];
      } else {
        args[flag.name] = checked.value;
      }
    }

    for (const [name, count] of counts) {
      const flag = byName.get(name);
      if (count > 1 && flag?.repeatable !== true) {
        errors.push(
          err("repeated_flag", `--${name} may only be given once`, { tool: tool.name, flag: name, count }),
        );
      }
    }

    // Keyed on the pair, not on name order. Ordering the *reporter* rather than
    // the pair silently drops a one-directional conflict — `--side-by-side`
    // declaring `conflicts: ["overlay"]` while `--overlay` declares nothing back
    // is the ordinary way an app writes it, and it went unreported entirely.
    const reportedConflicts = new Set<string>();

    for (const flag of tool.flags) {
      if (!counts.has(flag.name)) continue;

      for (const other of flag.requires ?? []) {
        if (!counts.has(other)) {
          errors.push(
            err("requires_unsatisfied", `--${flag.name} requires --${other}`, {
              tool: tool.name,
              flag: flag.name,
              requires: other,
            }),
          );
        }
      }

      for (const other of flag.conflicts ?? []) {
        const pair = [flag.name, other].sort().join("\u0000");
        if (counts.has(other) && !reportedConflicts.has(pair)) {
          reportedConflicts.add(pair);
          errors.push(
            err("conflicts_violated", `--${flag.name} cannot be combined with --${other}`, {
              tool: tool.name,
              flag: flag.name,
              conflicts: other,
            }),
          );
        }
      }
    }

    readPositionals(args);

    // **The contract, resolved here for `transmitted`'s reason** (I23, F80).
    // `counts` is the set of flags this invocation actually gave, which is the
    // fact C18 cannot recover without re-deriving the grammar above.
    //
    // `find` rather than a fold with a precedence rule: parse refuses an arm
    // equal to the tool's default, so every arm on this tool carries the same
    // value and the first one found is every one of them. **The arbitration is
    // absent because the disagreement is unbuildable**, not because a policy
    // picked a winner — which is why there is nothing here to get wrong later.
    const deciding = tool.flags.find((f) => f.interactive !== undefined && counts.has(f.name));

    return errors.length > 0
      ? Object.freeze({ ok: false as const, errors: Object.freeze(errors) })
      : Object.freeze({
          ok: true as const,
          args: Object.freeze(args),
          transmitted: Object.freeze([...transmitted]),
          interactive: deciding?.interactive ?? tool.interactive === true,
        });
  }

  function readPositionals(args: Record<string, unknown>): void {
    let cursor = 0;

    for (const def of tool.args) {
      if (def.variadic === true) {
        const rest = positionals.slice(cursor);
        cursor = positionals.length;
        if (def.required && rest.length === 0) {
          errors.push(missingArgument(def));
          continue;
        }
        const values: unknown[] = [];
        for (const raw of rest) {
          const checked = CHECKS[def.type](raw, def);
          if (checked.ok) values.push(checked.value);
          else errors.push(badArgument(def, raw, checked.message));
        }
        args[def.name] = Object.freeze(values);
        continue;
      }

      const raw = positionals[cursor];
      if (raw === undefined) {
        if (def.required) errors.push(missingArgument(def));
        continue;
      }
      cursor++;

      const checked = CHECKS[def.type](raw, def);
      if (checked.ok) args[def.name] = checked.value;
      else errors.push(badArgument(def, raw, checked.message));
    }

    if (cursor < positionals.length) {
      const extra = positionals.slice(cursor);
      errors.push(
        err(
          "extra_arguments",
          `"${tool.name}" takes ${tool.args.length} argument${tool.args.length === 1 ? "" : "s"}; ` +
            `${extra.length} more given: ${extra.join(" ")}`,
          { tool: tool.name, extra },
        ),
      );
    }
  }

  function missingArgument(def: ArgDef): ErrorLike {
    return err("missing_argument", `"${tool.name}" requires <${def.name}>`, {
      tool: tool.name,
      argument: def.name,
    });
  }

  function badArgument(def: ArgDef, raw: string, message: string): ErrorLike {
    return err(`bad_value`, `<${def.name}>: ${message}`, {
      tool: tool.name,
      argument: def.name,
      value: raw,
      ...(def.values === undefined ? {} : { values: def.values }),
    });
  }
}
