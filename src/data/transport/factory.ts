/**
 * One factory, one mode value, and no environment.
 *
 * C06 §1 — see spec. Nothing else in the codebase branches on mode (commitment
 * 12): a consumer holds a `VerbTransport` and cannot tell which one it has, which
 * is the property I15 asserts and T2.1 tests three ways.
 *
 * `PRISM_TUI_TRANSPORT` does not appear here or anywhere under `src/` (I18). The
 * **app's** entry point reads it and passes a constructed router through
 * `TuiConfig.transport`; Calcium ships no binary, and a framework that claims
 * to serve other apps has no business reading a variable named for one of them.
 * It is also what keeps SS10 true — C02 is the only file under `src/` that
 * touches the environment, and it reads an injected record.
 */

import { createEmulatedTransport } from "./emulated.js";
import { createFixtureTransport } from "./fixture.js";
import { createSubprocessTransport } from "./subprocess.js";
import type { TransportDeps, VerbTransport } from "./types.js";

export function createTransport(deps: TransportDeps): VerbTransport {
  switch (deps.mode) {
    case "fixture":
      return createFixtureTransport(deps.corpus);
    case "emulated":
      return createEmulatedTransport(deps.handler);
    case "subprocess":
      return createSubprocessTransport({
        binary: deps.binary,
        runner: deps.runner,
        clock: deps.clock,
        ...(deps.env === undefined ? {} : { env: deps.env }),
        ...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
      });
  }
}
