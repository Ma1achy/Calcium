// C04 I143, §3g.1 — an image's path, at the validation gate and the builder's.
import { describe, expect, it } from "vitest";

import { validateDocument } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";

const doc = (extra: Readonly<Record<string, unknown>>): unknown => ({
  schema: "tui.view/1",
  command: "x",
  status: "ok",
  meta: {
    verb: null, adapter: "shell", stderr: "", exitCode: 0, durationMs: 1,
    truncated: false, argv: ["x"], transport: "subprocess", origin: "user",
  },
  blocks: [{ ...ONE_PER_KIND.image, ...extra }],
});
const errors = (value: unknown): string => {
  const v = validateDocument(value);
  return v.ok ? "" : v.error.join("\n");
};

describe("C04 I143 — Image.path is a non-empty string", () => {
  it('T1.62 (C04 I143): a path of 42, null or "" is refused naming "path", absent and "a.png" validate, and b.image({ path: "" }) throws before any read', () => {
    // **The control first**: the corpus image validates as it stands, and with a path.
    expect(errors(doc({})), "no path — the bytes arm").toBe("");
    expect(errors(doc({ path: "a.png" })), "a path beside the bytes").toBe("");
    for (const bad of [42, null, ""]) {
      expect(errors(doc({ path: bad })), JSON.stringify(bad)).toMatch(/"path".*\(C04 I143\)/u);
    }
    // **The builder's rule, not the filesystem's** — `readFileSync("")` throws
    // ENOENT on its own, which would read as a refusal while naming nothing.
    expect(() => b.image({ path: "", height: 3, alt: "a square" })).toThrow(/"path" cannot be empty \(C04 I143\)/u);
  });
});
