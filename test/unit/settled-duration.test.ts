// C09 T1.153 — a settled duration, always drawn and as fine as its size (I140).
import { describe, expect, it } from "vitest";

import { elapsed, settled } from "../../src/presentation/blocks/index.js";

describe("C09 T1.153 — a settled duration", () => {
  it.each([
    [0, "0.00s"],
    [4, "0.00s"],
    [5, "0.01s"],
    [20, "0.02s"],
    [94, "0.09s"],
    [96, "0.1s"],
    [300, "0.3s"],
    [2000, "2.0s"],
    [4200, "4.2s"],
    [9940, "9.9s"],
    [9960, "10s"],
    [47_000, "47s"],
    [99_400, "99s"],
    [99_600, "1m 40s"],
    [151_000, "2m 31s"],
  ])("T1.153 (C09 I140, §030, §081): %d ms reads %s", (ms, text) => {
    expect(settled(ms)).toBe(text);
  });

  it("T1.153 (C09 I140): a negative or non-finite input has nothing to state", () => {
    for (const ms of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(settled(ms)).toBe("");
  });

  it("T1.153 (C09 I140): the live counter did not move with it — nothing under a second, whole seconds above", () => {
    expect([elapsed(0), elapsed(400), elapsed(4200)]).toEqual(["", "", "4s"]);
  });
});
