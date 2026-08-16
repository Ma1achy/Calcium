import { cells } from "../src/presentation/text.js";
const D = "⠄⠔⠖⠶⠷⠿⡿⣿";
const pop = (c: string) => (c.codePointAt(0)! - 0x2800).toString(2).split("").filter((b) => b === "1").length;
console.log("density", JSON.stringify(D), "pops", [...D].map(pop).join(","),
  "narrow", [...D].every((c) => cells(c) === 1), "wide", [...D].every((c) => cells(c, "wide") === 1),
  "unique", new Set([...D]).size);
for (const c of D) console.log("  |" + c.repeat(10) + "|");
