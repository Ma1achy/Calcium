/**
 * C23 I104 — a call head is toned per token (design check I2, §030, §081).
 */
import { describe, expect, it } from "vitest";

import { callHead, type ToolCallSpec } from "../../src/shell/documents.js";
import { CALL_STATE_TONE, type Notice, type Tone } from "../../src/data/viewmodel/index.js";
import { elapsed } from "../../src/presentation/blocks/index.js";
import { ASCII_CAPS, FULL_CAPS } from "../support/render.js";

/** The settled figure as the formatter draws it, so a change to its grain (§030) moves nothing here. */
const D = elapsed(4000);
const E = elapsed(3000);

const call = (spec: Partial<ToolCallSpec>): ToolCallSpec => ({ id: "c", name: "pytest", args: "tests/unit", ...spec }) as ToolCallSpec;

/** The head as `[slice, tone]` pairs — the spans' runs — and the block's own tone for what no span covers. */
function table(spec: Partial<ToolCallSpec>, caps = FULL_CAPS, tick = 0): readonly (readonly [string, Tone | "block", boolean])[] {
  const head = callHead(call(spec), caps, tick) as Notice;
  const out: [string, Tone | "block", boolean][] = [];
  let at = 0;
  for (const s of head.spans ?? []) {
    if (s.from > at) out.push([head.text.slice(at, s.from), "block", false]);
    out.push([head.text.slice(s.from, s.to), s.tone ?? "block", s.elide === true]);
    at = s.to;
  }
  if (at < head.text.length) out.push([head.text.slice(at), "block", false]);
  return out;
}

describe("C23 I104 — the call head's tones", () => {
  it("T1.108 (C23 I104, §030, §081): callHead over the states read as a table of span tones — the verb default, the argument identifier on the elide span, the furniture muted, the outcome in the block's tone", () => {
    expect(table({ elapsedMs: 4000, outcome: "47 passed" })).toEqual([
      ["pytest", "default", false],
      ["(", "muted", false],
      ["tests/unit", "identifier", true],
      [`) · ${D} · `, "muted", false],
      ["47 passed", "block", false],
    ]);
    // A bare verb has no parentheses and no argument span; a count of children is the outcome.
    expect(table({ args: "", elapsedMs: 3000, outcome: "4 of 11" })).toEqual([
      ["pytest", "default", false],
      [` · ${E} · `, "muted", false],
      ["4 of 11", "block", false],
    ]);
    // Running: the spinner and the figure are furniture and nothing is the outcome.
    const running = table({ elapsedMs: 3000 });
    expect(running.at(-1)?.[1], "running: the duration slot is muted").toBe("muted");
    expect(running.some(([, t]) => t === "block"), "running: no outcome").toBe(false);
    // Waiting: the spinner is muted and the word is the state's (warn).
    const waiting = table({ waiting: true });
    expect(waiting.at(-1), "the word is the state's").toEqual(["waiting", "block", false]);
    expect(waiting.at(-2)?.[1], "the spinner is furniture").toBe("muted");
    expect((callHead(call({ waiting: true }), FULL_CAPS) as Notice).text.endsWith("waiting")).toBe(true);
    // Stopped words take the state's tone through the block, with nothing per word (ruling 103).
    for (const word of ["denied", "expired", "cancelled"]) {
      const head = callHead(call({ elapsedMs: 1000, outcome: word }), FULL_CAPS) as Notice;
      expect(head.tone, word).toBe(CALL_STATE_TONE.cancelled);
      expect(table({ elapsedMs: 1000, outcome: word }).at(-1), word).toEqual([word, "block", false]);
    }
    expect(table({ elapsedMs: 1000, outcome: "exit 1" }).at(-1)).toEqual(["exit 1", "block", false]);
    // At the ASCII separator the same table with `:`.
    expect(table({ elapsedMs: 4000, outcome: "47 passed" }, ASCII_CAPS).map(([, t]) => t)).toEqual(["default", "muted", "identifier", "muted", "block"]);
    expect(table({ elapsedMs: 4000, outcome: "47 passed" }, ASCII_CAPS)[3]?.[0]).toBe(`) : ${D} : `);
  });
});
