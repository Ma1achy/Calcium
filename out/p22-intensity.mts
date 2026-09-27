import xterm from "@xterm/headless";
import { normaliseRow } from "../src/presentation/rows.js";
import { paint } from "../src/presentation/blocks/paint.js";

const spans = [
  { text: "18", style: { bold: true, dim: true } },
  { text: " ", style: { bold: true } },
  { text: "ctx", style: { bold: true } },
];
const painted = paint(spans as never);
const row = normaliseRow(painted);
console.log("painted   ", JSON.stringify(painted));
console.log("normalised", JSON.stringify(row));
for (const [name, bytes] of [["painted", painted], ["normalised", row]] as const) {
  const t = new xterm.Terminal({ cols: 20, rows: 2, allowProposedApi: true });
  await new Promise<void>((r) => t.write(bytes, r));
  const line = t.buffer.active.getLine(0)!;
  const cells = [...Array(6).keys()].map((i) => {
    const c = line.getCell(i)!;
    return `${c.getChars() || "·"}:${c.isBold() ? "B" : "-"}${c.isDim() ? "D" : "-"}`;
  });
  console.log(name.padEnd(10), cells.join(" "));
}
