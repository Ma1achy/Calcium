/**
 * A bounded ring, and a count of what the bound discarded.
 *
 * **The two are separate numbers on purpose** (C28 I9). A conservation total —
 * *seen* — is satisfied by redistribution: held and dropped can both be wrong
 * in opposite directions and the total still reads correct. So the ring reports
 * what it holds and what it threw away, and nothing derives one from the other.
 */
export class Ring<T> {
  readonly #items: (T | undefined)[];
  #next = 0;
  #held = 0;
  #dropped = 0;

  constructor(readonly capacity: number) {
    this.#items = new Array<T | undefined>(Math.max(1, capacity));
  }

  push(item: T): void {
    if (this.#held === this.#items.length) this.#dropped += 1;
    this.#items[this.#next] = item;
    this.#next = (this.#next + 1) % this.#items.length;
    if (this.#held < this.#items.length) this.#held += 1;
  }

  get size(): number {
    return this.#held;
  }

  get dropped(): number {
    return this.#dropped;
  }

  /** Oldest first. */
  toArray(): readonly T[] {
    const out: T[] = [];
    const n = this.#items.length;
    const start = this.#held === n ? this.#next : 0;
    for (let k = 0; k < this.#held; k++) {
      const v = this.#items[(start + k) % n];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  clear(): void {
    this.#items.fill(undefined);
    this.#next = 0;
    this.#held = 0;
    this.#dropped = 0;
  }
}
