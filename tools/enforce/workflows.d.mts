// Types for A03 SS62, so the section reader and the code-only restriction can
// be tested against synthetic documents rather than only against the real A04.
import type { Violation } from "./source-scans.d.mts";

/** Every `make` target a workflow's steps run, deduplicated and sorted. */
export declare function targetsRun(yaml: string): string[];

/** One `## N.` section, heading included; `""` when the heading is absent. */
export declare function sectionOf(doc: string, heading: string): string;

/** Fenced blocks and inline code spans only — the part a target may be named in. */
export declare function codeOf(section: string): string;

/**
 * SS62 — every `make` target a workflow runs is named in A04 §6. `readFile` and
 * `list` are injected for the reason every other rule injects them: a rule is
 * only known to work once it has been shown to fire.
 */
export declare function checkWorkflows(io?: {
  readFile?: (file: string) => string;
  list?: () => string[];
}): Violation[];

export declare const WORKFLOW_RULES: readonly string[];
