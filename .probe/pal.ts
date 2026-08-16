import { DARK_THEME } from "../test/support/render.js";
const t = DARK_THEME as unknown as { palettes?: Record<string, unknown>; tokens?: Record<string, unknown> };
console.log("top keys:", Object.keys(t));
const tok = (t as any).tokens ?? t;
console.log("families:", Object.keys(tok));
