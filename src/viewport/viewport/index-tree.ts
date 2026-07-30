/**
 * The height index: a Fenwick tree over per-entry heights.
 *
 * C14 §4 — see spec.
 *
 * Deciding what is visible needs a prefix sum over entry heights. A linear walk
 * is O(n) per frame and dies at a hundred thousand entries, so append is
 * O(log n), a patch is O(log n) on the delta, and "which entry contains row R"
 * is O(log n).
 *
 * **The front offset is right for one eviction and wrong for a session**, which
 * is the second of C14's two rulings and the reason `rebuild` exists here rather
 * than only on a width change. C13's cap evicts continuously, so an offset that
 * never compacts grows this array with *total appends ever* while the live entry
 * count stays under the cap — and a terminal left open all day is the normal
 * case, not the extreme one. The array is rebuilt once the evicted prefix
 * exceeds the live count, which holds I9's post-condition
 * `length ≤ 2 × entries.length` and costs amortised O(1) per append: `frontOffset`
 * evictions must accumulate before one O(n) pass runs.
 */

/** Sums over a half-open range of slots, with the evicted prefix elided. */
export class HeightIndex {
  /** 1-based Fenwick array over `#heights`. */
  #tree: number[] = [0];
  /** Raw per-slot heights, parallel to the tree, including evicted slots. */
  #heights: number[] = [];
  /** Slots before this are evicted and contribute nothing. */
  #front = 0;

  /** Live slots — what `size` means to a caller, and I9's denominator. */
  get size(): number {
    return this.#heights.length - this.#front;
  }

  /** The array's real length, which is what I9 bounds. Asserted by T2.8. */
  get capacity(): number {
    return this.#heights.length;
  }

  get totalRows(): number {
    return this.#sumTo(this.#heights.length) - this.#sumTo(this.#front);
  }

  /**
   * Appends one slot, in amortised O(1).
   *
   * **A new node must be born holding the sum of the range it covers.** Slot `n`
   * covers `lsb(n)` slots ending at `n`, and every one of them was added before
   * this node existed — `#add` only ever walks *upward* through nodes that are
   * already there, so it cannot have reached this one. Creating it as 0 and
   * adding the new height leaves it short by everything underneath, and the
   * error is invisible until a prefix sum happens to cross that node: totals
   * come out right at some lengths and wrong at others, which reads as an
   * arithmetic mystery rather than a growth bug.
   *
   * Found by T3.6 — a zero-height entry made the missing term the *whole* value
   * rather than part of it, so the total was visibly short instead of subtly.
   */
  push(height: number): void {
    this.#heights.push(height);
    const n = this.#heights.length;
    this.#tree[n] = height;
    const lsb = n & -n;
    for (let step = 1; step < lsb; step <<= 1) {
      this.#tree[n] = (this.#tree[n] ?? 0) + (this.#tree[n - step] ?? 0);
    }
  }

  /** Replaces one live slot's height, by delta. `i` is a live index. */
  set(i: number, height: number): void {
    const slot = this.#front + i;
    const previous = this.#heights[slot] ?? 0;
    this.#heights[slot] = height;
    this.#add(slot + 1, height - previous);
  }

  at(i: number): number {
    return this.#heights[this.#front + i] ?? 0;
  }

  /**
   * Drops `n` slots from the front, rebuilding when the dead prefix outgrows the
   * living remainder. The comparison is against what survives, not a constant:
   * a tuned threshold would need revisiting whenever C13's cap or a typical
   * entry size changed, and this needs revisiting never.
   */
  evictFront(n: number): void {
    this.#front = Math.min(this.#front + n, this.#heights.length);
    if (this.#front > this.size) this.rebuild(this.#heights.slice(this.#front));
  }

  rebuild(heights: readonly number[]): void {
    this.#heights = [...heights];
    this.#front = 0;
    this.#tree = new Array<number>(this.#heights.length + 1).fill(0);
    // In-place construction: O(n) rather than n × O(log n).
    for (let i = 1; i <= this.#heights.length; i += 1) {
      this.#tree[i] = (this.#tree[i] ?? 0) + (this.#heights[i - 1] ?? 0);
      const parent = i + (i & -i);
      if (parent <= this.#heights.length) {
        this.#tree[parent] = (this.#tree[parent] ?? 0) + (this.#tree[i] ?? 0);
      }
    }
  }

  clear(): void {
    this.rebuild([]);
  }

  /** Rows before live entry `i` — the prefix sum the visibility query walks. */
  rowsBefore(i: number): number {
    return this.#sumTo(this.#front + i) - this.#sumTo(this.#front);
  }

  /**
   * The live index of the entry containing row `row`, and how far into it that
   * row falls. O(log n) by descending the tree rather than scanning.
   *
   * A zero-height entry (an empty `group`, T3.6) occupies no row, so a query
   * never lands *on* one: the descent walks past it to the next entry with rows,
   * which is what "skipped without consuming a row" has to mean arithmetically.
   */
  locate(row: number): Readonly<{ index: number; offset: number }> {
    const target = row + this.#sumTo(this.#front);
    let position = 0;
    let remaining = target;

    let step = 1;
    while (step * 2 <= this.#heights.length) step *= 2;
    for (; step > 0; step = Math.floor(step / 2)) {
      const next = position + step;
      if (next <= this.#heights.length && (this.#tree[next] ?? 0) <= remaining) {
        position = next;
        remaining -= this.#tree[next] ?? 0;
      }
    }

    // `position` is the count of slots fully before the target row.
    const index = Math.max(0, position - this.#front);
    return Object.freeze({ index, offset: remaining });
  }

  #add(at: number, delta: number): void {
    if (delta === 0) return;
    for (let i = at; i <= this.#heights.length; i += i & -i) {
      this.#tree[i] = (this.#tree[i] ?? 0) + delta;
    }
  }

  #sumTo(slot: number): number {
    let total = 0;
    for (let i = slot; i > 0; i -= i & -i) total += this.#tree[i] ?? 0;
    return total;
  }
}
