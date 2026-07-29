// The boundary conformance suite (A01 §6). The wiring gate, and C08's T2.2.
//
// DESTINATION: `src/testing/`. A04 §5 gives `make conformance` to the apps, and
// R01 §8 has the reference app running it in CI — so a consumer runs this, which
// makes it public surface eventually. It lives in `test/support/` until C24
// exists to export it, for the same reason `measurement-conformance.ts` does: an
// export nothing consumes is what CLAUDE.md forbids, and today nothing does.
//
// Written the same way and for the same reasons: **no test runner** — it returns
// failures as data and the caller asserts — and **parameterised**, over a
// transport in one direction and over stored results in the other.
//
// WHY THIS IS THE IMPORTANT ONE. C08 §1 names the trap the whole component
// exists to avoid: a hand-authored fixture is written against a schema, agrees
// with that schema by construction, and keeps agreeing after the far side has
// diverged. Holding fixtures to a *schema* cannot catch that, because the schema
// is what they were written from. Holding them to the **contract** — the same
// B1–B8 the real CLI is held to, asserted by the same code — can. C08 T6.3 calls
// this "the test that stops the fiction problem", and it is only true if the two
// sides genuinely run one implementation.
//
// A01 §6 lists seven assertions. Four are properties of a result and are checked
// here against anything, recorded or live. Three need a live far side — a signal
// to deliver, a process to time — and are reported as SKIPPED rather than passed.
// **A skip is recorded, not silent** (R01 §8, C08 T5.4): a suite that quietly
// counts an unrunnable assertion as green is the vacuity failure A03 §2 names.
import type { Manifest } from "../../src/data/manifest/index.js";
import type { Fixture, RawPatch, RawResult } from "../../src/data/transport/index.js";

/** A01 B4. Cancellation is 130 and renders as `partial`, never `error`. */
export const EXIT_CODES: readonly number[] = [0, 1, 2, 130];

export type Assertion = "B2" | "B3" | "B4" | "B5" | "B6" | "B8" | "manifest-shape";

export type Finding = Readonly<{
  subject: string;
  assertion: Assertion;
  message: string;
  /** What a failure means, in A01 §6's terms. */
  means: string;
}>;

export type ConformanceReport = Readonly<{
  checked: number;
  findings: readonly Finding[];
  /** Assertions this run could not make, and why. Never counted as passes. */
  skipped: readonly Readonly<{ assertion: Assertion; why: string }>[];
}>;

const MEANS: Readonly<Record<Assertion, string>> = Object.freeze({
  B2: "B2 violated — stdout is not one JSON document, or not NDJSON patches",
  B3: "B3 violated — stderr carries payload; it is diagnostics only",
  B4: "B4 violated — exit code outside {0, 1, 2, 130}",
  B5: "B5 violated — a failure without ErrorLike",
  B6: "B6 violated — the manifest endpoint does not respond",
  B8: "B8 violated — SIGINT not honoured within 2 s",
  "manifest-shape": "the manifest is stale — the envelope is not the declared shape",
});

function finding(subject: string, assertion: Assertion, message: string): Finding {
  return { subject, assertion, message, means: MEANS[assertion] };
}

/**
 * stderr carrying payload.
 *
 * Non-empty is not a violation — B3 says stderr is *diagnostics*, and a far side
 * that warns on stderr is well-behaved. What violates it is stderr holding the
 * answer: a JSON document. Checking for non-empty instead would fail every
 * correct CLI that ever printed a deprecation notice, and a rule that fires on
 * correct behaviour is one someone turns off.
 */
