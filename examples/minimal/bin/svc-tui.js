#!/usr/bin/env node
/**
 * The command. `svc-tui`, on `PATH`, from anywhere.
 *
 * **F56's class, closed for the third of three apps.** `package.json` declared
 * `"bin": { "svc-tui": "./main.ts" }` — a TypeScript file with no shebang, at
 * mode 644. Measured before this file existed: `Permission denied`, exit 126.
 * npm chmods a bin target to 755 on install, which turns this into the failure
 * `plots-tui` had instead — `sh` parsing TypeScript. So the two apps failed
 * differently for one reason, and the mode is what decided which (F858).
 *
 * **Why a `.js` launcher rather than a shebang on `main.ts`.** Node 22.18 turned
 * on type stripping by default, so a `.ts` bin with a shebang would run on 22.18
 * and later; `engines` says `>=22`, and on 22.0 it fails with a syntax error
 * inside a file the user did not write. `docker-tui`'s launcher carries the same
 * argument.
 *
 * **`NODE_ENV`, set here and imported dynamically — the second half of F853.**
 * `react-reconciler`'s entry picks its build from `process.env.NODE_ENV` at
 * require time, and the development build calls `performance.measure` about
 * three times per commit into a buffer Node never releases. `npm start` sets the
 * variable; a globally installed command gets no environment from npm.
 *
 * **The import is dynamic because a static one hoists.** ESM evaluates every
 * static import before the module body runs, so the assignment above a static
 * `import "../main.ts"` would execute *after* `ink` had resolved
 * `react-reconciler` and chosen its build. `??=` rather than `=`, so a consumer
 * who sets the variable deliberately keeps it.
 */
process.env.NODE_ENV ??= "production";
await import("../main.ts");
