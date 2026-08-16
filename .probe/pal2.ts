import { DARK_THEME } from "../test/support/render.js";
import { slot } from "../src/presentation/blocks/paint.js";
import { FULL_CAPS, MONO_CAPS } from "../test/support/render.js";
const pal = (DARK_THEME as any).tokens.palettes as Record<string, { carries: string; slots: Record<string,string> }>;
for (const [k, v] of Object.entries(pal)) console.log(k, "carries=" + v.carries, "slots=" + Object.keys(v.slots).length);
console.log("unknown ref at 24-bit:", JSON.stringify(slot("sequential.s1" as any, DARK_THEME, FULL_CAPS)));
console.log("categorical c1 at 1-bit:", JSON.stringify(slot("categorical.c1" as any, DARK_THEME, MONO_CAPS)));
