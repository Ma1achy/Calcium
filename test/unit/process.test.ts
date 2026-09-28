// C21 tier 1 — unit. Real short-lived processes, nothing mocked.
//
// The spec is explicit about this and it is worth restating where someone will
// be tempted: **the value of this component is entirely in its interaction with
// the OS.** A `ProcessRunner` tested against a fake `child_process` asserts that
// the code calls the functions it calls, which is the one thing that was never
// in doubt. Every test here spawns.
//
// The runner takes `env` and `stdin` by injection (I14), so a test that needs a
// particular environment or a raw-mode terminal states it as a value instead of
// mutating the process it runs in.
import { describe, expect, it } from "vitest";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { collect, scripts } from "../support/process.js";
import { mkdirSync, readdirSync } from "node:fs";
import { delimiter, isAbsolute, join, relative as relativePath } from "node:path";
import { findClipboardTool, writeClipboard } from "../../src/data/process/clipboard.js";
import { RECORDS, recorded, removeDir, runPath, stub, toolDir } from "../support/clipboard-tools.js";

const here = (): string => process.cwd();

/** A runner with nothing unusual about it. Each test overrides what it needs. */
function runner(over: { env?: NodeJS.ProcessEnv; isRaw?: boolean; debug?: (l: string) => void } = {}) {
  return createProcessRunner({
    env: over.env ?? process.env,
    stdin: over.isRaw === undefined ? {} : { isRaw: over.isRaw },
    ...(over.debug === undefined ? {} : { debug: over.debug }),
  });
}

