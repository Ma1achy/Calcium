import { cells } from "../src/presentation/text.js";
for (const [n,c] of [["focus ▸","▸"],["collapsed ▹","▹"],["expanded ▿","▿"],["sort-desc ▾","▾"],["sort-asc ▴","▴"],["up ↑","↑"],["down ↓","↓"],["quote ⎸","⎸"],["live ▌","▌"],["nested ⁃","⁃"]] as [string,string][]) console.log(n, cells(c,"narrow")+"/"+cells(c,"wide"));
