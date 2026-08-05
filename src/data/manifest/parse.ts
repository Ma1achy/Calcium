/**
 * `parseManifest` — the boundary. C05 §2, §6 — see spec.
 *
 * **Total** (I2): any input yields a manifest or a list of errors, never a
 * throw. It is given hostile input by definition — a hand-written fixture, a
 * document fetched from a far side that may be newer than this TUI, a truncated
 * file — so a throw here is a crash on someone else's typo.
 *
 * **Strict about structure, lenient about extension** (I3): the output is built
 * from known fields only, so unknown ones are dropped rather than rejected,
 * while a malformed *known* field is an error. That asymmetry is what lets a
 * newer far side add a field without breaking an older TUI, and T6.2 is the
 * test that catches its reversal.
 *
 * Four classes of check that could have been deferred to validation live here
 * instead, because each of them turns a runtime failure into a parse failure:
 * an uncompilable `pattern` (I8's purity claim depends on it), duplicate names,
 * `requires`/`conflicts` naming flags that do not exist, and a `requires` cycle
 * that would otherwise be found as a hang.
 */

import { deepFreeze } from "../viewmodel/index.js";
import {
  ARG_TYPES,
  MANIFEST_SCHEMA,
  type ArgDef,
  type ArgType,
  type FlagDef,
  type Manifest,
  type ManifestError,
  type Result,
  type ToolDef,
} from "./types.js";
import { FRAMEWORK_NAMES, FRAMEWORK_TOOLS } from "./framework.js";

const ARG_TYPE_SET: ReadonlySet<string> = new Set<string>(ARG_TYPES);

type Errors = ManifestError[];

// --- small total helpers --------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Paths are built by concatenation from the root, so a root-level field arrives
 * as `.binary`. Normalising here keeps every call site free of the special case.
 */
function fail(e: Errors, path: string, message: string): void {
  e.push(Object.freeze({ path: path.startsWith(".") ? path.slice(1) : path, message }));
}

/** A required string field. Returns null and records an error when absent. */
function takeString(
  src: Record<string, unknown>,
  key: string,
  e: Errors,
  at: string,
  { allowEmpty = false } = {},
): string | null {
  const v = src[key];
  if (typeof v !== "string") {
    fail(e, `${at}.${key}`, `"${key}" must be a string`);
    return null;
  }
  if (!allowEmpty && v.length === 0) {
    fail(e, `${at}.${key}`, `"${key}" must not be empty`);
    return null;
  }
  return v;
}

function takeBoolean(src: Record<string, unknown>, key: string, e: Errors, at: string): boolean | null {
  const v = src[key];
  if (typeof v !== "boolean") {
    fail(e, `${at}.${key}`, `"${key}" must be a boolean`);
    return null;
  }
  return v;
}

/** An optional boolean. Absent is fine; present and wrong is an error. */
function takeOptionalBoolean(
  src: Record<string, unknown>,
  key: string,
  e: Errors,
  at: string,
): boolean | undefined {
  const v = src[key];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") {
    fail(e, `${at}.${key}`, `"${key}" must be a boolean when present`);
    return undefined;
  }
  return v;
}

function takeStringArray(
  src: Record<string, unknown>,
  key: string,
  e: Errors,
  at: string,
): readonly string[] | undefined {
  const v = src[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) {
    fail(e, `${at}.${key}`, `"${key}" must be an array of strings when present`);
    return undefined;
  }
  const out: string[] = [];
  for (let i = 0; i < v.length; i++) {
    const item = v[i];
    if (typeof item !== "string") {
      fail(e, `${at}.${key}[${i}]`, `"${key}" entries must be strings`);
      continue;
    }
    out.push(item);
  }
  return out;
}

function takeArgType(src: Record<string, unknown>, e: Errors, at: string): ArgType | null {
  const v = src["type"];
  if (typeof v !== "string" || !ARG_TYPE_SET.has(v)) {
    fail(e, `${at}.type`, `"type" must be one of ${ARG_TYPES.join(", ")}`);
    return null;
  }
  return v as ArgType;
}

/**
 * I4, in one place because it applies identically to flags and to positionals:
 * `values` iff `enum`, `pattern` iff `pattern`.
 *
 * The pattern is compiled here rather than at validation. `validateInvocation`
 * is pure and total (I8), and a regex that throws on construction inside it
 * would make that claim false in exactly the case nobody tests — a malformed
 * manifest, which is the case this component exists to catch.
 */
