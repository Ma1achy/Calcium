/**
 * Where a fixture came from, and how much of the corpus is hand-written.
 *
 * C08 §2, I1 — see spec. This is the component's central invariant, and the
 * reason the component exists: a hand-authored fixture is written against a
 * schema, so it agrees with that schema by construction and keeps agreeing after
 * the far side has diverged. The adapter passes green against a fiction.
 *
 * The defence is not a rule against authoring — some states genuinely cannot be
 * recorded, and T3.12 is one. It is that authoring is **marked, justified and
 * counted**, so the drift risk is visible where it concentrates.
 *
 * The `Fixture` type is C06's (A02 §1 — it belongs to the layer that consumes it
 * structurally). Every *rule* about it is here, and nothing in `fixture.ts`
 * duplicates one: a check in two places is a check that will disagree with
 * itself.
 */

import type { Fixture } from "../transport/types.js";

export type ProvenanceProblem = Readonly<{
  fixtureId: string;
  message: string;
}>;

/**
 * Structural checks, returned as data rather than thrown.
 *
 * The same shape `measurement-conformance` takes and for the same reason: the
 * caller asserts, so one implementation serves a build-time gate, a test and a
 * consuming app's own suite without any of them knowing about a test runner.
 */
export function checkProvenance(corpus: readonly Fixture[]): readonly ProvenanceProblem[] {
  const problems: ProvenanceProblem[] = [];
  const seen = new Set<string>();

  for (const fixture of corpus) {
    if (seen.has(fixture.id)) {
      problems.push({
        fixtureId: fixture.id,
        message: `duplicate id — two fixtures cannot answer to one name`,
      });
    }
    seen.add(fixture.id);

    // The friction is intentional (§2). Authoring should feel slightly worse
    // than recording, and a required sentence explaining why recording was
    // impossible is the cheapest friction that also leaves a reader something
    // useful two years later.
    if (fixture.provenance === "authored") {
      if (fixture.note === undefined || fixture.note.trim() === "") {
        problems.push({
          fixtureId: fixture.id,
          message:
            `authored without a note — say why recording was impossible. ` +
            `An authored fixture agrees with the schema it was written against ` +
            `by construction, so the note is the only thing that distinguishes ` +
            `"the real system cannot produce this" from "recording was ` +
            `inconvenient" (C08 I1)`,
        });
      }
      if (fixture.capturedAt !== null) {
        problems.push({
          fixtureId: fixture.id,
          message: `authored but carries a capturedAt — nothing captured it`,
        });
      }
    } else if (fixture.capturedAt === null) {
      problems.push({
        fixtureId: fixture.id,
        message: `${fixture.provenance} without a capturedAt — a recording knows when it was taken`,
      });
    }
  }

  return problems;
}

export type VerbRatio = Readonly<{
  verb: string;
  recorded: number;
  derived: number;
  authored: number;
  total: number;
  /** `authored / total`. */
  ratio: number;
  /** Majority-authored. Not a failure — visible (§2). */
  flagged: boolean;
}>;

/**
 * The authored ratio, per verb, sorted worst first.
 *
 * **Where this is read matters as much as that it is computed.** `record --diff`
 * prints it in its header (I15), because that is the command someone runs when
 * they care about corpus health. A ratio nothing displays is a field, not a
 * report, and the whole point is that a corpus drifting toward hand-written is
 * visible before it is a problem.
 */
export function authoredRatio(corpus: readonly Fixture[]): readonly VerbRatio[] {
  const byVerb = new Map<string, { recorded: number; derived: number; authored: number }>();

  for (const fixture of corpus) {
    const counts = byVerb.get(fixture.verb) ?? { recorded: 0, derived: 0, authored: 0 };
    counts[fixture.provenance] += 1;
    byVerb.set(fixture.verb, counts);
  }

  const rows = [...byVerb.entries()].map(([verb, counts]): VerbRatio => {
    const total = counts.recorded + counts.derived + counts.authored;
    const ratio = total === 0 ? 0 : counts.authored / total;
    return { verb, ...counts, total, ratio, flagged: ratio > 0.5 };
  });

  // Worst first, then alphabetical. A report whose order depends on corpus
  // iteration order is a report that produces a different diff every run.
  return rows.sort((a, b) => b.ratio - a.ratio || a.verb.localeCompare(b.verb));
}

/** One line per flagged verb, plus the total. Empty when nothing is flagged. */
export function formatRatio(rows: readonly VerbRatio[]): readonly string[] {
  const total = rows.reduce((n, r) => n + r.total, 0);
  const authored = rows.reduce((n, r) => n + r.authored, 0);
  if (total === 0) return ["0 fixtures"];

  const pct = Math.round((authored / total) * 100);
  const head = `${String(total)} fixtures · ${String(authored)} authored (${String(pct)}%)`;
  const flagged = rows
    .filter((r) => r.flagged)
    .map(
      (r) =>
        `  ⚠ ${r.verb} is majority-authored — ${String(r.authored)}/${String(r.total)}`,
    );

  return [head, ...flagged];
}
