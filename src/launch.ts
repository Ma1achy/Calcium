/**
 * `@fmx/calcium/launch` — the loader hooks a launcher installs before it imports
 * the app (C24 §2, I37; R01 R4.7; F1192).
 *
 * **One name, thirteen hundred modules.** Ink imports `throttle` from
 * `es-toolkit/compat`, and that barrel imports every compat function it
 * re-exports: 1,319 of a cold import's 2,442 modules, against a hundred for Ink
 * itself. `prepareLaunch()` registers two synchronous loader hooks that hand Ink
 * the one file in the barrel's place — 1,130 modules, and a fifth of the import
 * under the compile cache, six of six pairs.
 *
 * **Why it is an entry and not a behaviour of the runtime.** A redirect has to be
 * installed before the loader reads Ink's import line, and a static import of
 * the runtime barrel hoists past anything in the same module — so the call
 * cannot live in `dist/index.js` and cannot be made after it. It lives in the
 * launcher between `enableCompileCache()` and the dynamic import of the app, by
 * R4.6's argument verbatim. And it is Calcium's rather than a launcher recipe
 * because what it names — Ink's import line and es-toolkit's file layout — is
 * exactly what the public surface hides from a consumer.
 *
 * **Exact or absent** (I37). A `resolve` hook cannot see which names an import
 * binds, so on its own it would link `debounce` against a file exporting
 * `throttle` the day Ink imports two names — a `SyntaxError` at start for a
 * startup optimisation. So the redirect is *armed* by a `load` hook that reads
 * Ink's source as the loader hands it over and matches the import line byte for
 * byte; the `resolve` hook then rewrites the *resolved* barrel URL rather than
 * the specifier (es-toolkit's `./compat/*` export map names files the package
 * does not ship, measured), inside whichever copy of es-toolkit the loader
 * chose, and only when that file is on disk. Any other text, importer,
 * specifier or layout — or a Node without `registerHooks` — leaves the barrel
 * in place, which is the behaviour a consumer who never called this has.
 *
 * The module Ink receives is the same module object the barrel re-exports
 * (`compat/index.mjs` imports `./function/throttle.mjs`), so no frame changes by
 * a byte; the observable is the graph and never a duration (I36's rule).
 */
import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";

/** The one file the hooks watch for, as the loader spells its URL. */
export const INK_MODULE = "/node_modules/ink/build/ink.js";
/** The line that arms the redirect — Ink 7.1's, byte for byte. */
export const INK_IMPORT_LINE = "import { throttle } from 'es-toolkit/compat';";

const BARREL = "es-toolkit/compat";
const BARREL_TAIL = /\/compat\/index\.mjs$/;
const NARROW_TAIL = "/compat/function/throttle.mjs";

/**
 * Whether Ink's source, as loaded, binds exactly the one name the narrow module
 * exports. `includes` of the whole line: a second name, another quote style or
 * a reformatted import all read as a different line and arm nothing.
 */
export function armsOn(inkSource: string): boolean {
  return inkSource.includes(INK_IMPORT_LINE);
}

/**
 * The narrow module's URL for the resolved barrel's, or the URL unchanged when
 * it is not the barrel or the narrow file is not on disk. `exists` is a
 * parameter so the fallback arm is a row and not a hope (T1.12).
 */
export function narrowedUrl(resolvedUrl: string, exists: (path: string) => boolean = existsSync): string {
  if (!BARREL_TAIL.test(resolvedUrl)) return resolvedUrl;
  const narrow = resolvedUrl.replace(BARREL_TAIL, NARROW_TAIL);
  return exists(fileURLToPath(narrow)) ? narrow : resolvedUrl;
}

type Register = typeof nodeModule.registerHooks;

/**
 * Install the hooks. Returns `"hooked"`, or `"unavailable"` on a Node without
 * synchronous loader hooks (before 22.15), where the barrel loads as before.
 * Call once, before the app is imported; a second call installs a second pair
 * that agrees with the first.
 */
export function prepareLaunch(): "hooked" | "unavailable" {
  const register = (nodeModule as { registerHooks?: Register }).registerHooks;
  if (register === undefined) return "unavailable";
  let armed = false;
  register({
    load(url, context, next) {
      const loaded = next(url, context);
      if (!armed && url.endsWith(INK_MODULE) && loaded.source != null) {
        const text = typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
        if (armsOn(text)) armed = true;
      }
      return loaded;
    },
    resolve(specifier, context, next) {
      const resolved = next(specifier, context);
      if (!armed || specifier !== BARREL || !(context.parentURL ?? "").endsWith(INK_MODULE)) return resolved;
      const narrow = narrowedUrl(resolved.url);
      return narrow === resolved.url ? resolved : { ...resolved, url: narrow };
    },
  });
  return "hooked";
}
