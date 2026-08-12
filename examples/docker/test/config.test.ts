/**
 * S8 `/config <c> <path>`. Every test names the walk row it holds.
 *
 * The fixture is `dtui-cfg` — `nginx:alpine` with a 16-line `default.conf`
 * bind-mounted over the 44-line one the image ships. That pair is **part of the
 * surface** rather than a test convenience (walk B2): a plain `nginx:alpine`
 * container has the file byte-identical, so the drawing's premise that a
 * container's config differs from its image's is only true of a container
 * somebody set up that way.
 *
 * **The far side is injected.** Every arm below is a state the daemon reaches
 * only sometimes — an image pulled since, a container stopped between two calls
 * — and walk A1's is not reachable by removing anything at all. A seam is how
 * the wiring gets tested rather than the mechanism.
 */

import { describe, expect, it } from "vitest";
import type { Block, Notice, Patch } from "@fmx/calcium";
import {
  candidates,
  createConfigHandler,
  diffLines,
  hunksOf,
  wholeFile,
  type Far,
} from "../src/config.ts";

import { localContext } from "@fmx/calcium/testing";
const IMAGE_CONF = [
  "server {",
  "    listen       80;",
  "    server_name  localhost;",
  "",
  "    location / {",
  "        root   /usr/share/nginx/html;",
  "        index  index.html index.htm;",
  "    }",
  "",
  "    error_page   500 502 503 504  /50x.html;",
  "    location = /50x.html {",
  "        root   /usr/share/nginx/html;",
  "    }",
  "}",
].join("\n");

/** The mounted replacement: one line added, one changed. */
const RUNNING_CONF = IMAGE_CONF.replace(
  "    location / {",
  "    client_max_body_size 50M;\n\n    location / {",
).replace("        root   /usr/share/nginx/html;\n        index", "        root   /var/www/app;\n        index");

const far = (over: Partial<Far> = {}): Far => ({
  facts: () => Promise.resolve({ image: "nginx:alpine", mounts: ["/etc/nginx/conf.d/default.conf"] }),
  running: () => Promise.resolve(RUNNING_CONF),
  fromImage: () => Promise.resolve(IMAGE_CONF),
  ...over,
});

const ctx = { ...localContext(), command: "/config dtui-cfg /etc/nginx/conf.d/default.conf" };
const ARGV = ["dtui-cfg", "/etc/nginx/conf.d/default.conf"];

const patchOf = (doc: { blocks: readonly Block[] }): Patch | undefined =>
  doc.blocks.find((bl) => bl.kind === "patch") as Patch | undefined;
const noticesOf = (doc: { blocks: readonly Block[] }): readonly Notice[] =>
  doc.blocks.filter((bl) => bl.kind === "notice") as Notice[];

// ── The diff ────────────────────────────────────────────────────────────────

describe("the diff", () => {
  it("C1 (walk B4): the app's own LCS produces the three line kinds", () => {
    const lines = diffLines(["a", "b", "c"], ["a", "x", "c"]);
    expect(lines.map((l) => l.kind)).toEqual(["context", "remove", "add", "context"]);
    // Numbers on the side each line belongs to, and only that side.
    expect(lines[1]?.oldNo).toBe(2);
    expect(lines[1]?.newNo).toBeUndefined();
    expect(lines[2]?.newNo).toBe(2);
    expect(lines[2]?.oldNo).toBeUndefined();
  });

  it("C2: identical input produces context and nothing else", () => {
    // The control for C3 — without it, C3 passes against a differ that never
    // reports a change at all.
    const lines = diffLines(["a", "b"], ["a", "b"]);
    expect(lines.every((l) => l.kind === "context")).toBe(true);
  });

  it("C3 (walk B4): a hunk keeps three lines of context and elides the rest", () => {
    const before = Array.from({ length: 30 }, (_, i) => `line ${String(i)}`);
    const after = [...before];
    after[15] = "changed";
    const hunks = hunksOf(diffLines(before, after));

    expect(hunks).toHaveLength(1);
    // Three above, three below, plus the remove and the add.
    expect(hunks[0]?.lines).toHaveLength(8);
    // **The elision is reported, or the reader thinks the file starts at 13.**
    expect(hunks[0]?.collapsedBefore).toBe(12);
  });

  it("C4 (F41): what is elided BELOW the last hunk is not expressible", () => {
    // `Patch.collapsedAfter` exists for it and `b.patch` does not pass it, so a
    // patch can say what it skipped above and not below. Asserted rather than
    // only filed: this is a real 14 lines of a 30-line file that simply stop.
    const before = Array.from({ length: 30 }, (_, i) => `line ${String(i)}`);
    const after = [...before];
    after[5] = "changed";
    const hunks = hunksOf(diffLines(before, after));
    const shown = hunks.reduce((n, h) => n + h.lines.length, 0);
    const elidedAbove = hunks.reduce((n, h) => n + (h.collapsedBefore ?? 0), 0);
    // 31 lines of diff (30 context-ish + one add), and neither figure covers
    // the tail — the gap is what F41 is about.
    expect(shown + elidedAbove).toBeLessThan(31);
  });

  it("C5 (walk A1): with no baseline the whole file is one hunk, not none", () => {
    // **The implementation found this, not the walk.** A1 rules that the block
    // survives a missing image side; running the all-context lines through
    // `hunksOf` returns *nothing*, because it keeps only what is near a change
    // — an empty patch block, which is the exact failure A1 rules out.
    const lines = diffLines(["a", "b", "c"], ["a", "b", "c"]);
    expect(hunksOf(lines), "the function written for changes finds none").toHaveLength(0);
    expect(wholeFile("/etc/x.conf", lines), "so a different one holds the file").toHaveLength(1);
    expect(wholeFile("/etc/x.conf", lines)[0]?.lines).toHaveLength(3);
  });
});

