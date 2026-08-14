/**
 * A `ProducerContext` a consumer can build (C24 §7).
 *
 * **The gap the grant opened, and it is C24 I19's argument arriving a second
 * time.** `ProducerContext.measure` is the frame's own measurer, which is the
 * whole point of granting it — one arithmetic, or a split decided in a producer
 * and the rows drawn on screen disagree. But `BlockRegistry` stays interior
 * (C24 §3), so a consumer whose adapter or handler *takes* a context had no way
 * to call it outside a session: the producer the framework can test and a
 * consumer cannot is exactly what `createAdapterRegistry`, `completeLocal` and
 * `contextAt` were published to stop.
 *
 * Found by deleting the reference app's `codeRows`, which reimplemented the
 * measurer (F37). With the reimplementation gone the app's own suite had nothing
 * to measure with — the workaround was also the fixture.
 *
 * **`measure` is real, and that is not a convenience.** A fixture supplying an
 * arithmetic of its own would let every row pass against a producer that divides
 * content wrongly, which is the fake supplying the behaviour under test.
 *
 * **`capabilities` defaults to the full record** rather than the degraded one: a
 * producer told `ascii` behaves differently, and a default that quietly degrades
 * would make the ASCII rows agree with everything.
 *
 * **`height` defaults to `null`**, which is the transcript-entry answer and the
 * one most callers want (C07 I18). A view's producer passes the region's.
 */
import { fullRegistry } from "./expect-document.js";
import type { ProducerContext } from "../data/adapters/types.js";
import type { LocalContext } from "../shell/local/registry.js";
import type { TerminalCapabilities } from "../terminal/capabilities.js";

/** Truecolour, full unicode — everything available. */
export const FULL_CAPABILITIES: TerminalCapabilities = Object.freeze({
  colourDepth: 24,
  unicode: "full",
  synchronisedUpdate: true,
  bracketedPaste: true,
  mouse: true,
  imageProtocol: "none",
  altScreen: true,
});

let registry: ReturnType<typeof fullRegistry> | null = null;

export function producerContext(over: Partial<ProducerContext> = {}): ProducerContext {
  registry ??= fullRegistry();
  const r = registry;
  return Object.freeze({
    width: 80,
    height: null,
    capabilities: FULL_CAPABILITIES,
    measure: (block, width) => r.measure(block, width),
    ...over,
  });
}

/**
 * A `LocalContext` a consumer can build — the producer context plus `ask`.
 *
 * **`ask` defaults to declining**, which is the real host's behaviour rather
 * than a stub's: C23 I36 says a question resolves with the choice marked
 * `default` on `Esc` and `⌃c`, and never with null. So a handler tested without
 * scripting an answer takes the path a user takes by pressing escape, and a test
 * that means to exercise the other arm has to say which choice — which is the
 * one it should be saying out loud.
 *
 * A handler with no `default` in its choices gets the first, because `ask`
 * resolving with nothing is the second representation of *nothing happened* that
 * C23 I36 exists to refuse.
 */
export function localContext(over: Partial<LocalContext> = {}): LocalContext {
  return Object.freeze({
    ...producerContext(over),
    command: "/probe",
    ask: (opts) => Promise.resolve((opts.choices.find((c) => c.default) ?? opts.choices[0])?.key ?? ""),
    // **Empty by default, which is the failed-validation arm** (C22 I66). A
    // handler tested without saying what was parsed takes the path a malformed
    // invocation takes, and a test meaning to exercise the other arm says so.
    args: {},
    ...over,
  });
}
