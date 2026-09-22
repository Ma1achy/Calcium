import { readFileSync } from "node:fs";
const re = /file:\s*"([^"]+)",\s*\n\s*from:\s*("(?:[^"\\]|\\.)*")/g;
for (const f of ["c16-mouse-wiring.mjs", "c16-pointer-cursor.mjs"]) {
  const src = readFileSync(`/workspace/tools/mutate/runs/${f}`, "utf8");
  let m;
  while ((m = re.exec(src)) !== null) {
    const val = JSON.parse(m[2]);
    const tree = readFileSync(`/workspace/${m[1]}`, "utf8");
    const n = tree.split(val).length - 1;
    if (n !== 1) console.log(f, n, m[1], JSON.stringify(val.slice(0, 130)));
  }
}