function takeTypedShape(
  src: Record<string, unknown>,
  type: ArgType,
  e: Errors,
  at: string,
): { values?: readonly string[]; pattern?: string } {
  const out: { values?: readonly string[]; pattern?: string } = {};

  const rawValues = src["values"];
  if (type === "enum") {
    if (!Array.isArray(rawValues) || rawValues.length === 0) {
      fail(e, `${at}.values`, `"values" is required and must be a non-empty array for type "enum"`);
    } else {
      const values = takeStringArray(src, "values", e, at);
      if (values !== undefined) out.values = values;
    }
  } else if (rawValues !== undefined) {
    fail(e, `${at}.values`, `"values" is only permitted on type "enum", not "${type}"`);
  }

  const rawPattern = src["pattern"];
  if (type === "pattern") {
    if (typeof rawPattern !== "string" || rawPattern.length === 0) {
      fail(e, `${at}.pattern`, `"pattern" is required and must be a string for type "pattern"`);
    } else if (!isAnchored(rawPattern)) {
      fail(
        e,
        `${at}.pattern`,
        `"pattern" must be anchored — start with ^ and end with $ — or it matches substrings ` +
          `and accepts more than the app declared`,
      );
    } else if (!compiles(rawPattern)) {
      fail(e, `${at}.pattern`, `"pattern" is not a valid regular expression`);
    } else {
      out.pattern = rawPattern;
    }
  } else if (rawPattern !== undefined) {
    fail(e, `${at}.pattern`, `"pattern" is only permitted on type "pattern", not "${type}"`);
  }

  return out;
}