function stderrCarriesPayload(stderr: string): boolean {
  const trimmed = stderr.trim();
  if (trimmed === "" || !(trimmed.startsWith("{") || trimmed.startsWith("["))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function hasErrorLike(stdout: unknown): boolean {
  if (stdout === null || typeof stdout !== "object") return false;
  const error = (stdout as { error?: unknown }).error;
  if (error === null || typeof error !== "object") return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() !== "";
}

/**
 * The four assertions a stored or live result can answer.
 *
 * `streaming` changes what B2 means: one JSON document for a non-streaming verb,
 * NDJSON patches for a streaming one, and conflating them would report every
 * live view as a violation.
 */
export function checkResult(
  subject: string,
  result: RawResult,
  opts: Readonly<{ streaming?: boolean; manifest?: Manifest }> = {},
): readonly Finding[] {
  const findings: Finding[] = [];

  // B4 — the exit code set. `null` is a signal death, which the ladder produces
  // and which is not the far side failing to honour a code.
  if (result.exitCode !== null && !EXIT_CODES.includes(result.exitCode)) {
    findings.push(finding(subject, "B4", `exit code ${String(result.exitCode)}`));
  }

  // B2 — one JSON document on stdout. A `parseError` alongside output is the
  // violation; empty output on a signal death is not, because nothing was
  // promised for a run that did not finish.
  if (result.parseError !== null) {
    findings.push(finding(subject, "B2", `stdout did not parse: ${result.parseError}`));
  } else if (
    opts.streaming !== true &&
    result.stdout === undefined &&
    result.stdoutRaw.trim() !== ""
  ) {
    findings.push(finding(subject, "B2", "stdout has content and no parsed document"));
  }

  // B3 — stderr is diagnostics only.
  if (stderrCarriesPayload(result.stderr)) {
    findings.push(finding(subject, "B3", "stderr holds a JSON document"));
  }

  // B5 — a failure carries ErrorLike. Exit 1 is "operation failed"; 130 is
  // cancellation, which C07 §4 renders as `partial` and which owes no error.
  if (result.exitCode === 1 && !hasErrorLike(result.stdout)) {
    findings.push(finding(subject, "B5", "exit 1 with no `error.message` in the envelope"));
  }

  if (opts.manifest !== undefined && result.exitCode === 0 && result.stdout !== undefined) {
    findings.push(...checkEnvelope(subject, result.stdout, opts.manifest));
  }

  return findings;
}

/**
 * The declared shape.
 *
 * Deliberately shallow: that the verb is one the manifest knows and that a
 * success carries a `data` key. A deep schema check belongs to the manifest's
 * own validator, and duplicating it here would put one rule in two places — the
 * thing C08's provenance module already refuses to do.
 */
function checkEnvelope(subject: string, stdout: unknown, manifest: Manifest): readonly Finding[] {
  const verb = subject.split(" ")[0] ?? subject;
  const known = manifest.tools.some((t) => t.name === verb);
  if (!known) {
    return [finding(subject, "manifest-shape", `\`${verb}\` is not in the manifest`)];
  }
  if (stdout === null || typeof stdout !== "object") {
    return [finding(subject, "manifest-shape", "a successful envelope is not an object")];
  }
  return [];
}

function endOf(patches: readonly RawPatch[]): RawResult | null {
  const end = patches.find((p) => p.kind === "end");
  return end?.kind === "end" ? end.result : null;
}

/**
 * The corpus mode. Every fixture, recorded and authored alike, held to B1–B8.
 *
 * "Recorded and authored alike" is the point. A recording satisfies the contract
 * because the far side did; an authored fixture satisfies it only if someone got
 * it right, and this is the only thing that ever checks.
 */
export function checkCorpus(
  corpus: readonly Fixture[],
  manifest?: Manifest,
): ConformanceReport {
  const findings: Finding[] = [];

  for (const fixture of corpus) {
    const subject = `${fixture.verb} (${fixture.id})`;
    if (!Array.isArray(fixture.result)) {
      findings.push(
        ...checkResult(subject, fixture.result as RawResult, {
          ...(manifest === undefined ? {} : { manifest }),
        }),
      );
      continue;
    }

    const patches = fixture.result as readonly RawPatch[];
    const end = endOf(patches);
    if (end === null) {
      // C06 I9: a stream always ends with exactly one `end`. A stored patch
      // sequence without one is a fixture `invoke` cannot answer from.
      findings.push(finding(subject, "B2", "patch sequence with no terminal `end`"));
      continue;
    }
    findings.push(...checkResult(subject, end, { streaming: true }));
  }

  return {
    checked: corpus.length,
    findings,
    skipped: [
      { assertion: "B8", why: "no process to signal — a corpus has no far side to interrupt" },
      { assertion: "B6", why: "the manifest endpoint is the harness's, not a recorded verb" },
    ],
  };
}

/** One line per finding, grouped by subject. Empty when the report is clean. */
export function formatReport(report: ConformanceReport): readonly string[] {
  const lines: string[] = [];
  for (const f of report.findings) {
    lines.push(`${f.subject} · ${f.assertion}: ${f.message}`);
    lines.push(`    ${f.means}`);
  }
  return lines;
}
