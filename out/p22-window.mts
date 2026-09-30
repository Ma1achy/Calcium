import { patchDefinition } from "../src/presentation/patch/index.js";
import { PATCH_CORPUS } from "../test/support/blocks.js";
import { measurable, visible } from "../test/support/render.js";

const k = measurable({ definitions: [patchDefinition as never] });
const p = PATCH_CORPUS.find((b) => b.id === "patch-three-hunks")!;
console.log("whole");
k.renderToLines(p, 20).forEach((l, i) => console.log(i, JSON.stringify(visible(l))));
console.log(JSON.stringify(k.registry.elementsOf(p, 20).map((e) => [e.id, e.rows.from])));
const w = (patchDefinition.window as any)(p, 20, 5, 7, (b: any, wd: number) => k.measure(b, wd));
console.log("window", "skip", w.skipRows, "drop", w.dropRows);
console.log(JSON.stringify(w.block.hunks.map((h: any) => ({ c: h.collapsedBefore, header: h.header, lines: h.lines.map((l: any) => l.kind[0] + l.text) }))));
k.renderToLines(w.block, 20).forEach((l, i) => console.log(i, JSON.stringify(visible(l))));
console.log(JSON.stringify(k.registry.elementsOf(w.block, 20).map((e) => [e.id, e.rows.from])));
