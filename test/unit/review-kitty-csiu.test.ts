// Review instrument — QA N1 on PR 61: under kitty's keyboard protocol the
// selection chords arrive as CSI u with the shift bit set (`CSI 118;4u` for
// ⌥⇧V, `CSI 99;4u` for ⌥⇧C), and the bindings are spelled without it, so the
// chords reach nothing. RED at c7158c22 when written; green when the registry
// gains enhanced-terminal records for the two selection bindings or the slot
// spelling folds the shift bit for a capital.
import { describe, expect, it } from "vitest";

import { fakeStdin } from "../support/fake-terminal.js";
import { buildSession } from "../support/session.js";

const ESC = "\u001b";

describe("review — QA N1: selection chords under the kitty protocol", () => {
  it("⌥⇧V as CSI 118;4u enters semantic selection, as ESC V does", async () => {
    const stdin = fakeStdin();
    const { screen } = await buildSession({ stdin: stdin as never, capabilities: { keyboardProtocol: "kitty" } as never });
    const type = async (b: string): Promise<void> => {
      stdin.emit(b);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };
    const header = (): string => screen().rows[0] ?? "";
    await type(`${ESC}[118;4u`);
    expect(header(), "CSI 118;4u — the header shows COPY").toContain("COPY");
  });

  it("⌥⇧C as CSI 99;4u enters native selection, as ESC C does", async () => {
    const stdin = fakeStdin();
    const { screen } = await buildSession({ stdin: stdin as never, capabilities: { keyboardProtocol: "kitty" } as never });
    const type = async (b: string): Promise<void> => {
      stdin.emit(b);
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    };
    const header = (): string => screen().rows[0] ?? "";
    await type(`${ESC}[99;4u`);
    expect(header(), "CSI 99;4u — the header shows NATIVE").toContain("NATIVE");
  });

  it("control: ESC V still enters semantic selection (the base route)", async () => {
    const stdin = fakeStdin();
    const { screen } = await buildSession({ stdin: stdin as never, capabilities: { keyboardProtocol: "kitty" } as never });
    stdin.emit(`${ESC}V`);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(screen().rows[0] ?? "").toContain("COPY");
  });
});
