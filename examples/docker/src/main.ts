/**
 * docker-tui — the entry point.
 *
 * R01 §3's four omissions are kept: no custom theme, no custom block kind, no
 * custom command policy, no emulator. Each is an assertion that a Calcium
 * default is genuinely usable rather than a placeholder, so anything added here
 * is a finding about the default rather than a convenience.
 *
 * `transport` is not supplied either: C22 builds the subprocess transport from
 * `binary`, which is the path R01 §9 claims works. The one exception is the
 * demo world at the bottom, which exists so recordings never show this machine.
 *
 * **The configuration itself is `app.ts`** (2026-09-29), so the recorder builds
 * the same application this file starts.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createTui } from "calcium-tui";
import { appConfig, realDocker } from "./app.ts";

const run = promisify(execFile);

/**
 * **`width()` was here and is gone** (F14, F1008).
 *
 * It read `process.stdout.columns` because `LocalContext` was
 * `Readonly<{ command: string }>` and a local handler could not find out how
 * wide the screen was. `LocalContext` is `ProducerContext & …` now, and
 * `ProducerContext.width` is the frame's own — read from C01 at every
 * invocation, so it is right across a resize where this was not.
 *
 * The call sites went in `c4b2869d` on 2026-08-07; **the declaration stayed
 * thirty-four days with no caller**, because the example tree's own
 * `tsconfig.json` did not set `noUnusedLocals` where the framework's does.
 * That is F1008, and the flag is on all three examples now.
 */

/**
 * **`unicodeText` was here and is gone** (F54, F124, F43).
 *
 * It computed C02's `unicode` axis from three environment variables joined into
 * one string, and disagreed with the framework on **three of the four locale
 * shapes anyone tests** — in both directions. `LC_ALL=C` beside a UTF-8 `LANG`
 * drew block elements into a frame the renderer had already decided could not
 * show them; `LC_CTYPE` alone degraded a terminal that could have drawn, and
 * cost a reader the banner for nothing. C02 resolves `lcAll ?? lcCtype ?? lang`
 * — POSIX precedence, first variable set wins — against a concatenation.
 *
 * **Two things had to be true to delete it, and the second is why this note
 * exists rather than a smaller one.** The adapter half went when
 * `ProducerContext` grew `capabilities`, C02's *resolved* record with the app's
 * own overrides applied — so `container.ts` asks instead of being told. That
 * left this function with **no caller at all**, which nothing reported: neither
 * tsconfig sets `noUnusedLocals`, and the example typechecks clean under
 * `strict` with a dead function in it.
 *
 * And its justification had gone stale in place. The comment argued that *a
 * local handler is handed no capabilities at all, so the one route an app writes
 * entirely itself cannot ask the framework what the terminal supports* —
 * `LocalContext` is `ProducerContext & …`, and has carried the resolved record
 * since C23 I39 landed. A correct-sounding reason for keeping something,
 * outliving the fact it rested on, is what kept this readable and dead.
 *
 * The half that was never wrong and is worth keeping: **capability substitution
 * covers glyphs the framework picks, not text an adapter supplies.** `▄▀█` in a
 * `raw` block passes through untouched. Choosing an ASCII variant is the app's
 * job — it just asks `ctx.capabilities.unicode` now instead of guessing.
 */

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

/**
 * **`DOCKER_TUI_WORLD=demo` draws the invented host instead of this one**
 * (`world.ts`, the person's ruling of 2026-09-29). Read here and nowhere else,
 * and imported only when set, so the ordinary start pays nothing for it.
 * `tools/record.ts` builds the same world under virtual time; this door is for
 * looking at it by hand.
 *
 * **The demo arm asks the daemon nothing — not even its version**, which is why
 * `engineVersion()` is called inside the other arm rather than above both: a
 * demo mode that still ran `docker version` would reach the very host it exists
 * to keep out of the picture.
 */
const demo = process.env["DOCKER_TUI_WORLD"] === "demo" ? await import("./world.ts") : null;

const tui = createTui(
  appConfig(
    demo === null
      ? { engine: await engineVersion(), env: process.env, docker: realDocker }
      : { ...demo.demoDeps(() => performance.now()), env: process.env },
  ),
);

await tui.start();
