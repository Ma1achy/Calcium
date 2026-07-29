/**
 * Per-verb selection, and the backstop concurrency guard.
 *
 * C06 §6 — see spec.
 *
 * **Selection is per verb** (A01 D13, I14), which is what allows one verb to
 * migrate from subprocess to native without touching anything else. `for()` is
 * total: an unmapped verb gets the default, so adding a verb never requires
 * adding a route.
 *
 * **The guard here is a backstop, not the authority.** C23 owns the submission
 * guard and it covers every foreground route — `app`, `shell`, `local` and
 * `builtinThenShell` — because a `sleep 30` delegated to the shell is a
 * foreground command too (C23 §, I5). This one covers direct transport misuse,
 * which C23 cannot see. Two guards with *different scopes* is the ordinary
 * arrangement; two guards with the same scope would be a defect. Said here and
 * in C23 so that neither is tidied away by someone who finds the second one.
 *
 * Streams are exempt (I13, C23 I6). A `--watch` is a subscription rather than a
 * command, and holding the guard for one blocks the prompt for as long as the
 * user watches.
 */

import type { Invocation, RawPatch, TransportRouter, VerbTransport } from "./types.js";

/** Named so L4 can render the refusal rather than parse a message (C06 §6). */
export class TransportBusyError extends Error {
  readonly running: string;
  readonly attempted: string;

  constructor(running: string, attempted: string) {
    super(
      `\`${attempted}\` cannot start while \`${running}\` is running. ` +
        `One invocation at a time; the refusal is not a queue.`,
    );
    this.name = "TransportBusyError";
    this.running = running;
    this.attempted = attempted;
  }
}

export function createRouter(opts: {
  default: VerbTransport;
  overrides?: Readonly<Record<string, VerbTransport>>;
}): TransportRouter {
  const overrides = opts.overrides ?? {};
  let inFlight: string | null = null;

  const wrap = (transport: VerbTransport): VerbTransport => ({
    async invoke(inv: Invocation) {
      if (inFlight !== null) throw new TransportBusyError(inFlight, inv.verb);
      inFlight = inv.verb;
      try {
        return await transport.invoke(inv);
      } finally {
        // Every settlement path releases it — success, non-zero exit, throw,
        // cancel, timeout and spawn failure alike (I13). Releasing only on
        // success is the revert T6.7 names, and it fails on five of six.
        inFlight = null;
      }
    },
    stream(inv: Invocation): AsyncIterable<RawPatch> {
      return transport.stream(inv);
    },
  });

  return {
    for(verb) {
      return wrap(overrides[verb] ?? opts.default);
    },
    get busy() {
      return inFlight !== null;
    },
    get inFlight() {
      return inFlight;
    },
  };
}
