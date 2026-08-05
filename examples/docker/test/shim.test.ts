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
    // **The fake first, the real path behind it.** `PATH: fakeBin` alone was
    // enough until `logs`, whose branch pipes through `awk` rather than
    // `exec`ing docker — so the row failed with `awk: not found`, which is the
    // test finding a runtime dependency the other branches do not have.
    env: { ...process.env, PATH: `${fakeBin}:${process.env["PATH"] ?? ""}` },
  });
  return out.split("\n").slice(0, -1);
}

/**
 * The same, for `logs` — whose branch does not `exec` docker.
 *
 * F45's wrapping means every line docker writes comes back as `{"line": "…"}`,
 * so the fake's one-argument-per-line output arrives wrapped too. Unwrapping it
 * here rather than asserting the raw text keeps the assertion about **argv**,
 * which is what these rows are for; asserting the JSON would make them a test of
 * the wrapper by accident.
 */
function logsArgvOf(...args: string[]): string[] {
  return argvOf(...args).map((line) => (JSON.parse(line) as { line: string }).line);
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

/**
 * S11_WALK.md A1 and A2 — the verbs with no `--format` flag.
 *
 * **These rows exist because three of them were met one at a time.** `logs`
 * stripped the translated pair by hand; `diff`, `port` and `top` would each have
 * arrived as their own frame-read. Measured against the daemon before the list
 * was written:
 *
 *     docker diff <c> --format json    unknown flag: --format         exit 125
 *     docker port <c> --format json    unknown flag: --format         exit 125
 *     docker logs <c> --format json    unknown flag: --format         exit 125
 *     docker top  <c> --format json    ps: error: unknown user-defined
 *                                      format specifier "json"        exit 1
 */
describe("A1: --json is dropped for a verb docker cannot format", () => {
  it("S3.1: diff, port, top and logs lose --json entirely", () => {
    expect(argvOf("diff", "abc", "--json")).toEqual(["diff", "abc"]);
    expect(argvOf("port", "abc", "--json")).toEqual(["port", "abc"]);
    expect(argvOf("top", "abc", "--json")).toEqual(["top", "abc"]);
    // `logs` gains its own two flags below; what matters here is the absence.
    expect(logsArgvOf("logs", "abc", "--json")).not.toContain("--format");
  });

  it("S3.2: every other verb still translates", () => {
    // The list is an exception, so the rule it excepts has to be asserted
    // beside it — otherwise a list that grew to cover everything would pass.
    expect(argvOf("images", "--json")).toEqual(["images", "--format", "json"]);
    expect(argvOf("inspect", "abc", "--json")).toEqual([
      "inspect",
      "abc",
      "--format",
      "json",
    ]);
  });

  it("S3.3: the verb is read from the first argument, not searched for", () => {
    // A container named `diff` must not put `ps` in the list. The far side's
    // vocabulary and the reader's arguments occupy the same argv, and only
    // position tells them apart.
    //
    // The translated pair lands where `--json` was, not at the end — asserted as
    // measured rather than as assumed, because the first version of this row
    // guessed the other order, and a guess that passes becomes a rule.
    expect(argvOf("ps", "--json", "diff")).toEqual(["ps", "--format", "json", "diff"]);
  });
});

/**
 * F39 — `--raw` selects a rendering and reaches the far side anyway.
 *
 * **This row and the four below did not exist**, and a comment in `src/logs.ts`
 * said one of them did: *"the test asserts the shim rather than this constant"*,
 * written about `TAIL`. It was A03 §2's vacuity class arriving in a comment —
 * a sentence naming a mechanism, satisfied by the naming.
 */
describe("F39: the shim strips a flag that selects a rendering", () => {
  it("S4.1: --raw does not reach docker", () => {
    expect(argvOf("inspect", "abc", "--raw", "--json")).toEqual([
      "inspect",
      "abc",
      "--format",
      "json",
    ]);
  });

  it("S4.2: only for inspect — no other verb has one to strip", () => {
    expect(argvOf("ps", "--raw", "--json")).toContain("--raw");
  });
});

describe("S9: the shim supplies the follow and the tail", () => {
  it("S5.1: logs gains --follow and --tail 200", () => {
    expect(logsArgvOf("logs", "abc", "--json")).toEqual([
      "logs",
      "abc",
      "--follow",
      "--tail",
      "200",
    ]);
  });

  it("S5.2: an explicit follow or tail from the reader wins", () => {
    const a = logsArgvOf("logs", "abc", "--tail", "5", "--json");
    expect(a.filter((x) => x === "--tail")).toHaveLength(1);
    expect(a).toContain("5");
    expect(a).not.toContain("200");

    const c = logsArgvOf("logs", "abc", "-f", "--json");
    expect(c).not.toContain("--follow");
  });

  it("S5.3: no other verb gains them", () => {
    expect(argvOf("ps", "--json")).not.toContain("--follow");
    expect(argvOf("inspect", "abc", "--json")).not.toContain("--tail");
  });
});

/**
 * F61 — the follow that produced nothing, and the shape of test that missed it.
 *
 * Every row above asserts **argv**: what the shim hands docker. Not one asserts
 * that a line comes back out, and the wrapper had been broken for as long as it
 * has existed on any machine where `/usr/bin/awk` is mawk — which is Debian's
 * default and therefore this container's.
 *
 * mawk block-buffers its *input*. `fflush()` governs output and says nothing
 * about that. A finite stream ends, mawk processes the remainder, and everything
 * appears — which is exactly the shape every existing row has, because the fake
 * exits. A `--follow` never ends, so nothing appeared until a buffer filled:
 * eleven kilobytes of real nginx log and four seconds produced **zero bytes**
 * through `awk` and 150 lines through `cat`.
 *
 * **`/logs` therefore opened a pushed view and rendered an empty screen**, and
 * the pushed view removes the prompt, so there was not even a cursor to suggest
 * the app was alive. It is the empty-block class reached through the instrument
 * rather than the data.
 *
 * The rows below are deliberately about *arrival*, not about which program does
 * the wrapping. `sed -u` is the fix; a platform whose `sed` ignores `-u` would
 * return to the defect silently, and a row naming `sed` would still pass.
 */
describe("F61: a line arrives, and arrives while the stream is still open", () => {
  /**
   * A second fake, and it is the fixture the whole finding turns on: it writes
   * three lines slowly and then **does not exit**. Every other row in this file
   * uses a fake that prints and returns, which is the shape that hides the
   * defect — mawk reaches EOF, processes its buffer, and everything appears.
   */
  let followBin: string;
  beforeAll(() => {
    followBin = mkdtempSync(join(tmpdir(), "docker-tui-follow-"));
    const fake = join(followBin, "docker");
    writeFileSync(
      fake,
      [
        "#!/bin/sh",
        "# Three lines, slowly, carrying every escape the wrapper exists for,",
        "# then a sleep well past the timeout so the stream is unambiguously open",
        "# when the assertion is made.",
        'printf "plain\\n"; sleep 0.2',
        'printf \'with "q"\\n\'; sleep 0.2',
        'printf "with \\\\ back\\n"',
        "sleep 30",
        "",
      ].join("\n"),
    );
    chmodSync(fake, 0o755);
  });

  /** The real shim, killed by timeout rather than by closing its pipe. */
  const followLines = (): { line: string }[] => {
    // **`timeout`, never `head`.** Closing the pipe ends the stream, and the
    // end of the stream is precisely what made mawk look correct. A row that
    // reads three lines and stops would pass against the broken wrapper.
    const out = execFileSync("sh", ["-c", `timeout 3 "$0" logs c --json || true`, SHIM], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${followBin}:${process.env["PATH"] ?? ""}` },
    });
    return out.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { line: string });
  };

  it("S6.1: lines arrive while the far side is still running", () => {
    // Under mawk this is `[]`. `fflush()` is about output and the buffering is
    // on input, so no amount of flushing in the wrapper could have fixed it.
    expect(
      followLines().map((l) => l.line),
      "nothing arrived while the stream was open — the input buffering is back",
    ).toEqual(["plain", 'with "q"', "with \\ back"]);
  }, 20_000);

  it("S6.2: and each one is a JSON object the adapter can parse", () => {
    // F45's premise: `docker logs` emits no JSON, so the shim makes it into the
    // JSON-emitting far side the framework is for. If a line came back raw, C07
    // would treat every line as unparseable and the fallback would accumulate
    // the whole follow into one growing `raw` block — C22 I47's pathology.
    const lines = followLines();
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(typeof l.line).toBe("string");
  }, 20_000);
});