describe("C21 spawning", () => {
  it("T1.1: spawn(['echo','hi']) → stdout yields hi, exit code 0", async () => {
    const child = runner().spawn(["echo", "hi"], { cwd: here });

    expect(await collect(child.stdout)).toBe("hi\n");
    expect(await child.exited).toEqual({ code: 0, signal: null });
  });

  it("T1.2 (I1): shell metacharacters in argv are passed literally — no expansion, no injection", async () => {
    // The security-relevant assertion of the whole component. If any of this
    // reached a shell, `whoami` and `id` would run and the output would be a
    // username rather than the string that was asked for.
    const hostile = "; | $(whoami) `id` && rm -rf / > /dev/null";
    const child = runner().spawn(["printf", "%s", hostile], { cwd: here });

    expect(await collect(child.stdout)).toBe(hostile);
    expect(await child.exited).toEqual({ code: 0, signal: null });
  });

  it("T1.3: exited resolves with the child's code", async () => {
    const child = runner().spawn(scripts.exit(7), { cwd: here });

    expect(await child.exited).toEqual({ code: 7, signal: null });
    expect(child.running).toBe(false);
  });

  it("T1.4: a child exiting on a signal → code null, signal set", async () => {
    const r = runner();
    const child = r.spawn(scripts.ignoring([]), { cwd: here });
    await firstChunk(child.stdout);

    expect(child.signal("SIGKILL")).toBe(true);
    expect(await child.exited).toEqual({ code: null, signal: "SIGKILL" });
  });

  it("T1.5 (I3): stdout and stderr arrive separately, and neither contains the other", async () => {
    const child = runner().spawn(scripts.emitBoth("to-out", "to-err"), { cwd: here });

    const [out, err] = await Promise.all([collect(child.stdout), collect(child.stderr)]);

    expect(out).toBe("to-out");
    expect(err).toBe("to-err");
    expect(out).not.toContain("to-err");
    expect(err).not.toContain("to-out");
  });

  it("T1.6: spawnShell('echo a | tr a b') yields b — the shell handled the pipe", async () => {
    const child = runner().spawnShell("echo a | tr a b", { cwd: here });

    expect(await collect(child.stdout)).toBe("b\n");
    expect(await child.exited).toEqual({ code: 0, signal: null });
  });

  it("T1.7 (I10): cwd is read at spawn, so two spawns land in two directories", async () => {
    // The `cd` built-in moves what `cwd()` returns between calls. Captured at
    // construction, the second child would run where the first did.
    let directory = "/usr";
    const r = runner();
    const opts = { cwd: (): string => directory };

    const first = r.spawn(scripts.pwd(), opts);
    expect(await collect(first.stdout)).toBe("/usr");

    directory = "/tmp";
    const second = r.spawn(scripts.pwd(), opts);
    expect(await collect(second.stdout)).toBe("/tmp");
  });

  it("T1.8 (I2): signal('SIGTERM') is delivered and the child exits", async () => {
    const r = runner();
    const child = r.spawn(scripts.ignoring([]), { cwd: here });
    await firstChunk(child.stdout);

    expect(child.signal("SIGTERM")).toBe(true);
    expect(await child.exited).toEqual({ code: null, signal: "SIGTERM" });
    expect(r.live).toHaveLength(0);
  });

  it("T1.9 (I13): a non-existent binary resolves exited, pid null, no unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => void rejections.push(reason);
    process.on("unhandledRejection", onRejection);

    try {
      const child = runner().spawn(["definitely-not-a-binary-xyzzy"], { cwd: here });

      expect(await child.exited).toEqual({ code: null, signal: null });
      expect(child.pid).toBeNull();
      // The message is on stderr, where a caller already looks — so a mistyped
      // binary is reported by the same path as a binary that ran and failed.
      expect(await collect(child.stderr)).toMatch(/ENOENT|not.*found/i);
      await new Promise<void>((resolve) => void setImmediate(resolve));
      expect(rejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("T1.10: env overrides reach the child and the rest of the environment is inherited", async () => {
    const r = runner({ env: { ...process.env, BASE_ONLY: "from-runner" } });

    const overridden = r.spawn(scripts.readEnv("PROBE"), {
      cwd: here,
      env: { ...process.env, PROBE: "from-opts" },
    });
    expect(await collect(overridden.stdout)).toBe("from-opts");

    // The overlay is the part that is easy to get wrong: passing `opts.env`
    // through alone replaces the environment wholesale, and the runner's own
    // base disappears along with everything else.
    const inherited = r.spawn(scripts.readEnv("BASE_ONLY"), {
      cwd: here,
      env: { PROBE: "from-opts" },
    });
    expect(await collect(inherited.stdout)).toBe("from-runner");
  });
});

/** Wait for the first chunk a child writes — proof it is running, without a timer. */
async function firstChunk(source: AsyncIterable<string>): Promise<string> {
  for await (const chunk of source) return chunk;
  return "";
}

describe("C21 the clipboard tool (I20)", () => {
  it("T1.14 (I20): found by walking PATH in code, gated by display and by SSH, never in a relative entry", () => {
    const dir = toolDir();
    try {
      // The absent arm first, and constructed: an empty directory is the whole PATH.
      expect(findClipboardTool({ PATH: dir }), "an empty PATH directory holds no tool").toBeNull();
      expect(findClipboardTool({}), "and no PATH at all").toBeNull();

      stub(dir, "pbcopy");
      const found = findClipboardTool({ PATH: dir });
      expect(found?.name).toBe("pbcopy");
      expect(found?.path, "resolved to an absolute path").toBe(join(dir, "pbcopy"));
      expect(isAbsolute(found?.path ?? "")).toBe(true);
      expect(found?.args).toEqual([]);

      // W6: found is not reachable. Over SSH this host's pasteboard is not the reader's.
      expect(findClipboardTool({ PATH: dir, SSH_CONNECTION: "10.0.0.1 5 10.0.0.2 22" })).toBeNull();
      expect(findClipboardTool({ PATH: dir, SSH_TTY: "/dev/pts/3" })).toBeNull();
      expect(findClipboardTool({ PATH: dir, SSH_TTY: "" }), "an empty variable is unset").not.toBeNull();

      // W8 and W7: a display-bound tool needs its display, and SSH does not refuse it —
      // the variable names the display `ssh -X` forwarded.
      const x = toolDir();
      try {
        stub(x, "xclip");
        expect(findClipboardTool({ PATH: x }), "no DISPLAY").toBeNull();
        expect(findClipboardTool({ PATH: x, DISPLAY: ":0" })?.name).toBe("xclip");
        expect(findClipboardTool({ PATH: x, DISPLAY: "localhost:10.0", SSH_CONNECTION: "a" })?.name).toBe("xclip");
        expect(findClipboardTool({ PATH: x, DISPLAY: ":0" })?.args).toEqual(["-selection", "clipboard"]);
        // The table's order, not PATH's: xsel in an earlier directory still loses to xclip.
        const s2 = toolDir();
        try {
          stub(s2, "xsel");
          expect(findClipboardTool({ PATH: `${s2}${delimiter}${x}`, DISPLAY: ":0" })?.name).toBe("xclip");
          expect(findClipboardTool({ PATH: s2, DISPLAY: ":0" })?.args).toEqual(["--clipboard", "--input"]);
          // W9: wl-copy before the X tools when both displays are set.
          stub(s2, "wl-copy");
          expect(findClipboardTool({ PATH: `${x}${delimiter}${s2}`, DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0" })?.name)
            .toBe("wl-copy");
          expect(findClipboardTool({ PATH: `${x}${delimiter}${s2}`, DISPLAY: ":0" })?.name, "and not without its own")
            .toBe("xclip");
        } finally {
          removeDir(s2);
        }
      } finally {
        removeDir(x);
      }

      // Not a tool: a file without the execute bit, and a directory with the name.
      const odd = toolDir();
      try {
        stub(odd, "pbcopy", RECORDS, 0o644);
        expect(findClipboardTool({ PATH: odd }), "not executable").toBeNull();
        const nested = toolDir();
        try {
          mkdirSync(join(nested, "pbcopy"));
          expect(findClipboardTool({ PATH: nested }), "a directory").toBeNull();
        } finally {
          removeDir(nested);
        }
      } finally {
        removeDir(odd);
      }

      // W13: a relative entry is never searched. The same directory, named relative to
      // the working directory the lookup would resolve it against — so a search that
      // took relative entries would find this stub, which is what makes the arm a control.
      const relative = relativePath(process.cwd(), dir);
      expect(isAbsolute(relative)).toBe(false);
      expect(findClipboardTool({ PATH: relative }), "the stub named relatively").toBeNull();
      expect(findClipboardTool({ PATH: `${relative}${delimiter}.${delimiter}` })).toBeNull();
      expect(findClipboardTool({ PATH: dir }), "and the same stub named absolutely").not.toBeNull();
    } finally {
      removeDir(dir);
    }
  });

  it("T1.15 (I20, I1): a fixed argv and the text on stdin, byte-identical, with no shell", async () => {
    const dir = toolDir();
    try {
      stub(dir, "pbcopy");
      const tool = findClipboardTool({ PATH: dir });
      expect(tool).not.toBeNull();
      const text = "a; b | c $(touch pwned) `touch pwned2` \"q\"\nline two \u001b[31mred\u001b[0m 🦀 é";
      const env = { PATH: runPath(dir), CALCIUM_PROBE: "present" };
      const wrote = await writeClipboard(tool!, text, { env, cwd: () => dir });

      expect(wrote).toEqual({ ok: true, tool: "pbcopy" });
      expect(recorded(dir, "pbcopy", "stdin"), "stdin carries the text, byte for byte").toEqual(Buffer.from(text, "utf8"));
      expect(recorded(dir, "pbcopy", "argv")?.toString(), "pbcopy's argv is empty").toBe("");
      // The environment reached the tool — and the text did not travel in it.
      const seen = recorded(dir, "pbcopy", "env")?.toString() ?? "";
      expect(seen).toContain("CALCIUM_PROBE=present");
      expect(seen).not.toContain("touch pwned");
      // Nothing expanded: no shell read `$(…)` or the backticks.
      expect(readdirSync(dir).filter((f) => f.startsWith("pwned")), "no command ran").toEqual([]);

      // xclip's literal argv, and the same bytes.
      stub(dir, "xclip");
      const x = findClipboardTool({ PATH: dir, DISPLAY: ":0", SSH_TTY: "/dev/pts/1" });
      expect(x?.name).toBe("xclip");
      expect(await writeClipboard(x!, text, { env: { PATH: runPath(dir) }, cwd: () => dir })).toEqual({ ok: true, tool: "xclip" });
      expect(recorded(dir, "xclip", "argv")?.toString()).toBe("[-selection][clipboard]");
      expect(recorded(dir, "xclip", "stdin")).toEqual(Buffer.from(text, "utf8"));

      // clip.exe reads UTF-16LE after a byte-order mark (W17).
      const win = toolDir();
      try {
        stub(win, "clip.exe");
        const clip = findClipboardTool({ PATH: win });
        expect(clip).toMatchObject({ name: "clip.exe", encoding: "utf-16le" });
        await writeClipboard(clip!, "é🦀", { env: { PATH: runPath(win) }, cwd: () => win });
        expect(recorded(win, "clip.exe", "stdin")).toEqual(
          Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("é🦀", "utf16le")]),
        );
      } finally {
        removeDir(win);
      }
    } finally {
      removeDir(dir);
    }
  });
});
