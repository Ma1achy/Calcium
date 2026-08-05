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
import { createDashboardHandler } from "./dashboard.ts";
import { createContainerAdapter } from "./container.ts";
import { createCompareHandler, createDriftHandler } from "./drift.ts";

const run = promisify(execFile);

/**
 * The terminal's width, read by the app because nothing hands it to a local
 * handler (FINDINGS F14).
 *
 * `AdapterContext` carries `width` — C11 needs it and C07 gets it. `LocalContext`
 * carries `command` and nothing else, so the one route an app writes entirely
 * itself is the one that cannot know how wide the screen is. Reading
 * `process.stdout.columns` here is the app doing what C01 does for everything
 * else in the tree, which is exactly the duplication C01 I13 exists to prevent —
 * and it is wrong across a resize, because it is read once per command rather
 * than handed down.
 */
const width = (): number => process.stdout.columns || 80;

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

const engine = await engineVersion();

const tui = createTui({
  name: "docker-tui",
  // F1's shim rather than `docker` itself.
  binary: BINARY,
  manifest: buildManifest(engine),
  theme: defaultTheme,
  // **Required in practice, though the type says optional** (FINDINGS F8).
  // C22 I20 has the app supply the environment and no file under `src/` reads
  // `process.env` — but omitted it defaults to `{}`, so `TERM` is absent,
  // `altScreen` is false, and `acquire()` refuses to open the shell. The spec
  // says omitting it degrades to ASCII with no colour; it does not degrade.
  env: process.env,
  // Keyed by the verb, and a sub-verb's key is its whole name — the space is
  // part of it, not a separator this side of C18.
  adapters: { ps: createPsAdapter(), "container stats": createContainerAdapter() },
  localHandlers: {
    dashboard: createDashboardHandler(engine, width),
    drift: createDriftHandler(),
    compare: createCompareHandler(),
  },
  /**
   * S1's whole point: the dashboard is there before you type anything (C22 I44).
   *
   * The same handler, so there is one dashboard rather than a launch copy that
   * drifts from the command's. `/dashboard` stays registered because it is how
   * the frame is re-read without restarting, and it costs one line.
   *
   * **It keeps refreshing after the first command**, which is C23 I9 and not an
   * oversight — a frozen entry keeps receiving patches, because a `--watch`
   * scrolled out of view is still running. S1's drawing said it froze; the
   * drawing was wrong about Calcium's own rules (FINDINGS F17a).
   */
  greeting: () => createDashboardHandler(engine, width)([], { command: "" }),
});

await tui.start();
