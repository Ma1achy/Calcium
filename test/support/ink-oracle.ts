// The Ink arm's output, captured while Ink still exists (F1209).
//
// **C09 I72's claim is that a row is byte for byte the row Ink would have
// written, and the only thing that knows what Ink would have written is Ink.**
// T2.143, T2.144 and T3.89 proved it by rendering each block both ways in the
// same run. The layout pass deletes Ink, which deletes that reference — so the
// reference is committed first and the rows arm is held to the committed bytes
// instead.
//
// **Freezing it strengthens the rows rather than preserving them.** A live
// oracle composes through the same registry as its subject, so it moves when
// the subject moves: T6.119 records the cap's marker and the floor's short pad
// as mutations that fail nothing for exactly that reason. A captured oracle does
// not move, and both begin to bite.
//
// **A checker that walked the committed directory alone would agree with a
// corpus that had silently shrunk** — `tools/terminal-baseline.mjs`'s argument,
// and the reason `settle()` exists: every capture the suite asked for is
// compared against the set on disk by equality, both ways, so a block that
// stopped being rendered is a failure and not a quieter run.
//
// Recording: `INK_ORACLE_RECORD=1 npx vitest run <the suites>`. The recorder is
// the only thing that calls Ink; when Ink goes, the thunks go with it and the
// reads remain.
//
// **Recording adds and overwrites; it never clears.** The first draft cleared
// the directory before writing, so that a capture whose block had left the
// corpus could not sit there being compared against. That is the right worry
// and the wrong owner — `settle()` already catches a stale file, by equality
// both ways, which is what it exists for. What the clear bought was nothing,
// and what it cost appeared the moment a producer was deleted: a thunk that
// can no longer answer throws, and it throws *after* the directory has been
// emptied, so the recovery mode destroys the artefact before failing. A
// recorder whose producers outlive it one at a time must be able to run over
// a set it can only partly regenerate.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "golden", "ink-oracle");

/** Writing rather than checking. The recorder's only switch. */
export const RECORDING = process.env.INK_ORACLE_RECORD === "1";

/**
 * Rows to bytes, losslessly — **every row terminated, none separated.**
 *
 * `join("\n")` cannot tell `[]` from `[""]`, and both occur: an empty block
 * answers no rows and a block of one blank row answers one. Terminating each row
 * instead makes the empty list the empty file and the single blank row one
 * newline, and the reader's "drop the tail after the last terminator" inverts it
 * exactly.
 */
function encode(rows: readonly string[]): string {
  return rows.map((r) => `${r}\n`).join("");
}

function decode(bytes: string): readonly string[] {
  const parts = bytes.split("\n");
  return parts.slice(0, Math.max(0, parts.length - 1)); // cells-ok — rows, not columns
}

/** A capture's file name. **The width is in it**, or two widths collide. */
export function oracleName(key: string, capsName: string, width: number): string {
  const safe = key.replace(/[^A-Za-z0-9._-]/gu, "_");
  return `${safe}-${capsName}-${String(width)}w.txt`;
}

/**
 * One suite's captured Ink output.
 *
 * `rows(name, compute)` is the seam: recording, it calls `compute` — which is
 * Ink — and writes; checking, it reads the committed file and never calls Ink at
 * all. So the same loop records and checks, and the corpus has one definition
 * rather than one in the writer and one in the reader.
 */
export class InkOracle {
  readonly #dir: string;
  readonly #seen = new Set<string>();

  constructor(suite: string) {
    this.#dir = join(ROOT, suite);
    if (RECORDING) mkdirSync(this.#dir, { recursive: true });
  }

  rows(name: string, compute: () => readonly string[]): readonly string[] {
    this.#seen.add(name);
    const path = join(this.#dir, name);
    if (RECORDING) {
      const got = compute();
      writeFileSync(path, encode(got));
      return got;
    }
    if (!existsSync(path)) {
      throw new Error(`no captured Ink output for ${name} — run INK_ORACLE_RECORD=1 while Ink still exists`);
    }
    return decode(readFileSync(path, "utf8"));
  }

  /**
   * A capture whose **producer no longer exists** — read in both modes.
   *
   * `rows` takes a thunk because recording calls it; a capture whose producer
   * has been deleted has no thunk to call, and the first form of this made the
   * thunk throw. That is honest and useless: recording the suite then cannot
   * complete, so **one deleted producer freezes the whole set** and no later
   * capture can ever be added. The distinction the recorder actually needs is
   * not *this failed* but *this one is finished* — the bytes are committed, the
   * thing that made them is gone, and both are permanent. So this reads the
   * file whatever the mode, and counts as asked, which keeps `settle()`'s
   * equality true rather than making the frozen capture look stale.
   */
  frozen(name: string): readonly string[] {
    this.#seen.add(name);
    const path = join(this.#dir, name);
    if (!existsSync(path)) {
      throw new Error(`${name} is frozen — its producer is deleted and the capture is missing, so nothing can restore it`);
    }
    return decode(readFileSync(path, "utf8"));
  }

  /**
   * Every capture asked for, against every capture committed — **by equality,
   * both ways.**
   *
   * A subset check passes a corpus that shrank, which is the whole reason the
   * baseline generator holds its corpus in one place rather than walking a
   * directory.
   */
  settle(): Readonly<{ asked: readonly string[]; committed: readonly string[] }> {
    const committed = existsSync(this.#dir) ? readdirSync(this.#dir).filter((f) => f.endsWith(".txt")) : [];
    return { asked: [...this.#seen].sort(), committed: [...committed].sort() };
  }
}
