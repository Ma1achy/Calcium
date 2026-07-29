/**
 * §4 — C06 reports, C07 decides. This file is the deciding.
 *
 * The table is evaluated top to bottom and the first match wins, which is the
 * whole of its meaning: `cancelled` outranks `timedOut` because a user-initiated
 * stop during a timeout is still a stop, and an ordering written as a set of
 * independent conditions would make that depend on which `if` someone put first.
 *
 * **Cancellation produces `partial`.** The user asked for the stop, so it is not
 * a failure and the forty log lines already on screen stay useful. It is the one
 * row that resists being rewritten as an error, and A01 B4 said the opposite
 * until it was corrected.
 */

import type { ToolDef } from "../manifest/types.js";
import { stripControl } from "../text.js";
import { block } from "../viewmodel/construct.js";
import type { Block, DocumentStatus, ErrorLike } from "../viewmodel/types.js";
import type { AdapterContext, RawResult } from "./types.js";

/**
 * Written here because C04 I6 requires a glyph on `error` and `warn` and the
 * glyph vocabulary is L1 (C09 §4), which C07 must not import (MG7).
 *
 * **These reach an ASCII terminal unchanged.** C09 substitutes glyphs it chose
 * itself and emits a block-supplied one verbatim, so the 1:1 substitution rule
 * does not cover this path. That is a gap in the seam rather than in this file
 * — every producer of a toned notice has it, including C24's `b.notice.error` —
 * and it is recorded here rather than worked around, because a local workaround
 * would be a second glyph vocabulary.
 */
const CROSS = "✗";

/** What the mapping decides, before the adapter's blocks are known. */
export type Outcome = Readonly<{
  status: DocumentStatus;
  error?: ErrorLike;
  /** Non-null replaces the adapter's blocks entirely; null keeps them. */
  blocks: readonly Block[] | null;
  /** Appended after whatever blocks are used. */
  appended: readonly Block[];
}>;

/** Signal name → number, for `meta.exitCode` (A01 D54, C01 §Signals). */
const SIGNUM: Readonly<Record<string, number>> = Object.freeze({
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGABRT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
});

/**
 * I14 — finite on every path, and `-1` means the process never started.
 *
 * It has exactly two producers and they are one condition: a spawn failure, and
 * an invocation whose signal was already aborted so nothing was spawned (C06
 * §3). A real child's exit never carries both code and signal null, so there is
 * no "we do not know" hiding in the sentinel. The two split on *status* — the
 * aborted one carries `cancelled` and settles as `partial` — which is the
 * mapping working rather than a collision.
 */
export function exitCodeOf(raw: RawResult): number {
  if (raw.exitCode !== null) return raw.exitCode;
  if (raw.signal !== null) {
    const signum = SIGNUM[raw.signal];
    // 128 with no addend: killed, and the number is not derivable from a name
    // this table does not have. Distinct from -1, which means never started.
    return signum === undefined ? 128 : 128 + signum;
  }
  return -1;
}

function errorNotice(id: string, text: string): Block {
  return block({ kind: "notice", id, tone: "error", glyph: CROSS, text: stripControl(text) });
}

function rawBlock(id: string, text: string): readonly Block[] {
  return text.trim() === "" ? [] : [block({ kind: "raw", id, text: stripControl(text) })];
}

// --- envelopes ------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringAt(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value !== "" ? stripControl(value) : undefined;
}

/**
 * An envelope, if stdout is one. `message` is the only required field (C04 F3),
 * which is what lets a failed `promote` and a failed `validate` render through
 * one path — the fields beyond it are carried when present and never demanded.
 *
 * Two shapes are accepted because both are what far sides emit: the envelope at
 * the top level, and nested under `error`.
 */
export function parseEnvelope(stdout: unknown): ErrorLike | null {
  if (!isRecord(stdout)) return null;
  const source = isRecord(stdout["error"]) ? stdout["error"] : stdout;

  const message = stringAt(source, "message");
  if (message === undefined) return null;

  // Spread-if-present rather than assign-undefined: `exactOptionalPropertyTypes`
  // makes the two different, and an `ErrorLike` carrying `code: undefined` is
  // one that says it has a code.
  const code = stringAt(source, "code");
  const stage = stringAt(source, "stage");
  const remediation = stringAt(source, "remediation");
  const details = source["details"];

  return {
    message,
    ...(code === undefined ? {} : { code }),
    ...(stage === undefined ? {} : { stage }),
    ...(isRecord(details) ? { details } : {}),
    ...(remediation === undefined ? {} : { remediation }),
  };
}

/**
 * Synthesised when the far side gave no envelope. `message` is non-empty on
 * every path (T1.12): stderr if there is any, and a statement of the exit code
 * if there is not, because "the command failed" with no text is a document that
 * says less than the exit code did.
 */
