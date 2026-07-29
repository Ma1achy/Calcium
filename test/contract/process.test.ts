// C21 tier 2 — contract. The interface, and the four things a source scan sees
// that a behavioural test cannot.
//
// T2.5 is the unusual one: it asserts at *compile* level that `spawn` cannot
// carry a shell string and `spawnShell` cannot carry an argv. `npm run check`
// type-checks `test/`, so a `@ts-expect-error` that stops being an error fails
// the build — which makes it the one assertion here that a passing run of this
// file would not catch on its own.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkModuleGraph } from "../../tools/enforce/module-graph.mjs";
import { checkSourceScans } from "../../tools/enforce/source-scans.mjs";
import { createUtf8Decoder } from "../../src/data/process/decode.js";
import { createProcessRunner } from "../../src/data/process/runner.js";
import { collect, scripts } from "../support/process.js";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const SOURCES = walk("src");

function runner() {
  return createProcessRunner({ env: process.env, stdin: {} });
}

describe("C21 decoding", () => {
  /**
   * Every rune width, at every alignment (T2.1).
   *
   * One-, two-, three- and four-byte characters in rotation, so that shifting
   * the chunk size by one moves the split into a different position inside a
   * different width of sequence. A payload of only emoji would exercise the
   * four-byte case at four offsets and nothing else.
   */
  const RICH = "a£€𝄞b¢中🎉c¥日本語🚀".repeat(24);

  it("T2.1 (I4): decoded byte-identically at every chunk size from 1 to 256", () => {
    const bytes = Buffer.from(RICH, "utf8");

    for (let size = 1; size <= 256; size += 1) {
      const decoder = createUtf8Decoder();
      let text = "";
      for (let at = 0; at < bytes.length; at += size) {
        text += decoder.push(bytes.subarray(at, Math.min(at + size, bytes.length)));
      }
      text += decoder.flush();

      expect(text, `chunk size ${size} produced mojibake`).toBe(RICH);
    }
  });

  it("T2.1 (I4): and at pipe-sized chunks over 2 MiB", () => {
    // The size claim rather than the offset claim. 2 MiB is where a real
    // streaming verb lives, and 65535/65536 straddle the boundary a naive
    // implementation is most likely to have special-cased.
    const payload = RICH.repeat(Math.ceil((2 * 1024 * 1024) / Buffer.byteLength(RICH)));
    const bytes = Buffer.from(payload, "utf8");
    expect(bytes.length).toBeGreaterThan(2 * 1024 * 1024);

    for (const size of [4096, 65535, 65536]) {
      const decoder = createUtf8Decoder();
      let text = "";
      for (let at = 0; at < bytes.length; at += size) {
        text += decoder.push(bytes.subarray(at, Math.min(at + size, bytes.length)));
      }
      text += decoder.flush();

      expect(text.length, `chunk size ${size}`).toBe(payload.length);
      expect(text === payload, `chunk size ${size} produced mojibake`).toBe(true);
    }
  });

  it("T2.1 (I4): a BOM the far side emitted is not silently eaten", () => {
    // `TextDecoder`'s default strips a leading U+FEFF. That is one byte sequence
    // the child wrote and the consumer would never see, and "byte-identical"
    // should not mean byte-identical apart from the case nobody tested.
    const decoder = createUtf8Decoder();
    expect(decoder.push(Buffer.from("﻿hi", "utf8")) + decoder.flush()).toBe("﻿hi");
  });

  it("T2.1 (I4): a real child's multi-byte output survives its chunk boundaries", async () => {
    // The decoder proven above, reached through the runner — because the wiring
    // is the other half of the claim and a correct decoder called on whole
    // chunks proves nothing about either.
    // Built inside the child: a 260 KB argv entry fails the spawn with `E2BIG`,
    // because Linux caps a single argument at 128 KiB. The runner reported that
    // correctly — `exited` resolved and the message arrived on stderr — and the
    // empty stdout still read exactly like a decoder dropping everything.
    const unit = "日本語🚀";
    const times = 20_000;
    const child = runner().spawn(scripts.emitRepeated(unit, times), { cwd: () => process.cwd() });

    expect(await collect(child.stdout)).toBe(unit.repeat(times));
  });
});

describe("C21 boundaries", () => {
  it("T2.2 (I3): no write to the real process.stdout in process/", () => {
    expect(checkSourceScans(SOURCES).filter((v) => v.rule === "SS26")).toEqual([]);
  });

  it("T2.3 (I12): the module graph shows no import from terminal/", () => {
    expect(checkModuleGraph(SOURCES).filter((v) => v.rule === "MG19")).toEqual([]);

    // And the rule can see this directory: a scan that matches nothing passes
    // exactly like a scan that is satisfied, which is SS26's whole history.
    const fabricated = checkModuleGraph(["src/data/process/runner.ts"], (file) =>
      file === "src/data/process/runner.ts"
        ? 'import type { X } from "../../terminal/lifecycle.js";'
        : readFileSync(file, "utf8"),
    ).filter((v) => v.rule === "MG19");
    expect(fabricated).toHaveLength(1);
  });

  it("T2.4 (I8, I11): no timer and no escalation logic in process/", () => {
    expect(checkSourceScans(SOURCES).filter((v) => v.rule === "SS27")).toEqual([]);
  });

  it("T2.7 (I14): no ambient environment or stdin read in process/", () => {
    expect(checkSourceScans(SOURCES).filter((v) => v.rule === "SS41")).toEqual([]);
  });

  it("T2.5 (I1): spawn cannot carry a shell string and spawnShell cannot carry an argv", () => {
    const r = runner();
    const opts = { cwd: (): string => process.cwd() };

    // A compile-level assertion. Each `@ts-expect-error` below fails the build
    // if the error stops being an error — which is what merging the two methods
    // behind a `shell: true` flag would do, and the reason they are two methods
    // rather than one with a boolean (D18).

    // @ts-expect-error — `spawn` takes an argv array, never a command string.
    r.spawn("echo a | tr a b", opts);

    // @ts-expect-error — `SpawnOptions` has no `shell`, so no call site can opt in.
    r.spawn(["echo", "a"], { ...opts, shell: true });

    // @ts-expect-error — `spawnShell` takes the string the user typed, not an argv.
    r.spawnShell(["echo", "a"], opts);

    expect(true).toBe(true);
  });

  it("T2.6 (I13): across a hundred spawns including failures, exited resolves every time", async () => {
    const r = runner();
    const opts = { cwd: (): string => process.cwd() };

    const children = Array.from({ length: 100 }, (_unused, n) =>
      n % 3 === 0
        ? r.spawn(["definitely-not-a-binary-xyzzy"], opts)
        : r.spawn(scripts.exit(n % 7), opts),
    );

    // The assertion is that all hundred settle. A pending `exited` on one
    // spawn-failure path is a verb that hangs forever, and it would show here as
    // a timeout rather than as a wrong value.
    const exits = await Promise.all(children.map((child) => child.exited));

    expect(exits).toHaveLength(100);
    expect(exits.filter((e) => e.code === null)).toHaveLength(34);
    expect(r.live).toHaveLength(0);
  });
});
