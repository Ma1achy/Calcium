import { cells } from "../src/presentation/text.js";
for (const [n,c] of [["em dash —","—"],["box horizontal ─","─"],["ellipsis ⋯","⋯"],["residue ascii ...","..."],["tilde ~","~"]] as [string,string][]) console.log(n, cells(c,"narrow")+"/"+cells(c,"wide"));