function synthesise(raw: RawResult, fallbackMessage: string): ErrorLike {
  const stderr = raw.stderr.trim();
  return { message: stripControl(stderr === "" ? fallbackMessage : stderr) };
}

/**
 * A remediation that is a command becomes a `fill` action — typed into the
 * prompt, never run (D5's reasoning: firing a command from a document the user
 * has not read is a footgun).
 *
 * The test is the command prefix (D20, D23), which is the only thing about the
 * command surface that L0 may know. Anything else is prose and renders as prose
 * (T3.16) — a sentence beginning "contact your administrator" is not a thing to
 * put in someone's input bar.
 */
export function remediationBlocks(remediation: string | undefined, id: string): readonly Block[] {
  if (remediation === undefined || remediation.trim() === "") return [];
  const text = stripControl(remediation.trim());

  if (!text.startsWith("/") || text.includes("\n")) {
    return [block({ kind: "tip", id, text })];
  }
  return [block({ kind: "tip", id, text, actions: [{ kind: "fill", label: "Use", command: text }] })];
}

// --- the usage block ------------------------------------------------------

/**
 * Exit 2 is an invocation problem, so the document says what a correct
 * invocation looks like — generated from the manifest (T4.4), because a
 * hardcoded usage string is wrong the first time a flag is added and nobody
 * notices until someone reads it.
 */
export function usageBlocks(tool: ToolDef | null, id: string): readonly Block[] {
  if (tool === null) return [];

  const args = tool.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ");
  const lines = [`/${tool.name}${args === "" ? "" : ` ${args}`}${tool.flags.length > 0 ? " [flags]" : ""}`];

  if (tool.args.length > 0) {
    lines.push("", "Arguments:");
    for (const a of tool.args) lines.push(`  ${a.name}  ${a.summary}`);
  }
  if (tool.flags.length > 0) {
    lines.push("", "Flags:");
    for (const f of tool.flags) {
      const short = f.short === undefined ? "" : `-${f.short}, `;
      lines.push(`  ${short}--${f.name}  ${f.summary}`);
    }
  }

  return [block({ kind: "code", id, language: "text", text: stripControl(lines.join("\n")) })];
}

// --- the table ------------------------------------------------------------

/**
 * §4, top to bottom, first match wins. The ordering is the specification and
 * the `if` chain is the implementation of it — which is why each row is one
 * branch in the documented sequence rather than a lookup.
 */
export function mapResult(raw: RawResult, ctx: AdapterContext): Outcome {
  const id = (suffix: string): string => `map-${suffix}`;

  if (raw.cancelled) {
    return {
      status: "partial",
      blocks: null,
      appended: [
        block({
          kind: "notice",
          id: id("cancelled"),
          tone: "muted",
          text: "Cancelled. Output produced before the stop is shown above.",
        }),
      ],
    };
  }

  if (raw.timedOut) {
    const message = `Timed out after ${String(raw.durationMs)} ms.`;
    return {
      status: "error",
      error: { message, code: "TIMEOUT" },
      blocks: [errorNotice(id("timeout"), message), ...rawBlock(id("timeout-err"), raw.stderr)],
      appended: [],
    };
  }

  if (raw.exitCode === 0) return { status: "ok", blocks: null, appended: [] };

  if (raw.exitCode === 1) {
    const error = parseEnvelope(raw.stdout) ?? synthesise(raw, "The command failed.");
    return {
      status: "error",
      error,
      blocks: [
        errorNotice(id("failed"), error.message),
        ...remediationBlocks(error.remediation, id("remediation")),
      ],
      appended: [],
    };
  }

  if (raw.exitCode === 2) {
    const error = synthesise(raw, "That invocation is not valid.");
    return {
      status: "error",
      error,
      blocks: [
        errorNotice(id("usage"), error.message),
        ...usageBlocks(ctx.tool, id("usage-block")),
        ...rawBlock(id("usage-err"), raw.stderr),
      ],
      appended: [],
    };
  }

  if (raw.signal !== null) {
    const message = `Killed by ${raw.signal}.`;
    return {
      status: "error",
      error: { message, code: "KILLED_BY_SIGNAL" },
      blocks: [errorNotice(id("signal"), message), ...rawBlock(id("signal-err"), raw.stderr)],
      appended: [],
    };
  }

  const message =
    raw.exitCode === null
      ? "The command did not start."
      : `The command exited with code ${String(raw.exitCode)}.`;
  return {
    status: "error",
    error: { message, code: "UNEXPECTED_EXIT" },
    blocks: [errorNotice(id("exit"), message), ...rawBlock(id("exit-err"), raw.stderr)],
    appended: [],
  };
}
