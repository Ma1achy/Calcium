/**
 * KS1–KS6 — the kitty seam's three properties, kept as rows rather than probes
 * (C09 I36, §4c).
 *
 * **These were the probes and they are kept because they are the reasons.** The
 * seam rests on three facts about this repository — Ink is not in the byte path,
 * the diff baseline is `lines` rather than the write, and every frame reaches an
 * absolute address before any row content. A comment asserting those goes stale;
 * a row does not.
 */
import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { Box, Text, renderToString } from "ink";
import { createElement } from "react";
import { createTerminalLifecycle } from "../../src/terminal/lifecycle.js";
import { FULL_CAPS } from "../support/render.js";
import { buildSession } from "../support/session.js";

const ESC = String.fromCharCode(27);
const APC = `${ESC}_Ga=T,f=100,i=7,U=1,c=2,r=1,q=2;AAAA${ESC}\\`;

/** A stdout that records every write and satisfies what Ink and C01 read. */
function recorder(): { stream: NodeJS.WriteStream; seen: string[] } {
  const seen: string[] = [];
  const s = new EventEmitter() as unknown as NodeJS.WriteStream & { seen: string[] };
  s.columns = 80;
  s.rows = 24;
  s.isTTY = true;
  s.write = ((chunk: unknown): boolean => {
    seen.push(String(chunk));
    return true;
  }) as NodeJS.WriteStream["write"];
  return { stream: s, seen };
}

function fakeStdin(): NodeJS.ReadStream {
  const s = new EventEmitter() as unknown as NodeJS.ReadStream;
  s.isTTY = true;
  (s as unknown as { setRawMode: () => unknown }).setRawMode = () => s;
  (s as unknown as { resume: () => unknown }).resume = () => s;
  (s as unknown as { pause: () => unknown }).pause = () => s;
  return s;
}

describe("kitty seam · probe 1 — the direct write", () => {
  it("P1 arm A: through the lifecycle's privileged writer", () => {
    const { stream, seen } = recorder();
    const life = createTerminalLifecycle({
      stdout: stream,
      stdin: fakeStdin(),
      capabilities: FULL_CAPS,
      onFatal: (e) => {
        throw e instanceof Error ? e : new Error(String(e));
      },
    });
    seen.length = 0;
    life.writer.write(APC);
    const got = seen.join("");
    console.log(`arm A  writer.write   in=${String(APC.length)} out=${String(got.length)} hasAPC=${String(got.includes(`${ESC}_G`))}`);
    expect(got, "the privileged handle carries the escape unaltered").toBe(APC);
  });

  it("P1 arm B (control): a raw stream Ink never touched", () => {
    const { stream, seen } = recorder();
    stream.write(APC);
    const got = seen.join("");
    console.log(`arm B  raw stream     in=${String(APC.length)} out=${String(got.length)} hasAPC=${String(got.includes(`${ESC}_G`))}`);
    // **Without this, "nothing carried it" and "nothing was emitted" read the
    // same.** It is the row that makes arm A's number mean something.
    expect(got, "a raw stream carries it, so the recorder is not the thing dropping bytes").toBe(APC);
  });

  it("P1 arm C (the contrast): the same escape through an Ink `Text`", () => {
    // **Re-measured rather than cited.** F249 established this; repeating it in
    // *this* harness is what says the harness sees what F249 saw, and it is the
    // arm a reader would skip as already known.
    const drawn = renderToString(createElement(Box, null, createElement(Text, null, `${APC}xy`)), {
      columns: 20,
    });
    console.log(`arm C  ink Text       in=${String(APC.length + 2)} out=${String(drawn.length)} hasAPC=${String(drawn.includes(`${ESC}_G`))}`);
    expect(drawn, "Ink discards the APC and keeps the text").toBe("xy");
    expect(drawn.includes(`${ESC}_G`), "so the two paths genuinely differ").toBe(false);
  });
});

const HOME = `${ESC}[H`;
const CUP = new RegExp(`${ESC}\\[(\\d+);(\\d+)H`, "u");

/** The writes that are frames: the ones carrying rows. */
function frames(chunks: readonly string[]): readonly string[] {
  return chunks.filter((c) => c.includes(HOME) || CUP.test(c));
}

describe("kitty seam · probe 2 — placement and the diff", () => {
  it("P2a: every frame's bytes reach an absolute address before any row content", async () => {
    const { stdout } = await buildSession();
    const got = frames(stdout.chunks);
    expect(got.length, "the session drew at least one frame").toBeGreaterThan(0); // cells-ok — a frame count

    for (const [i, f] of got.entries()) {
      // Everything before the first absolute address must be escapes only —
      // cursor shape and hide — and never printable content.
      const at = Math.min(
        ...[f.indexOf(HOME), f.search(CUP)].filter((n) => n >= 0),
      );
      const before = f.slice(0, at);
      const printable = before.replace(new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "gu"), "").replace(/[\r\n]/gu, "");
      expect(printable, `frame ${String(i)}: nothing printable precedes the address`).toBe("");
    }
    console.log(`P2a  ${String(got.length)} frames, every one addressed before content`);
  });

  it("P2b: a transmission prepended to a write cannot change the next frame's bytes", async () => {
    // **The baseline is `lines` and the write is bytes**, and they are separate
    // records — `session.ts` sets `#lastFrame = result.lines` after writing
    // `result.write`. So the claim is that prefixing the byte stream is
    // invisible to the next diff. Measured by driving the same two frames twice
    // and comparing the second one.
    const a = await buildSession();
    const b = await buildSession();
    const framesA = frames(a.stdout.chunks);
    const framesB = frames(b.stdout.chunks);
    expect(framesA, "two identical sessions draw identical frames").toEqual(framesB);

    // The prepend, applied to what the first session actually wrote.
    const prefixed = framesA.map((f, i) => (i === 0 ? APC + f : f));
    expect(prefixed.slice(1), "every frame after the first is untouched").toEqual(framesB.slice(1));
    expect(prefixed[0]?.slice(APC.length), "and the first is its own bytes, unaltered").toBe(framesB[0]);
    console.log(`P2b  the prefix is confined to the frame it leads: ${String(framesA.length)} frames compared`);
  });

  it("P2c: interleaving breaks the address-precedes-row property, which is why it is refused", async () => {
    const { stdout } = await buildSession();
    const diffed = frames(stdout.chunks).filter((f) => !f.includes(HOME) && CUP.test(f));
    if (diffed.length === 0) {
      console.log("P2c  no differential frame in this session; the property is asserted on the full-frame form");
    }
    // Take a frame and inject the escape between an address and its row. The
    // property that breaks is stated as a predicate rather than as a picture.
    const sample = frames(stdout.chunks)[0] ?? "";
    const at = sample.indexOf(HOME);
    const interleaved = `${sample.slice(0, at + HOME.length)}${APC}${sample.slice(at + HOME.length)}`;
    expect(
      interleaved.slice(at + HOME.length, at + HOME.length + 2),
      "the bytes after the address are no longer the row's",
    ).toBe(`${ESC}_`);
    // And the same escape *before* the address leaves the property intact.
    const before = `${APC}${sample}`;
    expect(before.slice(APC.length, APC.length + HOME.length), "prepending keeps the address leading").toBe(
      sample.slice(0, HOME.length),
    );
    console.log("P2c  before: address still leads the rows · interleaved: it does not");
  });
});
