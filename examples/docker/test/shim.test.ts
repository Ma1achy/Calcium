/**
 * F1's shim — `--json` in, `--format json` out.
 *
 * The shim exists because Calcium's transport appends a flag docker rejects
 * (see `bin/docker-json` and FINDINGS.md F1). It sits between the framework and
 * the far side on every single invocation, so a defect in it is a defect in
 * every verb the app will ever have.
 *
 * **A fake `docker` on PATH, not the real one.** What is under test is the
 * translation, and the real docker answers `--format json` correctly whether or
 * not the shim built the argv properly — an assertion against real output would
 * pass on a shim that dropped an argument, provided the argument did not happen
 * to matter for `ps`. The fake prints its argv and nothing else, so the
 * assertion is about the exact list docker was handed.
 */

import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const SHIM = fileURLToPath(new URL("../bin/docker-json", import.meta.url));

let fakeBin: string;

beforeAll(() => {
  fakeBin = mkdtempSync(join(tmpdir(), "docker-tui-fake-"));
  const fake = join(fakeBin, "docker");
  // One argument per line, so an argument containing a space is distinguishable
  // from two arguments — which is the whole class of defect a rebuilt argv has.
  writeFileSync(fake, '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  chmodSync(fake, 0o755);
});

/** What docker was actually handed, one argument per element. */
function argvOf(...args: string[]): string[] {
  const out = execFileSync(SHIM, args, {
    encoding: "utf8",
    env: { ...process.env, PATH: fakeBin },
  });
  return out.split("\n").slice(0, -1);
}

describe("F1: the shim translates Calcium's --json into docker's --format json", () => {
  it("S1.1: --json becomes --format json", () => {
    expect(argvOf("ps", "--json")).toEqual(["ps", "--format", "json"]);
  });

  it("S1.2: --format json arrives as two arguments, not one", () => {
    // The failure this rules out is `--format json` emitted as a single word,
    // which docker reads as an unknown flag and the shell hides in a quoted
    // string. Only a per-argument fake can tell them apart.
    const argv = argvOf("ps", "--json");
    expect(argv).not.toContain("--format json");
    expect(argv[1]).toBe("--format");
    expect(argv[2]).toBe("json");
  });

  it("S1.3: an argv with no --json is passed through byte-identical", () => {
    const argv = ["images", "--all", "--filter", "dangling=true"];
    expect(argvOf(...argv)).toEqual(argv);
  });

  it("S1.4: a user's own --format wins, and --json is dropped rather than appended", () => {
    // Docker takes the last --format it is given, so emitting both would work
    // by accident today and break the day that changes.
    expect(argvOf("ps", "--format", "{{.Names}}", "--json")).toEqual([
      "ps",
      "--format",
      "{{.Names}}",
    ]);
    expect(argvOf("ps", "--format={{.ID}}", "--json")).toEqual(["ps", "--format={{.ID}}"]);
  });

  it("S1.5: --json is translated once, however many times it arrives", () => {
    // C06's `withJson` dedupes, so a doubled flag should not reach here — but
    // the shim must not be the thing relying on that.
    expect(argvOf("ps", "--json", "--json")).toEqual(["ps", "--format", "json"]);
  });

  it("S1.6: arguments containing spaces survive as single arguments", () => {
    expect(argvOf("ps", "--filter", "label=a b", "--json")).toEqual([
      "ps",
      "--filter",
      "label=a b",
      "--format",
      "json",
    ]);
  });

  it("S1.7: the position of --json does not matter", () => {
    expect(argvOf("ps", "--json", "--all")).toEqual(["ps", "--format", "json", "--all"]);
  });
});

/**
 * F26 — the second translation, and the same class as the first.
 *
 * `docker container stats` redraws a region forever and never exits, so C06
 * would wait on a process with no intention of finishing. The far side's default
 * shape does not match the framework's contract and the app absorbs it, which is
 * what an adapter layer is for.
 */
describe("F26: the shim supplies --no-stream for the verb that would never exit", () => {
  it("S2.1: container stats gains --no-stream", () => {
    expect(argvOf("container", "stats", "abc", "--json")).toEqual([
      "container",
      "stats",
      "abc",
      "--format",
      "json",
      "--no-stream",
    ]);
  });

  it("S2.2: no other verb gains it", () => {
    // A blanket append puts an unknown flag on `ps`, which fails every listing
    // in the app — the failure mode is total and the guard is one `case`.
    expect(argvOf("ps", "--json")).not.toContain("--no-stream");
    expect(argvOf("images", "--json")).not.toContain("--no-stream");
  });

  it("S2.3: an explicit --no-stream is not doubled", () => {
    const argv = argvOf("container", "stats", "abc", "--no-stream", "--json");
    expect(argv.filter((a) => a === "--no-stream")).toHaveLength(1);
  });

  it("S2.4: the shim still exits zero for a verb it does not touch", () => {
    // **`[ … ] && …` as the last command of the script is a non-zero exit under
    // `set -e`**, so the short form of the guard would have made the shim fail
    // for every verb that is not `stats` — with docker's own output already
    // written, which is the shape that reads as a transport fault.
    // Untranslated, because there is no `--json` to translate — and `argvOf`
    // throws on a non-zero exit, so passing *is* the exit-code assertion.
    expect(argvOf("ps")).toEqual(["ps"]);
  });
});
