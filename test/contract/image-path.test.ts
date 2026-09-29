// C04 I142, C09 I86 — the builder keeps the path it read, and the copy says it.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Block } from "../../src/data/viewmodel/index.js";
import { b } from "../../src/shell/builders/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { measurable } from "../support/render.js";

const ESC = String.fromCharCode(27);
/** The corpus's real 8x8 PNG, so the bytes on disk are ones the gates accept. */
const PNG = Buffer.from((ONE_PER_KIND.image as { data: string }).data, "base64");

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "image-path-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("C04 I142 — b.image({ path }) keeps the path", () => {
  it("T2.140 (C04 I142, C09 I86): the path is carried beside the bytes, copy is alt, a newline and the path with no blank line, a bytes-built image copies its alt alone, and the path is neutralised", () => {
    const kit = measurable();
    const path = join(dir, "square.png");
    writeFileSync(path, PNG);

    const read = b.image({ path, height: 3, alt: "a red square" });
    expect(read.path, "the path, as given").toBe(path);
    // **Beside the bytes, never instead of them**: the file was read.
    expect(read.data, "the file's bytes").toBe(readFileSync(path).toString("base64"));
    expect(kit.registry.copyOf(read), "alt, a newline, the path").toBe(`a red square\n${path}`);

    // **The structural case**: an `alt` ending in a newline meets the join's
    // own. A blank line is R-SEL-004's entry separator, so it would split one
    // image into two entries.
    const trailing = b.image({ path, height: 3, alt: "a red square\n" });
    expect(kit.registry.copyOf(trailing), "one newline, never a blank line").toBe(`a red square\n${path}`);

    // Built from bytes: no path, and the alt alone — a digest is not a path.
    const bytes = b.image({ data: read.data, height: 3, alt: "a red square" });
    expect("path" in bytes, "the bytes arm carries no path").toBe(false);
    expect(kit.registry.copyOf(bytes), "alt alone").toBe("a red square");

    // **Content like any other field** (C09 I127): a path is a filename, and a
    // filename can hold an escape.
    const poisoned = join(dir, `evil${ESC}[2J‮.png`);
    writeFileSync(poisoned, PNG);
    const copied = kit.registry.copyOf(b.image({ path: poisoned, height: 3, alt: "a" }) as Block) ?? "";
    expect(copied, "the path's escape, shown").toContain("evil^[[2J<U+202E>.png");
    expect(copied.includes(ESC), "no ESC in the copy").toBe(false);
  });
});
