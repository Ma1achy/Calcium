/**
 * The loader. C05 §4 — see spec.
 *
 * Three states: unloaded → loaded → sealed. The manifest data itself has no
 * state machine; this does, because a manifest replaced mid-session would leave
 * completion offering flags the parser rejects — a class of bug that is very
 * hard to see from the inside and trivially prevented from the outside.
 *
 * Reloading while `loaded` is permitted because wiring (A01 §5 step 2) replaces
 * the shipped fixture with one fetched from the far side. That happens before
 * sealing, and sealing is C22's obligation at the end of composition, before
 * input is accepted.
 *
 * These throw rather than returning a result, on C04's distinction: a caller
 * that loads after sealing has a composition-order bug, not a runtime condition
 * to handle. The person who can fix it is the person who wrote the call.
 */

import type { Manifest, ManifestStore } from "./types.js";

class Store implements ManifestStore {
  #manifest: Manifest | null = null;
  #sealed = false;

  get manifest(): Manifest | null {
    return this.#manifest;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  load(m: Manifest): void {
    if (this.#sealed) {
      throw new Error(
        "manifest store is sealed: loading a second manifest after input is accepted would let " +
          "completion and the parser disagree about the same command (C05 I11)",
      );
    }
    this.#manifest = m;
  }

  seal(): void {
    if (this.#manifest === null) {
      throw new Error(
        "manifest store cannot be sealed before a manifest is loaded: a sealed empty store offers " +
          "no verbs and can never be given any (C05 §4)",
      );
    }
    this.#sealed = true;
  }
}

export function createManifestStore(): ManifestStore {
  return new Store();
}