// ── The verb ────────────────────────────────────────────────────────────────

describe("the verb", () => {
  it("C6: a real pair renders hunks and a tally", async () => {
    const doc = await createConfigHandler(far())(ARGV, ctx);
    expect(doc.status).toBe("ok");
    const patch = patchOf(doc);
    expect(patch?.path).toBe("/etc/nginx/conf.d/default.conf");
    expect(patch?.language, "so the highlighter has a grammar to use").toBe("nginx");
    expect((patch?.hunks.length ?? 0)).toBeGreaterThan(0);
    expect(patch?.hunks.flatMap((h) => h.lines).some((l) => l.kind === "add")).toBe(true);
    expect(noticesOf(doc).map((n) => n.text).join(" ")).toMatch(/hunk/u);
  });

  it("C7 (walk B3): files that agree still render a block, and say so", async () => {
    // **`/drift`'s B4 in an unrelated verb**, which is what makes it a class:
    // any block computed from two sources needs a rendering for *they agree*.
    // An empty block is indistinguishable from a call that failed.
    const doc = await createConfigHandler(far({ running: () => Promise.resolve(IMAGE_CONF) }))(
      ARGV,
      ctx,
    );
    expect(doc.status).toBe("ok");
    expect(patchOf(doc), "the block survives having nothing to report").toBeDefined();
    expect(noticesOf(doc).map((n) => n.text).join(" ")).toContain("no drift");
    // **The verdict must survive without colour**, which is F34's rule rather
    // than C04 I6's — I6 requires a glyph for `error` and `warn` only, and
    // `b.notice.ok` therefore produces none. The first version of this row
    // asserted a glyph on every notice and was demanding more than the spec
    // does; what actually matters is that the sentence says the verdict and
    // that the glyph column is not empty for it.
    const verdict = noticesOf(doc).find((n) => n.text.includes("no drift"));
    expect(verdict?.glyph, "the verdict is not tone-only").toBe("ok");
    expect(verdict?.text, "and the sentence says it without any styling").toContain("no drift");
  });

  it("C8 (walk A1): a missing image side keeps the block and says why beside it", async () => {
    // Must match `/drift`'s A1, or the app means two things by a missing side.
    const doc = await createConfigHandler(far({ fromImage: () => Promise.resolve(null) }))(
      ARGV,
      ctx,
    );
    expect(doc.status, "the running file is still worth showing").toBe("ok");
    const patch = patchOf(doc);
    expect(patch, "the block survives the missing side").toBeDefined();
    expect(patch?.hunks.flatMap((h) => h.lines).length, "holding the whole file").toBeGreaterThan(
      10,
    );
    expect(patch?.hunks.flatMap((h) => h.lines).every((l) => l.kind === "context")).toBe(true);
    expect(noticesOf(doc).map((n) => n.text).join(" ")).toContain("unavailable");
  });

  it("C9 (walk A2): a missing running side is the whole verb's failure", async () => {
    // **The opposite ruling on what looks like the same shape**, and the reason
    // is the asymmetry: the running file is the subject and the image file is
    // the baseline. There is no useful patch of the image's file against
    // nothing — that is just the image's file, which nobody asked for.
    const doc = await createConfigHandler(far({ running: () => Promise.resolve(null) }))(
      ARGV,
      ctx,
    );
    expect(doc.status).toBe("error");
    expect(doc.error, "C04 I3, and its absence is silent").toBeDefined();
    expect(patchOf(doc), "and no block pretending to hold a file").toBeUndefined();
  });

  it("C10 (walk A2): the running side is read first, so a stopped container costs nothing", async () => {
    // The ordering is a ruling and not an accident, so it is asserted. Without
    // this row the two calls could be swapped and every other row still pass —
    // the reader would just wait 442ms to be told the container is stopped.
    const order: string[] = [];
    const doc = await createConfigHandler({
      facts: () => {
        order.push("facts");
        return Promise.resolve({ image: "nginx:alpine", mounts: [] });
      },
      running: () => {
        order.push("running");
        return Promise.resolve(null);
      },
      fromImage: () => {
        order.push("image");
        return Promise.resolve(IMAGE_CONF);
      },
    })(ARGV, ctx);

    expect(doc.status).toBe("error");
    expect(order, "the image is never asked for").toEqual(["facts", "running"]);
  });

  it("C11 (walk B1): the bare form offers the mounts rather than guessing", async () => {
    // `.Mounts` gives `Type: "bind"` for a file and for a directory with no
    // distinguishing field, so discovery cannot be ruled in. The set is the
    // honest answer; picking from it would be a guess wearing a feature's name.
    const doc = await createConfigHandler(far())(["dtui-cfg"], { ...localContext(), command: "/config dtui-cfg" });
    expect(doc.status).toBe("error");
    expect(doc.error).toBeDefined();
    expect(JSON.stringify(doc.blocks)).toContain("/etc/nginx/conf.d/default.conf");
  });

  it("C12: a container with no bind mounts says that, rather than showing an empty list", async () => {
    const blocks = candidates([]);
    expect((blocks[0] as Notice).text).toContain("no bind mounts");
    expect(blocks).toHaveLength(1);
  });

  it("C13: a container that does not exist is refused before either read", async () => {
    const doc = await createConfigHandler(far({ facts: () => Promise.resolve(null) }))(
      ["nope", "/x"],
      { ...localContext(), command: "/config nope /x" },
    );
    expect(doc.status).toBe("error");
    expect((doc.blocks[0] as Notice).text).toContain("no such container");
  });
});
