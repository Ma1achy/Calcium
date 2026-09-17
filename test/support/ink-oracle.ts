// The Ink arm's output, captured while Ink existed (F1209).
//
// **C09 I72's claim is that a row is byte for byte the row Ink would have
// written, and the only thing that knew what Ink would have written was Ink.**
// T2.143, T2.144, T2.147 and T3.89 proved it by rendering each block both ways
// in the same run. The layout pass deleted Ink, which deleted that reference —
// so the reference was committed first and the rows arm is held to the
// committed bytes instead.
//
// **Freezing it strengthened the rows rather than preserving them.** A live
// oracle composes through the same registry as its subject, so it moves when
// the subject moves: T6.119 recorded the cap's marker and the floor's short pad
// as mutations that failed nothing for exactly that reason, and both fail now.
//
// **Every capture here is final.** The recorder is gone with Ink, which is what
// `frozen` says: these bytes cannot be regenerated, because the thing that
// produced them is not in the tree any more. That is the point rather than a
// limitation — an oracle a subject can rewrite is not an oracle.
//
// **A checker that walked the committed directory alone would agree with a
// corpus that had silently shrunk** — `tools/terminal-baseline.mjs`'s argument,
// and the reason `settle()` exists: every capture the suite asks for is
// compared against the set on disk by equality, both ways, so a block that
// stopped being rendered is a failure and not a quieter run.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "golden", "ink-oracle");

/**
 * Bytes to rows — **every row terminated, none separated.**
 *
 * `join("\n")` cannot tell `[]` from `[""]`, and both occur: an empty block
 * answers no rows and a block of one blank row answers one. The recorder
 * terminated each row instead, so the empty list is the empty file and the
 * single blank row one newline, and dropping the tail after the last terminator
 * inverts it exactly. The corpus holds both — `group-adv-empty` captured as 0
 * bytes and `code-adv-blank` as 1 — so this is measured rather than argued.
 */
function decode(bytes: string): readonly string[] {
  const parts = bytes.split("\n");
  return parts.slice(0, Math.max(0, parts.length - 1)); // cells-ok — rows, not columns
}

/** A capture's file name. **The width is in it**, or two widths collide. */
export function oracleName(key: string, capsName: string, width: number): string {
  const safe = key.replace(/[^A-Za-z0-9._-]/gu, "_");
  return `${safe}-${capsName}-${String(width)}w.txt`;
}

/** One suite's captured Ink output, read. */
export class InkOracle {
  readonly #dir: string;
  readonly #seen = new Set<string>();

  constructor(suite: string) {
    this.#dir = join(ROOT, suite);
  }

  /** A capture. Its producer is deleted, so a missing file cannot be restored. */
  frozen(name: string): readonly string[] {
    this.#seen.add(name);
    const path = join(this.#dir, name);
    if (!existsSync(path)) {
      throw new Error(`${name} is missing — Ink is gone, so nothing in this tree can produce it again`);
    }
    return decode(readFileSync(path, "utf8"));
  }

  /**
   * Every capture asked for, against every capture committed — **by equality,
   * both ways.**
   *
   * A subset check passes a corpus that shrank, which is the whole reason the
   * baseline generator holds its corpus in one place rather than walking a
   * directory. It is also the failure mode a captured oracle has and a live one
   * could not: a live oracle was computed from the corpus that ran.
   */
  settle(): Readonly<{ asked: readonly string[]; committed: readonly string[] }> {
    const committed = existsSync(this.#dir) ? readdirSync(this.#dir).filter((f) => f.endsWith(".txt")) : [];
    return { asked: [...this.#seen].sort(), committed: [...committed].sort() };
  }
}