function isAnchored(pattern: string): boolean {
  if (!pattern.startsWith("^") || !pattern.endsWith("$")) return false;
  // A trailing `\$` is an escaped dollar, not an anchor. Count the run of
  // backslashes before it: an odd run means the `$` is literal.
  let backslashes = 0;
  for (let i = pattern.length - 2; i >= 0 && pattern[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 0;
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
}

// --- flags, args, tools ---------------------------------------------------

function parseFlag(raw: unknown, e: Errors, at: string): FlagDef | null {
  if (!isRecord(raw)) {
    fail(e, at, "a flag must be an object");
    return null;
  }

  const name = takeString(raw, "name", e, at);
  const summary = takeString(raw, "summary", e, at, { allowEmpty: true });
  const type = takeArgType(raw, e, at);
  if (name === null || summary === null || type === null) return null;

  if (name.startsWith("-")) {
    fail(e, `${at}.name`, `"name" is the long form without "--"; "${name}" carries its own dashes`);
  }

  const shaped = takeTypedShape(raw, type, e, at);

  let short: string | undefined;
  const rawShort = raw["short"];
  if (rawShort !== undefined) {
    if (typeof rawShort !== "string" || [...rawShort].length !== 1 || rawShort === "-") {
      fail(e, `${at}.short`, `"short" must be a single character without "-"`);
    } else {
      short = rawShort;
    }
  }

  const repeatable = takeOptionalBoolean(raw, "repeatable", e, at);
  const requires = takeStringArray(raw, "requires", e, at);
  const conflicts = takeStringArray(raw, "conflicts", e, at);
  const view = takeOptionalBoolean(raw, "view", e, at);

  return {
    name,
    ...(short === undefined ? {} : { short }),
    type,
    ...shaped,
    ...(repeatable === undefined ? {} : { repeatable }),
    ...(requires === undefined ? {} : { requires }),
    ...(conflicts === undefined ? {} : { conflicts }),
    ...(view === undefined ? {} : { view }),
    summary,
  };
}

function parseArg(raw: unknown, e: Errors, at: string): ArgDef | null {
  if (!isRecord(raw)) {
    fail(e, at, "an argument must be an object");
    return null;
  }

  const name = takeString(raw, "name", e, at);
  const summary = takeString(raw, "summary", e, at, { allowEmpty: true });
  const type = takeArgType(raw, e, at);
  const required = takeBoolean(raw, "required", e, at);
  if (name === null || summary === null || type === null || required === null) return null;

  const shaped = takeTypedShape(raw, type, e, at);
  const variadic = takeOptionalBoolean(raw, "variadic", e, at);

  return {
    name,
    type,
    required,
    ...(variadic === undefined ? {} : { variadic }),
    ...shaped,
    summary,
  };
}

/**
 * The relations between a tool's own flags. Each of these is a manifest the app
 * can write and nothing downstream can make sense of, so it fails here rather
 * than producing a validator that behaves arbitrarily.
 */
function checkFlagRelations(flags: readonly FlagDef[], e: Errors, at: string): void {
  const byName = new Map<string, number>();
  const byShort = new Map<string, number>();

  flags.forEach((flag, i) => {
    const seen = byName.get(flag.name);
    if (seen !== undefined) {
      fail(e, `${at}.flags[${i}].name`, `duplicate flag "--${flag.name}", already declared at flags[${seen}]`);
    } else {
      byName.set(flag.name, i);
    }

    if (flag.short !== undefined) {
      const seenShort = byShort.get(flag.short);
      if (seenShort !== undefined) {
        fail(
          e,
          `${at}.flags[${i}].short`,
          `short flag "-${flag.short}" is already taken by "--${flags[seenShort]?.name}"`,
        );
      } else {
        byShort.set(flag.short, i);
      }
    }
  });

  // A relation naming a flag that does not exist can never be satisfied, and
  // reads at validation time as a rule that silently never fires.
  flags.forEach((flag, i) => {
    for (const key of ["requires", "conflicts"] as const) {
      for (const other of flag[key] ?? []) {
        if (!byName.has(other)) {
          fail(
            e,
            `${at}.flags[${i}].${key}`,
            `"--${flag.name}" ${key} "--${other}", which this tool does not declare`,
          );
        }
      }
    }
  });

  // T3.11 — a `requires` cycle. Found here as a parse error rather than at
  // validation as a hang, which is the difference between a bad manifest and a
  // frozen prompt.
  const cycle = firstRequiresCycle(flags, byName);
  if (cycle !== null) {
    fail(
      e,
      `${at}.flags`,
      `"requires" forms a cycle: ${cycle.map((n) => `--${n}`).join(" → ")}. ` +
        `No invocation can satisfy it`,
    );
  }
}

function firstRequiresCycle(
  flags: readonly FlagDef[],
  byName: ReadonlyMap<string, number>,
): readonly string[] | null {
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];

  const walk = (name: string): readonly string[] | null => {
    const seen = state.get(name);
    if (seen === "done") return null;
    if (seen === "open") return [...stack.slice(stack.indexOf(name)), name];

    state.set(name, "open");
    stack.push(name);
    const index = byName.get(name);
    const flag = index === undefined ? undefined : flags[index];
    for (const next of flag?.requires ?? []) {
      if (!byName.has(next)) continue; // already reported as an unknown relation
      const found = walk(next);
      if (found !== null) return found;
    }
    stack.pop();
    state.set(name, "done");
    return null;
  };

  for (const flag of flags) {
    const found = walk(flag.name);
    if (found !== null) return found;
  }
  return null;
}

function parseTool(raw: unknown, e: Errors, at: string): ToolDef | null {
  if (!isRecord(raw)) {
    fail(e, at, "a tool must be an object");
    return null;
  }

  const name = takeString(raw, "name", e, at);
  const summary = takeString(raw, "summary", e, at, { allowEmpty: true });
  const local = takeBoolean(raw, "local", e, at);

  const rawArgs = raw["args"];
  const rawFlags = raw["flags"];
  if (!Array.isArray(rawArgs)) fail(e, `${at}.args`, `"args" must be an array`);
  if (!Array.isArray(rawFlags)) fail(e, `${at}.flags`, `"flags" must be an array`);
  if (name === null || summary === null || local === null) return null;
  if (!Array.isArray(rawArgs) || !Array.isArray(rawFlags)) return null;

  if (name.trim() !== name || name.includes("  ")) {
    fail(e, `${at}.name`, `"${name}" has leading, trailing or doubled spaces; tokens would never match it`);
  }

  const args: ArgDef[] = [];
  rawArgs.forEach((a, i) => {
    const parsed = parseArg(a, e, `${at}.args[${i}]`);
    if (parsed !== null) args.push(parsed);
  });

  const flags: FlagDef[] = [];
  rawFlags.forEach((f, i) => {
    const parsed = parseFlag(f, e, `${at}.flags[${i}]`);
    if (parsed !== null) flags.push(parsed);
  });

  checkFlagRelations(flags, e, at);

  const streams = takeOptionalBoolean(raw, "streams", e, at);
  const oneShot = takeOptionalBoolean(raw, "oneShot", e, at);
  const hidden = takeOptionalBoolean(raw, "hidden", e, at);
  const interactive = takeOptionalBoolean(raw, "interactive", e, at);
  const view = takeOptionalBoolean(raw, "view", e, at);

  // I19 — the two combinations that describe a verb which cannot exist. Both
  // are cross-field rules of I4's kind and sit where I4 sits, so the report
  // reaches the author who wrote the manifest rather than the user watching a
  // terminal misbehave. `interactive` alone is fine and is not checked here.
  if (interactive === true) {
    if (streams === true) {
      fail(
        e,
        `${at}.interactive`,
        `"${name}" declares both interactive and streams — a handoff gives the ` +
          `terminal to the child and a stream reads its stdout into the transcript; ` +
          `drop whichever one the verb does not do`,
      );
    }
    if (local) {
      fail(
        e,
        `${at}.interactive`,
        `"${name}" is local and interactive — a local verb is handled in-process ` +
          `and never spawned, so there is no child to hand the terminal to`,
      );
    }
  }

  // I20 — `view` is the tier, and its two refusals are I19's shape. `streams` is
  // deliberately absent from them: S12's logs view is a streaming source rendered
  // into a pushed view, so refusing that pair would refuse the surface C22 §13a
  // was ruled for.
  if (view === true) {
    if (interactive === true) {
      fail(
        e,
        `${at}.view`,
        `"${name}" declares both view and interactive — both hand input ownership ` +
          `away, the view to the shell's own keymap and the handoff to a child; ` +
          `drop whichever one the verb does not do`,
      );
    }
    if (oneShot === true) {
      fail(
        e,
        `${at}.view`,
        `"${name}" declares both view and oneShot — a one-shot writes one frame ` +
          `and exits without a terminal, and a view is a claim on one that stays`,
      );
    }
  }

  return {
    name,
    local,
    summary,
    args,
    flags,
    ...(streams === undefined ? {} : { streams }),
    ...(oneShot === undefined ? {} : { oneShot }),
    ...(hidden === undefined ? {} : { hidden }),
    ...(interactive === undefined ? {} : { interactive }),
    ...(view === undefined ? {} : { view }),
  };
}

/**
 * The parse. Errors accumulate rather than short-circuiting: an app fixing a
 * manifest wants every complaint at once, not one per run.
 */
export function parseManifest(raw: unknown): Result<Manifest, readonly ManifestError[]> {
  const e: Errors = [];

  if (!isRecord(raw)) {
    return { ok: false, error: Object.freeze([{ path: "", message: "a manifest must be an object" }]) };
  }

  if (raw["schema"] !== MANIFEST_SCHEMA) {
    fail(e, "schema", `"schema" must be "${MANIFEST_SCHEMA}"`);
  }

  const binary = takeString(raw, "binary", e, "");
  const version = takeString(raw, "version", e, "");

  const rawTools = raw["tools"];
  const tools: ToolDef[] = [];
  if (!Array.isArray(rawTools)) {
    fail(e, "tools", `"tools" must be an array`);
  } else {
    const seen = new Map<string, number>();
    // **Seeded with the framework's six** (C05 §3), so an app declaring its own
    // `clear` collides at parse rather than silently overriding a verb
    // `tui-kit`'s handlers depend on. I6 already refuses duplicates; this is
    // that rule reaching the rows the app did not write.
    const framework = new Set(FRAMEWORK_NAMES);

    rawTools.forEach((t, i) => {
      const parsed = parseTool(t, e, `tools[${i}]`);
      if (parsed === null) return;

      // I6 — duplicates fail rather than last-wins. Last-wins is the version of
      // this that ships: the manifest still loads, and one of the two tools is
      // simply never reachable.
      if (framework.has(parsed.name)) {
        // By name, not by index: "already declared at tools[7]" is meaningless
        // against a file the author wrote two entries in.
        fail(
          e,
          `tools[${i}].name`,
          `"${parsed.name}" is a verb tui-kit ships (C05 §3) — choose another name, ` +
            `or the framework's handler for it becomes unreachable`,
        );
        return;
      }

      const first = seen.get(parsed.name);
      if (first !== undefined) {
        fail(e, `tools[${i}].name`, `duplicate tool "${parsed.name}", already declared at tools[${first}]`);
        return;
      }
      seen.set(parsed.name, i);
      tools.push(parsed);
    });
  }

  if (e.length > 0 || binary === null || version === null) {
    return { ok: false, error: Object.freeze(e) };
  }

  return {
    ok: true,
    // **The framework's six, appended** (C05 §3). Appended rather than prepended
    // so no index an app could read is shifted: `fail` reports `tools[3]`, and a
    // parse error pointing at a row nobody wrote is worse than no path at all.
    value: deepFreeze({
      schema: MANIFEST_SCHEMA,
      binary,
      version,
      // Appended rather than prepended so no index an app could read is shifted:
      // `fail` reports `tools[3]`, and a parse error pointing at a row nobody
      // wrote is worse than no path at all.
      tools: [...tools, ...FRAMEWORK_TOOLS],
      // What the app wrote (§3). `serialise` emits this, so the round-trip
      // property holds exactly: parse re-derives the framework's six.
      appTools: tools,
    }),
  };
}
