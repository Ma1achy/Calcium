/**
 * **RULING-a's performance arm, executable** (F1348, F1351, F1406, F1447).
 *
 * A performance row measures in a load-independent unit, or relative to a
 * paired, interleaved control in the same process. This is the second half: a
 * subject and a control timed alternately, round by round, so whatever the
 * machine is doing lands on both, and the verdict is read from the **median of
 * the per-round ratios** rather than from either duration.
 *
 * **Why each part is there, because each was measured missing.**
 *
 * - *Interleaved, not one arm then the other.* A burst of load between two
 *   blocks of timing lands on one operand only. `plot-performance`'s
 *   one-sample update read 2.91 against a bound of 2 that way, with nothing
 *   changed (F1406), and two consecutive arms are exactly that shape.
 * - *Alternating order.* The arm that runs second in a round inherits the
 *   first one's garbage and its warm caches; swapping each round puts both on
 *   each side equally.
 * - *The median of ratios, not the ratio of means.* A mean is a sum, and one
 *   descheduled batch is most of a sum. C28 T1.42 summed fifteen renders a side
 *   and read 53.5× against 40 under the shell lane's load; a median of fifteen
 *   per-round ratios is moved by a burst only if it lands on more than half the
 *   rounds.
 * - *A batch floor.* A single call to a cheap subject reads `0.00` on a coarse
 *   clock (F8), so each operand is repeated until one batch takes at least
 *   `floorMs`, and the count divides it. The count is fixed once after warm-up
 *   and held for every round, so a slow round is slow and not shorter.
 *
 * **The limit, stated because an unrecorded one reads as strength.** Pairing
 * cancels load that lands on both arms in proportion to their time. It does not
 * cancel a difference in *kind*: a subject that allocates heavily against a
 * control that does not pays for collections the control never meets, and a
 * contended memory bus charges the allocator more than the arithmetic. So the
 * control is chosen to share the subject's work where a shape is the claim — the
 * same function at a smaller size — and is the reference workload below only
 * where the claim is an absolute ceiling, which has no smaller self.
 */
export interface PairedReading {
  /** The median over rounds of the subject's per-call cost over the control's. */
  readonly ratio: number;
  /** Every round's ratio, in round order — what a failure message prints. */
  readonly ratios: readonly number[];
  /** The median per-call cost of each arm, in ms — reported, never asserted. */
  readonly subjectMs: number;
  readonly controlMs: number;
  readonly leastRatio: number;
}

export interface PairedOptions {
  /** Rounds, each timing both arms once. Odd, so the median is a reading. */
  readonly rounds?: number;
  /** The least a batch may take, in ms, before its count is fixed. */
  readonly floorMs?: number;
  /** Untimed calls of each arm first, so neither pays the other's compilation. */
  readonly warm?: number;
}

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** Calls `fn` until one batch takes `floorMs`, doubling — the count is the answer. */
function repsFor(fn: () => unknown, floorMs: number): number {
  for (let reps = 1; ; reps *= 2) {
    const t0 = performance.now();
    for (let i = 0; i < reps; i += 1) fn();
    if (performance.now() - t0 >= floorMs || reps >= 1 << 20) return reps;
  }
}

function perCall(fn: () => unknown, reps: number): number {
  const t0 = performance.now();
  for (let i = 0; i < reps; i += 1) fn();
  return (performance.now() - t0) / reps;
}

/** The subject against the control, interleaved; see the comment at the top. */
export function paired(
  subject: () => unknown,
  control: () => unknown,
  opts: PairedOptions = {},
): PairedReading {
  const rounds = opts.rounds ?? 15;
  const floorMs = opts.floorMs ?? 5;
  for (let i = 0; i < (opts.warm ?? 3); i += 1) {
    subject();
    control();
  }
  const sReps = repsFor(subject, floorMs);
  const cReps = repsFor(control, floorMs);

  const ratios: number[] = [];
  const s: number[] = [];
  const c: number[] = [];
  for (let r = 0; r < rounds; r += 1) {
    let sMs: number;
    let cMs: number;
    if (r % 2 === 0) {
      sMs = perCall(subject, sReps);
      cMs = perCall(control, cReps);
    } else {
      cMs = perCall(control, cReps);
      sMs = perCall(subject, sReps);
    }
    s.push(sMs);
    c.push(cMs);
    ratios.push(sMs / Math.max(cMs, Number.EPSILON));
  }
  return { ratio: median(ratios), ratios, subjectMs: median(s), controlMs: median(c), leastRatio: Math.min(...s) / Math.max(Math.min(...c), Number.EPSILON) };
}

/**
 * **The same, for a subject that is a whole process or a whole session** — a
 * spawn, a PTY round trip — where one call is the batch and the clock is read
 * around an `await`. The control is still synchronous and in this process: what
 * it measures is how much of the machine this process is being given, which is
 * the quantity a loaded host takes away from the subject too.
 */
export async function pairedAsync(
  subject: () => Promise<unknown>,
  control: () => unknown,
  opts: PairedOptions = {},
): Promise<PairedReading> {
  const rounds = opts.rounds ?? 5;
  const floorMs = opts.floorMs ?? 20;
  for (let i = 0; i < (opts.warm ?? 1); i += 1) {
    await subject();
    control();
  }
  const cReps = repsFor(control, floorMs);
  const ratios: number[] = [];
  const s: number[] = [];
  const c: number[] = [];
  for (let r = 0; r < rounds; r += 1) {
    const before = r % 2 === 0;
    const c0 = before ? perCall(control, cReps) : 0;
    const t0 = performance.now();
    await subject();
    const sMs = performance.now() - t0;
    const cMs = before ? c0 : perCall(control, cReps);
    s.push(sMs);
    c.push(cMs);
    ratios.push(sMs / Math.max(cMs, Number.EPSILON));
  }
  return { ratio: median(ratios), ratios, subjectMs: median(s), controlMs: median(c), leastRatio: Math.min(...s) / Math.max(Math.min(...c), Number.EPSILON) };
}

/**
 * **The reference workload: a unit of this machine, now.** For a row whose claim
 * is an absolute ceiling, which has no smaller self to be paired with. It does
 * what the rows it stands beside do — builds strings, allocates small objects,
 * walks them, serialises — in a fixed amount, so a ceiling written in
 * *references* moves with the host the way the subject does and a ceiling
 * written in milliseconds does not.
 *
 * Deterministic and self-contained: nothing from `src/`, so a change to the tree
 * cannot move the unit the tree is measured in. The returned number is consumed
 * so the work cannot be eliminated.
 */
export function reference(): number {
  const parts: string[] = [];
  for (let i = 0; i < 4000; i += 1) parts.push(`${String((i * 7919) % 1000)}:${String(i & 15)}`);
  const joined = parts.join(",");
  let h = 0;
  for (let i = 0; i < joined.length; i += 1) h = (h * 31 + joined.charCodeAt(i)) | 0;
  const rows = parts.map((p, i) => ({ id: i, p, n: p.length }));
  const round = JSON.parse(JSON.stringify(rows)) as { n: number }[];
  return h + round.reduce((a, r) => a + r.n, 0);
}

/** Prints a reading as the evidence line a failure carries. */
export const describeReading = (r: PairedReading): string =>
  `median ${r.ratio.toFixed(2)}× · least ${r.leastRatio.toPrecision(3)}× · subject ${r.subjectMs.toFixed(3)} ms · control ${r.controlMs.toFixed(3)} ms · ` +
  `rounds ${r.ratios.map((x) => x.toFixed(2)).join(" ")}`;
