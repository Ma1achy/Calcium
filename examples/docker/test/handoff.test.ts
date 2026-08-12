/**
 * Step 13's declarations, and the shim translation they imply.
 *
 * **There is no handler to test.** C23 §4 implements the whole sequence and the
 * app writes none of it — the declaration is the entire contribution. So what
 * this file can assert is that the declaration is right and that the shim
 * supplies what it implies, and the round trip itself is a frame-read.
 *
 * F80 changed what *right* means: the contract belongs to the invocation, so
 * `run` and `exec` declare arms on the flags that decide (C05 I23).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.ts";

const tools = buildManifest("29.4").tools;
const named = (n: string) => tools.find((t) => t.name === n);

describe("the handoff verbs", () => {
  it("T1 (C05 I19, I23): each verb declares the default its flags then decide against", () => {
    // `attach` has one contract and no flags; `run` attaches unless detached;
    // `exec` returns unless `-i`/`-t`. Three shapes, and the default is only
    // half of each of the last two.
    expect(named("attach")?.interactive, "attach takes the terminal, always").toBe(true);
    expect(named("run")?.interactive, "run attaches by default").toBe(true);
    expect(named("exec")?.interactive, "exec does not — `docker exec c ls` returns").toBeUndefined();

    // `create` makes a container and never attaches; declaring it interactive
    // would suspend the screen around a call that prints an id.
    expect(named("create")?.interactive).toBeUndefined();
  });

  it("T2 (C05 I19): an interactive verb is never local, or there is no child", () => {
    // The parser refuses the pair. Asserting it here keeps the manifest honest
    // without waiting for construction to fail at startup.
    for (const t of tools) {
      if (t.interactive === true) {
        expect(t.local, `${t.name} is interactive and must be spawned`).toBe(false);
      }
    }
  });

  it("T3 (F80, C05 I23): the arms are on the flags that decide, and only on those", () => {
    const armsOf = (n: string): Record<string, boolean | undefined> =>
      Object.fromEntries(named(n)!.flags.map((f) => [f.name, f.interactive]));

    // **`run` attaches by default, so the arm is `--detach` and it reads
    // `false`.** `-i` and `-t` carry nothing: an arm equal to the tool's default
    // is refused at parse, which is what stops two flags disagreeing. So
    // `/run -dit` is not interactive with no precedence rule consulted.
    expect(armsOf("run")).toEqual({
      detach: false,
      rm: undefined,
      name: undefined,
      interactive: undefined,
      tty: undefined,
    });

    // **`exec` is the other direction**, which is why one field on the tool
    // could not describe this family whichever way it was set.
    expect(armsOf("exec")).toEqual({ interactive: true, tty: true, user: undefined });

    // And a verb with one contract carries no arms at all.
    expect(named("attach")!.flags).toEqual([]);
  });
});

describe("the shim supplies what the declaration implies", () => {
  const shim = new URL("../bin/docker-json", import.meta.url).pathname;

  /**
   * The argv the shim would hand docker, with a stub docker on PATH.
   *
   * **A stub rather than the real daemon**, because the subject is the argv and
   * not the outcome — the first draft of this row invoked docker for real,
   * asserted nothing, and failed on `No such container`, which is a test about
   * the fixture set rather than about the translation.
   */
  const argvFor = (args: readonly string[]): string[] => {
    const dir = mkdtempSync(`${tmpdir()}/dtui-shim-`);
    writeFileSync(`${dir}/docker`, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    try {
      return execFileSync(shim, [...args], {
        encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env["PATH"] ?? ""}` },
      })
        .split("\n")
        .filter((l) => l !== "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("T4: `exec` with no flags gets -i -t, because a handoff to no TTY hands over nothing", () => {
    // Measured live: `/exec c sh` without `-it` suspends the screen and the
    // child reads EOF from a pipe and exits at once. The round trip is correct
    // and the child never had a terminal to use.
    expect(argvFor(["exec", "api", "sh"])).toEqual(["exec", "-i", "-t", "api", "sh"]);
  });

  it("T5: it goes after the verb, not at the end", () => {
    // `run` takes the image and the child's command after its flags, and a flag
    // past them belongs to the child rather than to docker.
    expect(argvFor(["run", "alpine", "sh"])).toEqual(["run", "-i", "-t", "alpine", "sh"]);
  });

  it("T6: an explicit flag wins, and `-d` suppresses it entirely", () => {
    // Overriding what the caller said is not this file's business, and `-d`
    // with `-t` is docker's own error — F80's invocation.
    expect(argvFor(["exec", "-it", "api", "sh"])).toEqual(["exec", "-it", "api", "sh"]);
    expect(argvFor(["run", "-d", "nginx"])).toEqual(["run", "-d", "nginx"]);
    expect(argvFor(["run", "--detach", "nginx"])).toEqual(["run", "--detach", "nginx"]);
  });

  it("T7: a verb that is not a handoff is untouched", () => {
    expect(argvFor(["ps", "-a"])).toEqual(["ps", "-a"]);
  });
});
