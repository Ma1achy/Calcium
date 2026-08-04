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

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTui, defaultTheme } from "@fmx/calcium";
import { BINARY, buildManifest } from "./manifest.ts";
import { createPsAdapter } from "./ps.ts";

const run = promisify(execFile);

/**
 * The daemon's version, for the manifest's skew field.
 *
 * Being unable to reach docker is not fatal here: the shell should open and say
 * so on the first command rather than refuse to start, which is R3.6's shape —
 * an error naming the binary, not a dead terminal. `unknown` rather than `""`
 * because C05 refuses an empty version, and rightly: absent and unknown are
 * different, and only one of them is a thing to report.
 */
async function engineVersion(): Promise<string> {
  try {
    const { stdout } = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

const tui = createTui({
  name: "docker-tui",
  // F1's shim rather than `docker` itself.
  binary: BINARY,
  manifest: buildManifest(await engineVersion()),
  theme: defaultTheme,
  // **Required in practice, though the type says optional** (FINDINGS F8).
  // C22 I20 has the app supply the environment and no file under `src/` reads
  // `process.env` — but omitted it defaults to `{}`, so `TERM` is absent,
  // `altScreen` is false, and `acquire()` refuses to open the shell. The spec
  // says omitting it degrades to ASCII with no colour; it does not degrade.
  env: process.env,
  adapters: { ps: createPsAdapter() },
});

await tui.start();
