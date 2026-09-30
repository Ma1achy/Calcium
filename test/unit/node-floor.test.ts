// A01 §Host assumptions — the Node floor is Unicode 17's. `cells()` segments
// through `Intl.Segmenter`, so the Unicode version the measurer sees is Node's
// ICU, and v22.22.1 is the first Node 22 shipping Unicode 17 (ICU 78.2).
//
// **Why a row and not only `engines`.** `engine-strict=true` binds an install in
// this checkout and nothing at run time: a suite started under v22.22.0 runs,
// and measures U+00AD and 27 combining marks from U+1ACF differently from the
// property (C09 T1.38, T6.114 — measured). Running this file under v22.22.0 →
// NF1 fails, naming the version it saw.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RANGE = ">=22.22.1 <23";

describe("A01 §Host assumptions — the Node floor", () => {
  it("NF1 (A01 §Host assumptions): the running Node ships Unicode 17.0", () => {
    expect(process.versions.unicode, `Node ${process.version} ships Unicode ${String(process.versions.unicode)}; the floor is v22.22.1`).toBe("17.0");
  });

  it("NF2 (A01 §Host assumptions): the running Node is inside the declared range", () => {
    const [major, minor, patch] = process.versions.node.split(".").map(Number) as [number, number, number];
    const inside = major === 22 && (minor > 22 || (minor === 22 && patch >= 1));
    expect(inside, `Node ${process.version} against ${RANGE}`).toBe(true);
  });

  it("NF3 (A01 §Host assumptions): every package and lockfile root in the repository declares the one range", () => {
    // **By equality over the set**, so an example left on `>=22` fails here —
    // it runs the same measurer.
    const read = (f: string) => JSON.parse(readFileSync(f, "utf8")) as { engines?: { node?: string }; packages?: Record<string, { engines?: { node?: string } }> };
    const found: Record<string, string | undefined> = {};
    for (const f of ["package.json", "examples/docker/package.json", "examples/minimal/package.json", "examples/plots/package.json"]) {
      found[f] = read(f).engines?.node;
    }
    for (const [f, keys] of [["package-lock.json", ["", "examples/docker", "examples/plots"]], ["examples/minimal/package-lock.json", ["", "../.."]]] as const) {
      const lock = read(f);
      for (const k of keys) found[`${f}#${k}`] = lock.packages?.[k]?.engines?.node;
    }
    expect(Object.keys(found)).toHaveLength(9);
    expect(Object.entries(found).filter(([, v]) => v !== RANGE)).toEqual([]);
  });
});
