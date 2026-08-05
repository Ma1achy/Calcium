#!/usr/bin/env node
/**
 * The command. `docker-tui`, on `PATH`, from anywhere.
 *
 * **This file is the finding, not the chore.** `package.json` has declared
 * `"bin": { "docker-tui": "./src/main.ts" }` since the first commit of this
 * app, and it could never have run: a `.ts` file with no shebang, so the kernel
 * hands it to `sh` and `sh` tries to parse TypeScript —
 * `Syntax error: word unexpected`, measured. Nothing ever noticed, because
 * nothing ever ran it: every test imports the modules directly and every
 * session used `npm start`.
 *
 * That is F52's shape exactly, one level out. F52 was a parameter with a spec, a
 * precedence rule, four unit rows and a tier-5 row, all passing, and no producer.
 * This is a manifest field with a value, a documented purpose, and no consumer.
 * **A declaration is not a mechanism.** npm repairs the one half it can — it
 * chmods the target to 755 — and there is nothing it can do about a file the
 * kernel has no interpreter for. Filed as F56.
 *
 * **Why a `.js` launcher rather than pointing `bin` at `main.ts` directly.**
 * Node 22.18 turned on type stripping by default, so the `.ts` would in fact
 * load — which makes this the worse option rather than the unavailable one. A
 * `bin` that works only on Node ≥ 22.18 fails on 22.0 with a syntax error inside
 * a file the user did not write, and `engines` says `>=22`. One line of JavaScript
 * costs nothing and the entry point stops depending on a runtime default.
 *
 * The relative import resolves against this file's real path rather than the
 * symlink npm installs, because Node resolves `realpath` before specifiers —
 * which is what lets `bin/docker-json` be found by `new URL("../bin/…",
 * import.meta.url)` in `manifest.ts` no matter which directory you type the
 * command from.
 */
import "../src/main.ts";
