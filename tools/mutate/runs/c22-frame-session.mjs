// C22 §4, §6, §7, §8 — fallback, frame, identity, cleanup.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const SUITE = [
  "test/unit/session.test.ts",
  "test/unit/session-frame.test.ts",
  "test/unit/session-fallback.test.ts",
  "test/unit/session-identity.test.ts",
].join(" ");

const read = (f) => readFileSync(`${ROOT}/${f}`, "utf8");
const write = (f, s) => writeFileSync(`${ROOT}/${f}`, s);
const run = () => {
  try {
    return execSync(`npx vitest run ${SUITE} 2>&1`, { cwd: ROOT, encoding: "utf8" });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: "src/shell/shutdown.ts",
    from: "    history.drain();",
    to: "    // history.drain();",
    why: "T2.8b asserts drain is called exactly once on every cleanup",
  },
  mutations: [
    // --- §8, the cleanup property -------------------------------------------
    {
      name: "cleanup: await killAll, making beforeRelease async",
      file: "src/shell/shutdown.ts",
      from: "    void runner.killAll();",
      to: "    return runner.killAll().then(() => undefined);",
      expect: "T2.8",
    },
    {
      name: "cleanup: flush instead of drain",
      file: "src/shell/shutdown.ts",
      from: "    history.drain();",
      to: "    (history as unknown as { flush?: () => void }).flush?.();",
      expect: "T2.8b",
    },
    {
      name: "cleanup: kill children after draining, not before",
      file: "src/shell/shutdown.ts",
      from: "    void runner.killAll();",
      to: "    queueMicrotask(() => void runner.killAll());",
      expect: "T2.1",
    },
    // --- §6, the once-per-frame samples --------------------------------------
    {
      name: "frame: read the clock per chrome function instead of per frame",
      file: "src/shell/frame.ts",
      from: "  const ctx = { session, now, columns: size.columns };",
      to: "  const ctx = { session, get now() { return deps.now(); }, columns: size.columns };",
      expect: "T4.11",
    },
    {
      name: "frame: read the size again for the overlay region",
      file: "src/shell/frame.ts",
      from: "    overlayRegion: Object.freeze({ width: size.columns, height: size.rows }),",
      to: "    overlayRegion: Object.freeze({ width: deps.size().columns, height: deps.size().rows }),",
      expect: "T4.11b",
    },
    {
      name: "frame: let the transcript height go negative",
      file: "src/shell/frame.ts",
      // Re-anchored 2026-09-05 when the footer's budget stopped being a constant
      // (C22 §6k): `footerRows` is the session's, `FOOTER_ROWS` no longer exists.
      from: "  const height = Math.max(0, size.rows - HEADER_ROWS - footerRows - promptRows);",
      to: "  const height = size.rows - HEADER_ROWS - footerRows - promptRows;",
      expect: "T4.9b",
    },
    // --- §4, the fallback ----------------------------------------------------
    {
      name: "fallback: measure with .length rather than cells()",
      file: "src/shell/fallback.ts",
      from: "    if (cells(out) + cells(ch) > width) break;",
      to: "    if (out.length + ch.length > width) break;", // graphemes-ok: the mutation is the defect
      expect: "T3.8c",
    },
    {
      name: "fallback: emit every line regardless of the terminal's rows",
      file: "src/shell/fallback.ts",
      from: "  return Object.freeze(lines.slice(0, Math.max(0, size.rows)));",
      to: "  return Object.freeze(lines);",
      expect: "T3.8d",
    },
    {
      // **The inert-subject sweep, kept.** These three all survived once: the
      // assertion was `toContain("\\r\\n")` against a three-line render, where
      // the join, the terminator and a spare all satisfy it.
      name: "fallback: drop the trailing CRLF",
      file: "src/shell/fallback.ts",
      from: '  write(`${lines.join("\\r\\n")}\\r\\n`);',
      to: '  write(lines.join("\\r\\n"));',
      expect: "T3.15c",
    },
    {
      name: "fallback: join with LF, which staircases in raw mode",
      file: "src/shell/fallback.ts",
      from: '  write(`${lines.join("\\r\\n")}\\r\\n`);',
      to: '  write(`${lines.join("\\n")}\\r\\n`);',
      expect: "T3.15c",
    },
    {
      name: "fallback: write a lone newline into a zero-row terminal",
      file: "src/shell/fallback.ts",
      from: "  if (lines.length === 0) return;",
      to: "  if (false) return;",
      expect: "T3.15c",
    },
    {
      name: "fallback: emit an SGR",
      file: "src/shell/fallback.ts",
      from: "    fitCells(`Terminal too small`, size.columns),",
      to: "    fitCells(`\\u001b[31mTerminal too small\\u001b[39m`, size.columns),",
      expect: "T3.8b",
    },
    {
      name: "fallback: report the minimum as the actual size",
      file: "src/shell/fallback.ts",
      from: "    fitCells(`${String(size.columns)}x${String(size.rows)}`, size.columns),",
      to: "    fitCells(`${String(MIN_COLUMNS)}x${String(MIN_ROWS)}`, size.columns),",
      expect: "T3.15b",
    },
    {
      name: "fallback: gate on both bounds rather than either",
      file: "src/shell/fallback.ts",
      from: "  return size.columns < MIN_COLUMNS || size.rows < MIN_ROWS;",
      to: "  return size.columns < MIN_COLUMNS && size.rows < MIN_ROWS;",
      expect: "T3.7a",
    },
    // --- §7, identity --------------------------------------------------------
    {
      name: "identity: await the first fetch, blocking startup",
      file: "src/shell/identity.ts",
      from: "      void refresh();\n      arm();",
      to: "      void refresh().then(arm);",
      expect: "T3.10",
    },
    {
      name: "identity: let a failed fetch throw rather than degrade",
      file: "src/shell/identity.ts",
      from: '      deps.writes.setHealth("offline");\n      return;',
      to: "      throw new Error(\"unreachable\");",
      expect: "T3.14",
    },
    {
      name: "identity: warn on every refresh, not once",
      file: "src/shell/identity.ts",
      from: "      if (!warned) {\n        warned = true;\n        deps.notify(expiryNotice(remaining));\n      }",
      to: "      deps.notify(expiryNotice(remaining));",
      expect: "T3.12b",
    },
    {
      name: "identity: announce expiry here as well as in C23",
      file: "src/shell/identity.ts",
      from: '      deps.writes.setHealth("expiring");\n      return;\n    }\n\n    if (remaining < EXPIRY_WARN_MS) {',
      to: '      deps.writes.setHealth("expiring");\n      deps.notify("Token expired");\n      return;\n    }\n\n    if (remaining < EXPIRY_WARN_MS) {',
      expect: "T3.12d",
    },
  ],
});

console.log(report(results));
process.exit(results.some((r) => !r.killed) ? 1 : 0);
