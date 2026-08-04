/**
 * docker-tui — the whole application.
 *
 * R01 §3's four omissions are kept: no custom theme, no custom block kind, no
 * custom command policy, no emulator. Each is an assertion that a Calcium
 * default is genuinely usable rather than a placeholder, so anything added here
 * is a finding about the default rather than a convenience.
 *
 * `transport` is not supplied either: C22 builds the subprocess transport from
 * `binary`, which is the path R01 §9 claims works.
 */

import { createTui, defaultTheme } from "@fmx/calcium";
import { BINARY, MANIFEST_PATH } from "./manifest.ts";
import { createPsAdapter } from "./ps.ts";

const tui = createTui({
  name: "docker-tui",
  // F1's shim rather than `docker` itself.
  binary: BINARY,
  // A path rather than the typed `Manifest`. F7 — the typed arm throws.
  manifest: MANIFEST_PATH,
  theme: defaultTheme,
  adapters: { ps: createPsAdapter() },
});

await tui.start();
