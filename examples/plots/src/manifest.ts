/**
 * What the shell is told the far side can do.
 *
 * **Beside the commands rather than in `main.ts`** (F400), so the suite can ask
 * the one question that matters about a command surface: *is every command it
 * declares one somebody built a document for?* While this sat in the wiring —
 * a module that starts a session when imported — the answer was unreachable,
 * and a command could be declared, registered, run, and covered by nothing.
 */
export const manifest = {
  schema: "tui.manifest/1",
  binary: "plots",
  version: "1.0.0",
  tools: [
    { name: "sample", local: false, summary: "Fetch the profile and draw the glance", args: [], flags: [] },
    { name: "all", local: true, summary: "Every form the type declares, and every rung", args: [], flags: [] },
    { name: "form", local: true, summary: "One form, full size, with its rungs", args: [{ name: "form", type: "string", required: false, summary: "which form" }], flags: [] },
    { name: "live", local: true, summary: "One form, advancing", args: [{ name: "form", type: "string", required: false, summary: "which form" }], flags: [] },
    { name: "compare", local: true, summary: "Terminal beside SVG, as pixels", args: [{ name: "form", type: "string", required: false, summary: "which form" }], flags: [] },
    { name: "faults", local: true, summary: "A failing source, and the way back", args: [], flags: [] },
    { name: "monitor", local: true, summary: "This machine, live", args: [], flags: [] },
    { name: "rungs", local: true, summary: "The failure box at every height and width rung", args: [], flags: [] },
    { name: "mosaic", local: true, summary: "Layouts named as a picture", args: [], flags: [] },
    { name: "image", local: true, summary: "Eight fixtures — five about placement, three about the decoder", args: [], flags: [] },
    { name: "spinners", local: true, summary: "Every spinner set the catalogue names, turning", args: [], flags: [] },
    { name: "bars", local: true, summary: "Every bar style at four fills", args: [], flags: [] },
  ],
} as const;
