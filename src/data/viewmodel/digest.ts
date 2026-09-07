/**
 * An image's identity, derived once (C04 I73 §3g.2).
 *
 * **FNV-1a, internal, and not `node:crypto`.** The ledger's *sixty lines
 * internal* side: a non-cryptographic hash is a lookup, and reaching for a
 * builtin here would be reaching for collision resistance nothing asks for.
 *
 * **What it is for is invalidation, not integrity.** A changed image must miss
 * the cache and an unchanged one must hit; the protocol arm derives its id from
 * this, and C09 I36 records the one place where the width of that space matters.
 */
const OFFSET = 0x811c_9dc5;
const PRIME = 0x0100_0193;

export function digestOf(data: string): string {
  let h = OFFSET;
  for (let i = 0; i < data.length; i += 1) { // cells-ok — a character index
    h ^= data.charCodeAt(i);
    h = Math.imul(h, PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
