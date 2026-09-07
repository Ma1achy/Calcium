/**
 * TB1–TB5 — **the arm unification pass's actual gate** (`CALCIUM_ARM_UNIFICATION.md` §6b, T1).
 *
 * §6b's constraint is that the terminal arm is a refactor and nothing else:
 * byte-identical at every capability rung, per commit. The golden suite is a
 * *subset* of what that needs — 377 rows over `ONE_PER_FORM` at two widths and
 * two capability sets — and `catalogue-hash.mjs` answers *did anything move*
 * without being able to say **what**, which is the one thing §6b requires,
 * because it says the frame is read before anything else happens.
 *
 * So the frames are tracked and compared by bytes. The digest is the proxy and
 * this is the thing itself.
 *
 * **TB5 is the row that makes the rest evidence.** A comparison against a corpus
 * built by the same code that wrote it agrees with itself whatever either does;
 * `test/support/README.md`'s rule is that a fixture must be shown to respond to
 * the thing under test before it is asserted against. TB5 corrupts a frame in a
 * temporary directory and requires the comparison to name it.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — a `.mjs` instrument with no declarations, like its siblings.
import { BASELINE_DIR, baselineFrames, expectedCount, writeBaseline } from "../../tools/terminal-baseline.mjs";

const built = baselineFrames as () => Map<string, string>;
const expected = expectedCount as () => number;
const write = writeBaseline as (dir: string) => { written: number; stale: number };
const dir = BASELINE_DIR as string;

/** The committed corpus, as `name → bytes`. */
function committed(from: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(from)) {
    if (f.endsWith(".txt")) out.set(f, readFileSync(join(from, f), "utf8"));
  }
  return out;
}

/**
 * Every name whose bytes differ, plus the two name sets' differences.
 *
 * **Sets compared by equality and not by containment**, because a subset check
 * passes for a corpus that has quietly shrunk — and *a form stopped being
 * rendered* is exactly the kind of change this gate exists to refuse.
 */
function diff(a: Map<string, string>, b: Map<string, string>): {
  moved: string[]; missing: string[]; extra: string[]; compared: number;
} {
  const moved: string[] = [];
  const missing: string[] = [];
  const extra: string[] = [];
  let compared = 0;
  for (const [name, bytes] of a) {
    const other = b.get(name);
    if (other === undefined) { missing.push(name); continue; }
    compared += 1;
    if (other !== bytes) moved.push(name);
  }
  for (const name of b.keys()) if (!a.has(name)) extra.push(name);
  return { moved: moved.sort(), missing: missing.sort(), extra: extra.sort(), compared };
}

describe("TB — the terminal baseline, byte for byte", () => {
  const fresh = built();
  const onDisk = committed(dir);
  const d = diff(fresh, onDisk);

  it("TB1 (§6b T1): the corpus is the size the corpus says it is", () => {
    // **Derived, not a literal.** A gate reporting full coverage of a corpus it
    // has stopped covering is F256's finding stated as a count, and the exit
    // status is the same bit for *complete* and for *did not run*.
    expect(fresh.size, "frames the generator produces").toBe(expected());
    expect(onDisk.size, "frames committed under test/golden/terminal-baseline/").toBe(expected());
  });

  it("TB2 (§6b T1): every committed frame has a generated twin, and the reverse", () => {
    expect(d.missing, "committed corpus is missing frames the generator produces").toEqual([]);
    expect(d.extra, "committed frames the generator no longer produces").toEqual([]);
  });

  it("TB3 (§6b): every frame is byte-identical, and the count compared is reported", () => {
    // **The counter is the assertion's other half.** Zero moved is evidence about
    // the frames that were compared and nothing else; a run that compared none
    // reports the same zero.
    expect(d.compared, "frames compared").toBe(expected());
    expect(
      d.moved.slice(0, 12),
      `${String(d.moved.length)} frames moved — READ THEM before anything else (§6b). -u is forbidden.`,
    ).toEqual([]);
  });

  it("TB4 (§6b): the rungs the pass will break on are actually constructed", () => {
    // §6b names the rungs where "the shared layer now says a diamond" quietly
    // becomes a different character. A corpus that never reaches a rung gates
    // nothing there — which is exactly how the shared-geometry gate passed
    // against a broken refactor (F256).
    const names = [...fresh.keys()];
    for (const rung of ["ascii", "1bit", "wide", "8bit", "24bit"]) {
      expect(
        names.filter((n) => n.includes(`-${rung}-`)).length,
        `frames at the ${rung} rung`,
      ).toBeGreaterThan(0); // cells-ok — a frame count
    }
    // **Both widths, which is what the catalogue does not cross.** The truncation
    // ladder and the `+N` notices are width decisions, so a single width per
    // capability set cannot construct them.
    for (const w of ["-40w.txt", "-80w.txt", "-60w.txt"]) {
      expect(names.filter((n) => n.endsWith(w)).length, `frames at ${w}`).toBeGreaterThan(0); // cells-ok — a frame count
    }
  });

  it("TB5: the comparison names a frame that moved — the gate responds to its subject", () => {
    const tmp = mkdtempSync(join(tmpdir(), "calcium-baseline-"));
    try {
      // **`writeBaseline` and not a copy of `fresh`**: the row is about the
      // comparison, but writing through the real tool is what says the corpus on
      // disk came from the same place the checker builds from. `fresh` is reused
      // for the three reads — re-rendering 1780 frames per assertion cost four
      // renders where one is the evidence.
      const { written } = write(tmp);
      expect(written, "frames written to the temporary corpus").toBe(expected());
      const before = diff(fresh, committed(tmp));
      expect(before.moved, "a freshly written corpus must agree with the generator").toEqual([]);

      // Corrupt exactly one frame, and require the comparison to name that one.
      const victim = [...before.moved, ...committed(tmp).keys()].sort()[0]!;
      writeFileSync(join(tmp, victim), "a byte that was not there\n");
      const after = diff(fresh, committed(tmp));
      expect(after.moved, "the corrupted frame, and only it").toEqual([victim]);
      expect(after.compared, "and everything was still compared").toBe(expected());

      // A frame *removed* is a different failure from a frame *changed*, and the
      // set comparison is what tells them apart.
      rmSync(join(tmp, victim));
      const gone = diff(fresh, committed(tmp));
      expect(gone.missing, "a deleted frame reads as missing, not as unchanged").toEqual([victim]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
