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
import { createInspectAdapter } from "./inspect.ts";
import { createLogsAdapter } from "./logs.ts";
import { createCompareHandler, createDriftHandler } from "./drift.ts";
import { createConfigHandler } from "./config.ts";
import {
  createDiffAdapter,
  createImagesAdapter,
  createPortAdapter,
  createTopAdapter,
} from "./verbs.ts";
import { argv as eventsArgv, createEventsHandler } from "./events.ts";

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
 * Whether the terminal can draw anything outside ASCII.
 *
 * **It was called `blockElements` and the name was already too narrow.** It was
 * written for the banner's `▄ ▀ █`; the second consumer is S3's `█`/`░` bar and
 * the third is a `·` in a caption, which is not a block element at all. The
 * predicate never was about block elements — it is C02's `unicode` axis, which
 * the app has to compute for itself because no consumer is handed the record
 * (F43).
 *
 * **Decided by the app, and that is a finding rather than a design** (F43).
 * `detectCapabilities` is not exported and a local handler is handed no
 * capabilities at all, so the one route an app writes entirely itself cannot
 * ask the framework what the terminal supports — the third instance of a fact
 * the consumer needs and is not offered (F14, F36).
 *
 * It matters because **capability substitution covers glyphs the framework
 * picks, not text an adapter supplies** — step 1's em-dash finding, eight rows
 * high. `▄▀█` in a `raw` block pass through untouched and draw as garbage on a
 * terminal that cannot show them, so choosing is unavoidably the app's job and
 * carrying an ASCII variant is the correct app-side answer.
 *
 * The test is deliberately crude: a UTF-8 locale and a terminal that is not
 * `dumb`. Getting it wrong costs a wordmark, not correctness.
 */
const unicodeText = (): boolean => {
  const term = process.env["TERM"] ?? "";
  const locale = `${process.env["LC_ALL"] ?? ""}${process.env["LANG"] ?? ""}`;
  return term !== "" && term !== "dumb" && /utf-?8/iu.test(locale);
};

/**
 * S12's depth, resolved by the app because that is where an environment variable
 * named for one application belongs (C22 I20's rule, and `PRISM_TUI_STATE_DIR`'s
 * precedent).
 *
 * **Four of the five depths need nothing here** — `COLORTERM=truecolor` gives
 * 24, `xterm-256color` gives 8, `xterm` gives 4, and `LANG=C` gives ASCII, all
 * through C02's own rules. **1-bit needs this**, because the only rule producing
 * `colourDepth: 1` is the `dumb` gate and that gate also clears `altScreen`,
 * which C02 I7 makes the one refusal that stops the shell. Before C22 I49 there
 * was no way for any application to say it (FINDINGS F52).
 *
 * Nothing else is overridden: `altScreen` stays detected, so this asks for a
 * one-bit *palette* on a terminal that can still open, which is what the
 * showcase is about.
 */
const depthOverride = (): { colourDepth: 1 | 4 | 8 | 24 } | undefined => {
  const raw = Number(process.env["DOCKER_TUI_DEPTH"] ?? "");
  return raw === 1 || raw === 4 || raw === 8 || raw === 24 ? { colourDepth: raw } : undefined;
};

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
  // Undefined unless S12 asked, so an ordinary run detects exactly as before.
  //
  // **That this line compiles is itself a finding.** Calcium builds with
  // `exactOptionalPropertyTypes`, under which an optional property and a
  // property that may be undefined are different types — so `capabilities?:
  // Partial<TerminalCapabilities>` could not be supplied conditionally by any
  // consumer at all: neither an assignment nor a spread type-checks, only a
  // cast. Every internal caller passes a literal, which is why no producer
  // could have met it. FINDINGS F53.
  capabilities: depthOverride(),
  // Keyed by the verb, and a sub-verb's key is its whole name — the space is
  // part of it, not a separator this side of C18.
  adapters: {
    ps: createPsAdapter(),
    // The same flag the banner uses, for the same reason and a second time —
    // which is what makes F43 a finding rather than a one-off inconvenience.
    "container stats": createContainerAdapter(unicodeText),
    inspect: createInspectAdapter(),
    logs: createLogsAdapter(),
    diff: createDiffAdapter(),
    images: createImagesAdapter(),
    top: createTopAdapter(),
    port: createPortAdapter(),
  },
  localHandlers: {
    dashboard: createDashboardHandler(engine, width, unicodeText),
    drift: createDriftHandler(),
    compare: createCompareHandler(),
    config: createConfigHandler(),
    // The window, fetched against `docker` directly rather than through the
    // shim: this is a local handler, so nothing appends `--json` and there is
    // nothing to translate.
    events: createEventsHandler(async () => (await run("docker", [...eventsArgv()], { maxBuffer: 8 << 20 })).stdout),
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
  greeting: () => createDashboardHandler(engine, width, unicodeText)([], { command: "" }),
});

await tui.start();
