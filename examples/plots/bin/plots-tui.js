#!/usr/bin/env node
/**
 * The command. `plots-tui`, on `PATH`, from anywhere.
 *
 * **F56's class, closed for the second of three apps.** `package.json` declared
 * `"bin": { "plots-tui": "./main.ts" }` — a TypeScript file with no shebang, at
 * mode 755, so the kernel hands it to `sh` and `sh` parses TypeScript. Measured
 * before this file existed:
 *
 *     ./main.ts: line 1: /bin: Is a directory
 *     ./main.ts: line 2: README.md: command not found
 *
 * The docstring's opening `/**` is read as a glob and expands against the
 * filesystem. F56 fixed exactly this for `docker-tui` and left the same
 * declaration standing in two more manifests: **a finding closed at the
 * instance rather than at the class**, and nothing ran either command in between
 * (F858).
 *
 * **Why a `.js` launcher rather than a shebang on `main.ts`.** Node 22.18 turned
 * on type stripping by default, so a `.ts` bin with a shebang would in fact run
 * — on 22.18 and later. `engines` says `>=22`, and on 22.0 it fails with a
 * syntax error inside a file the user did not write. `docker-tui`'s launcher
 * carries the same argument.
 *
 * **`NODE_ENV`, set here and imported dynamically — the second half of F853.**
 * `react-reconciler`'s entry picks its build from `process.env.NODE_ENV` at
 * require time, and the development build calls `performance.measure` about
 * three times per commit into a buffer Node never releases. `npm start` sets the
 * variable; a globally installed command gets no environment from npm, so this
 * path was back on the development build and leaking three objects a frame — and
 * this is the app whose session raised the warning.
 *
 * **The import is dynamic because a static one hoists.** ESM evaluates every
 * static import before the module body runs, so the assignment above a static
 * `import "../main.ts"` would execute *after* `ink` had resolved
 * `react-reconciler` and chosen its build. `??=` rather than `=`, so a consumer
 * who sets the variable deliberately keeps it.
 */
process.env.NODE_ENV ??= "production";
await import("../main.ts");
