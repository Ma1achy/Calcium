/**
 * C05 §3 — the six verbs Calcium ships, as rows in every parsed manifest.
 *
 * **They are verbs.** They have names, take arguments, complete, validate and
 * appear in help; everything the manifest exists to describe is true of them,
 * and the only reason they were absent is that nobody wrote them down.
 *
 * C23 ships the handlers (C23 §2) and C18 classifies `local` from the manifest,
 * so without these rows the handlers are registered for verbs nothing can ever
 * route to — which is what C23 I27's reconciliation reports, correctly.
 *
 * A `ToolDef[]` rather than a `Manifest` fragment: a fragment implies a schema
 * version and a merge of two schemas, and tools is all this is.
 *
 * **No eighth `ArgType` was needed**, which is worth stating because EX5 claims
 * the union stays domain-free and the framework's own verbs failing it would
 * have been the strongest counterexample available. `/theme` takes an `enum`,
 * `/history` and `/debug` an `int`.
 */

import type { FlagDef, ToolDef } from "./types.js";

/**
 * Appended after the app's tools, never prepended.
 *
 * `fail` indexes errors as `tools[3]`, so prepending would shift every index an
 * app could read and make a parse error point at a row the author never wrote.
 */
export const FRAMEWORK_TOOLS: readonly ToolDef[] = Object.freeze([
  Object.freeze({
    name: "help",
    local: true,
    summary: "list the verbs; `/help keys` lists the key bindings",
    // **Declared, or `/help keys` is not completable and reads as a typo.** The
    // argument is optional and the only value it takes is `keys`; C18 does not
    // enforce a value set, so this is what `/help` and completion have to go on.
    args: [Object.freeze({ name: "topic", type: "string" as const, required: false, summary: "`keys`, for the key bindings" })],
    flags: [],
  }),
  Object.freeze({
    name: "clear",
    local: true,
    summary: "empty the transcript; command history is untouched",
    args: [],
    flags: [],
  }),
  Object.freeze({
    name: "theme",
    local: true,
    summary: "switch between the dark and light variants",
    args: [
      // **No `values` here, and they arrive through `withThemeNames`** (C10
      // I27). The names are the theme set's keys, which live in `TuiConfig` and
      // are not knowable at module scope — so a literal pair here would make
      // `/theme high-contrast` a validation error for a theme the session
      // holds, with the completion and the usage text going wrong in the same
      // breath.
      //
      // **Absent rather than a default pair**, so a manifest that never met
      // `withThemeNames` fails loudly: an `enum` with no values rejects every
      // invocation — *expected one of , got dark* — instead of quietly working
      // for exactly the two names a fallback would have named.
      Object.freeze({
        name: "variant",
        type: "enum" as const,
        required: true,
        summary: "which theme to use",
      }),
    ],
    // **`shellOnly`, and that is what keeps the handler's positional read
    // correct** (C22 I66, roadmap 39). `argv` for a local verb is
    // `[verb, ...validation.transmitted]`, so a `shellOnly` flag is stripped
    // before a handler sees it — declared any other way, `/theme --no-bg light`
    // is a valid invocation that answers with a usage error. It appears in
    // `/theme --help` with nothing else written, because `usageBlocks` walks
    // `tool.flags` flat.
    flags: [
      Object.freeze({
        name: "no-bg",
        type: "bool" as const,
        shellOnly: true,
        summary: "do not paint this theme's background; keep the terminal's",
      }),
    ],
  }),
  Object.freeze({
    name: "history",
    local: true,
    summary: "show recent commands",
    args: [
      Object.freeze({
        name: "count",
        type: "int" as const,
        required: false,
        summary: "how many to show; default 20",
      }),
    ],
    flags: [],
  }),
  Object.freeze({
    name: "debug",
    local: true,
    // **Hidden, and it is the field doing exactly what it was built for**:
    // `visibleTools` drops it so it leaves help and completion, `findTool` still
    // resolves it so it works for whoever knows the name (§ToolDef).
    hidden: true,
    summary: "show what an entry actually ran",
    args: [
      Object.freeze({
        name: "back",
        type: "int" as const,
        required: false,
        summary: "how many entries back; default 1",
      }),
    ],
    flags: [],
  }),
  Object.freeze({
    name: "exit",
    local: true,
    summary: "end the session",
    args: [],
    flags: [],
  }),
] satisfies readonly ToolDef[]);

/** The names, for the collision message and for tests that must not derive them. */
export const FRAMEWORK_NAMES: readonly string[] = Object.freeze(
  FRAMEWORK_TOOLS.map((t) => t.name),
);

/**
 * The flags Calcium reserves on **every** tool, appended as the six verbs above
 * are appended to every manifest (C05 I22, F92).
 *
 * **Reserved rather than declared, and that is the whole argument.** `--help`
 * asked per-app is a per-app discipline: one app forgetting it is a verb with no
 * help, and the failure is silent because a missing flag looks exactly like a
 * verb nobody asked about. `usageBlocks` generates from the manifest for the
 * same reason its own comment gives — *a hardcoded usage string is wrong the
 * first time a flag is added and nobody notices* — and a per-app `--help` puts
 * that discipline back one level up.
 *
 * `shellOnly`, because the far side has its own `--help` and its own opinion
 * about it, and F39 is what happens when a flag Calcium means reaches a binary
 * that means something else by it.
 */
export const FRAMEWORK_FLAGS: readonly FlagDef[] = Object.freeze([
  Object.freeze({
    name: "help",
    type: "bool" as const,
    shellOnly: true,
    summary: "what this verb takes",
  }),
] satisfies readonly FlagDef[]);

/** The reserved flag names, for the collision message (I22). */
export const RESERVED_FLAGS: readonly string[] = Object.freeze(
  FRAMEWORK_FLAGS.map((f) => f.name),
);
