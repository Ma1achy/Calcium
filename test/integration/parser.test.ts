// C18 tier 4 — integration. Against real C05, and against the real shell.
//
// **T4.8 is the one a fake cannot give.** §8b writes out the exact string
// handed to `spawnShell` for every delegated row, and a splice can be
// arithmetically perfect about offsets while producing something `sh` parses
// differently. C21 is built, so the answer comes from running it.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { validateInvocation } from "../../src/data/manifest/index.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { parse } from "../../src/interaction/parser/index.js";
import type { ParseContext } from "../../src/interaction/parser/index.js";
import { collect } from "../support/process.js";
import { fixture, raw } from "../support/manifest.js";
import { parseManifest } from "../../src/data/manifest/index.js";

const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  manifest: fixture(),
  binary: "widget",
  lastUuid: "web:v3",
  ...over,
});

const runner = () => createProcessRunner({ env: process.env, stdin: {} });

async function shell(command: string, cwd: string): Promise<string> {
  const child = runner().spawnShell(command, { cwd: () => cwd });
  const out = await collect(child.stdout);
  await child.exited;
  return out;
}

describe("C18 with C05", () => {
  it("T4.1: validation errors are carried through unchanged", () => {
    const r = parse("/ps --status=nonsense --open-mrr", ctx());
    expect(r.kind).toBe("app");
    if (r.kind !== "app") return;

    // Unchanged means identical, not merely also-failing: C18 adds no message
    // of its own and drops none of C05's.
    expect(r.validation).toEqual(validateInvocation(r.tool, r.residual));
    if (r.validation.ok) return;
    expect(r.validation.errors.map((e) => e.code).sort()).toEqual(["bad_value", "unknown_flag"]);
  });

  it("T4.2: adding a flag to the manifest makes an invocation valid, with no parser change", () => {
    const before = parse("/ps --colour=red", ctx());
    expect(before.kind).toBe("app");
    if (before.kind !== "app") return;
    expect(before.validation.ok).toBe(false);

    const source = raw();
    const tools = source["tools"] as Record<string, unknown>[];
    const ps = tools.find((t) => t["name"] === "ps");
    (ps?.["flags"] as unknown[]).push({ name: "colour", type: "string", summary: "which colour" });
    const extended = parseManifest(source);
    expect(extended.ok).toBe(true);
    if (!extended.ok) return;

    const after = parse("/ps --colour=red", ctx({ manifest: extended.value }));
    expect(after.kind).toBe("app");
    if (after.kind !== "app") return;
    expect(after.validation.ok, "the manifest moved; nothing else did").toBe(true);
  });
});

describe("C18 with C21 — §8b, run rather than read", () => {
  let dir = "";

  it("T4.8: the delegated string is one the shell agrees with", async () => {
    dir = mkdtempSync(`${tmpdir()}/c18-`);
    try {
      writeFileSync(`${dir}/alpha.md`, "a");
      writeFileSync(`${dir}/beta.md`, "b");

      // A binary that is a path with a space — the case the quoter exists for,
      // and the one a string comparison passes while the shell disagrees.
      const spaced = `${dir}/my tools`;
      writeFileSync(`${dir}/my tools`, "#!/bin/sh\necho \"ran $*\"\n", { mode: 0o755 });

      // 1. A pipe, with the verb rewritten.
      const piped = parse("/ps --json | tr a A", ctx({ binary: spaced }));
      expect(piped.kind).toBe("shell");
      if (piped.kind !== "shell") return;
      expect(await shell(piped.command, dir)).toBe("rAn ps --json\n");

      // 2. A glob — the `j22` reversal. The shell expands it because the shell
      //    is the thing doing it.
      const glob = parse("ls *.md", ctx());
      expect(glob.kind).toBe("shell");
      if (glob.kind !== "shell") return;
      expect((await shell(glob.command, dir)).split("\n").filter(Boolean).sort()).toEqual([
        "alpha.md",
        "beta.md",
      ]);

      // 3. A redirect to a quoted path with spaces — quoting preserved
      //    verbatim, which is what the splice is for.
      const redirect = parse('echo hi > "my out.txt"', ctx());
      expect(redirect.kind).toBe("shell");
      if (redirect.kind !== "shell") return;
      await shell(redirect.command, dir);
      expect(await shell('cat "my out.txt"', dir)).toBe("hi\n");

      // 4. Two rewrites in one line, spliced last-to-first.
      const both = parse("/ps | /help", ctx({ binary: spaced }));
      expect(both.kind).toBe("shell");
      if (both.kind !== "shell") return;
      expect(await shell(both.command, dir)).toBe("ran help\n");

      // 5. The row that made the command-position clause necessary. Delegated
      //    unchanged, and the shell reads `/tmp` as the argument it is.
      const cd = parse("cd /tmp | cat", ctx({ binary: spaced }));
      expect(cd.kind).toBe("shell");
      if (cd.kind !== "shell") return;
      expect(cd.command).toBe("cd /tmp | cat");
      expect(await shell(cd.command, dir)).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("T4.8b: a builtinThenShell's rest is a command the shell runs", async () => {
    const d = mkdtempSync(`${tmpdir()}/c18-rest-`);
    try {
      writeFileSync(`${d}/widget`, "#!/bin/sh\necho \"ran $*\"\n", { mode: 0o755 });
      const r = parse("cd /tmp && /ps --json", ctx({ binary: `${d}/widget` }));
      expect(r.kind).toBe("builtinThenShell");
      if (r.kind !== "builtinThenShell") return;

      expect(r.args).toEqual(["/tmp"]);
      expect(await shell(r.rest, d)).toBe("ran ps --json\n");
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
