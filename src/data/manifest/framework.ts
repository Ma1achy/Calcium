/**
 * C05 §3 — the six verbs `tui-kit` ships, as rows in every parsed manifest.
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

import type { ToolDef } from "./types.js";

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
    summary: "list verbs and key bindings",
    args: [],
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
      Object.freeze({
        name: "variant",
        type: "enum" as const,
        required: true,
        values: Object.freeze(["dark", "light"]),
        summary: "which variant to use",
      }),
    ],
    flags: [],
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
