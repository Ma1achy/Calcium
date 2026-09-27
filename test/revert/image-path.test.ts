// C04 I142 — tier 6. The row names the change that makes it fail; the mutation
// pass (`c04-image-path`) makes it mechanically.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { b } from "../../src/shell/builders/index.js";
import { ONE_PER_KIND } from "../support/blocks.js";
import { measurable } from "../support/render.js";

describe("C04 I142 — tier 6", () => {
  it("T6.105 (C04 I142): the builder dropping the path it read → T2.139 fails on path and on the copy", () => {
    // **The state this invariant replaced**, and the one a reader cannot tell
    // from a picture built from bytes: a copy of the alt alone. The row asserts
    // the two artefacts differ, so a builder that drops the path makes them equal.
    const dir = mkdtempSync(join(tmpdir(), "image-path-"));
    try {
      const path = join(dir, "square.png");
      writeFileSync(path, Buffer.from((ONE_PER_KIND.image as { data: string }).data, "base64"));
      const kit = measurable();
      const read = b.image({ path, height: 3, alt: "a" });
      const bytes = b.image({ data: read.data, height: 3, alt: "a" });
      expect(kit.registry.copyOf(read), "a file-built image copies differently from a bytes-built one").not.toBe(
        kit.registry.copyOf(bytes),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
