// C21 I20, C01 I25, C02 I18 — the clipboard's two L0 mechanisms (ruling 72).
//
// **One run for three components, because the walk that produced them was one
// table** (C21 §2b): capability × tool presence × payload × transport. Each
// mutation below is a cell of that table answered the obvious way — a found tool
// treated as reachable, a relative `PATH` entry searched, a reason read from a
// pipe a forked server holds, a copy stripped the way a title is — and the row
// named in `expect:` is the one that cell exists for.

import { execSync } from "node:child_process";
import { fsIo, report, runPass } from "../mutate.mjs";

const ROOT = process.cwd();
const CMD =
  "npx vitest run test/unit/process.test.ts test/edge/process.test.ts " +
  "test/contract/process.test.ts test/revert/process.test.ts " +
  "test/unit/lifecycle.test.ts test/revert/lifecycle.test.ts " +
  "test/unit/capabilities.test.ts test/revert/capabilities.test.ts";
const CLIP = "src/data/process/clipboard.ts";
const ESCAPES = "src/terminal/escapes.ts";
const CAPS = "src/terminal/capabilities.ts";

const { read, write } = fsIo(ROOT);
const run = () => {
  try {
    return execSync(`${CMD} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    if (e.killed === true) return "the suite did not return — timed out";
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
};

const results = runPass({
  read,
  write,
  run,
  control: {
    file: CAPS,
    from: '  kitty: "osc52",\n  ghostty: "osc52",\n  iterm2: "none",',
    to: '  kitty: "none",\n  ghostty: "osc52",\n  iterm2: "none",',
    why: "T1.29 asserts `TERM=xterm-kitty` answers `osc52` directly; a run where flipping it survives cannot see a kill",
  },
  mutations: [
    // --- C21: finding the tool --------------------------------------------
    {
      // W13. The empty entry is still skipped, so this is the narrower defect: a
      // relative directory searched against the working directory.
      name: "RELATIVE-ENTRY: a relative PATH entry is searched",
      file: CLIP,
      from: '  const dirs = path.split(delimiter).filter((dir) => dir !== "" && isAbsolute(dir));',
      to: '  const dirs = path.split(delimiter).filter((dir) => dir !== "");',
      expect: "T1.14",
    },
    {
      // W6. The mutation every lookup starts as: found means available.
      name: "NO-SSH-GATE: a local tool is offered over SSH",
      file: CLIP,
      from: '  if (reach === "local") return !isSet(env, "SSH_CONNECTION") && !isSet(env, "SSH_TTY");',
      to: '  if (reach === "local") return true;',
      expect: "T1.14",
    },
    {
      // Half the gate: a session with a tty and no connection variable.
      name: "SSH-ONE-VARIABLE: SSH_TTY alone does not count as SSH",
      file: CLIP,
      from: '  if (reach === "local") return !isSet(env, "SSH_CONNECTION") && !isSet(env, "SSH_TTY");',
      to: '  if (reach === "local") return !isSet(env, "SSH_CONNECTION");',
      expect: "T1.14",
    },
    {
      // W8. xclip with no display fails; offering it hides the next candidate.
      name: "NO-DISPLAY-GATE: a display-bound tool is offered without its display",
      file: CLIP,
      from: "  return isSet(env, reach);",
      to: "  return true;",
      expect: "T1.14",
    },
    {
      // The table's order, not PATH's. Swapping two rows is what a reorder looks like.
      name: "ORDER: xsel is asked before xclip",
      file: CLIP,
      from:
        '  candidate("xclip", ["-selection", "clipboard"], "utf-8", "DISPLAY"),\n' +
        '  candidate("xsel", ["--clipboard", "--input"], "utf-8", "DISPLAY"),',
      to:
        '  candidate("xsel", ["--clipboard", "--input"], "utf-8", "DISPLAY"),\n' +
        '  candidate("xclip", ["-selection", "clipboard"], "utf-8", "DISPLAY"),',
      expect: "T1.14",
    },
    {
      name: "DIRECTORY-IS-A-TOOL: the regular-file check dropped",
      file: CLIP,
      from: "    if (!statSync(path).isFile()) return false;\n",
      to: "    statSync(path);\n",
      expect: "T1.14",
    },
    // --- C21: writing to it ---------------------------------------------------
    {
      // W1. pbcopy given nothing empties the pasteboard.
      name: "EMPTY-SPAWNS: the empty text reaches the tool",
      file: CLIP,
      from: '  if (text === "") return Promise.resolve(failed("the text is empty, and nothing was sent"));\n',
      to: "",
      expect: "T3.20",
    },
    {
      // W16. The natural way to get a reason, and the reason it is not taken:
      // the forked server holds the pipe, so waiting for it to close never ends.
      name: "PIPE-AND-CLOSE: stderr piped for a reason and the answer taken on close",
      file: CLIP,
      from: '        stdio: ["pipe", "ignore", "ignore"],',
      to: '        stdio: ["pipe", "pipe", "pipe"],',
      also: [{ file: CLIP, from: '    child.on("exit", (code, signal) => {', to: '    child.on("close", (code, signal) => {' }],
      expect: "T3.20",
    },
    {
      // W12. A tool that exits before reading closes the pipe under us.
      name: "EPIPE-UNHANDLED: the stdin error listener dropped",
      file: CLIP,
      from: '    child.stdin?.on("error", () => undefined);\n',
      to: "",
      expect: "T3.20",
    },
    {
      // W17.
      name: "NO-BOM: clip.exe gets bare UTF-16LE",
      file: CLIP,
      from: "    ? Buffer.concat([UTF16LE_BOM, Buffer.from(text, \"utf16le\")])",
      to: "    ? Buffer.from(text, \"utf16le\")",
      expect: "T1.15",
    },
    {
      // xclip's default is the primary selection — the middle-click buffer.
      name: "PRIMARY: xclip without -selection clipboard",
      file: CLIP,
      from: '  candidate("xclip", ["-selection", "clipboard"], "utf-8", "DISPLAY"),',
      to: '  candidate("xclip", [], "utf-8", "DISPLAY"),',
      expect: "T1.15",
    },
    // --- C01: the sequence ----------------------------------------------------
    {
      // W15. Right for a title, wrong for a copy.
      name: "STRIPPED: the copy passes through oscText",
      file: ESCAPES,
      from: '  const payload = Buffer.from(text, "utf8").toString("base64");',
      to: '  const payload = Buffer.from(oscText(text), "utf8").toString("base64");',
      expect: "T1.32",
    },
    {
      // W1, at the sequence: an empty payload is *clear the selection* on xterm.
      name: "EMPTY-SENT: the empty text is written",
      file: ESCAPES,
      from: '  if (text === "") return null;\n  const payload',
      to: "  const payload",
      expect: "T1.32",
    },
    {
      // The cap on the text's length rather than the payload's — right for ASCII,
      // wrong for every multi-byte character.
      name: "CAP-ON-TEXT: the cap compared against characters",
      file: ESCAPES,
      from: "  if (payload.length > CLIPBOARD_LIMIT) return null;",
      to: "  if ((text.length * 4) / 3 > CLIPBOARD_LIMIT) return null;",
      expect: "T1.32",
    },
    {
      name: "CAP-OFF-BY-ONE: the limit itself refused",
      file: ESCAPES,
      from: "  if (payload.length > CLIPBOARD_LIMIT) return null;",
      to: "  if (payload.length >= CLIPBOARD_LIMIT) return null;",
      expect: "T1.32",
    },
    // --- C02: the capability --------------------------------------------------
    {
      // W5. The per-reader gate, arriving in a fourth column.
      name: "GATE-PER-READER: clipboard reads the ungated identification",
      file: CAPS,
      from: '    clipboard: fromIdentity(identified, terminal, CLIPBOARD, "none"),',
      to: '    clipboard: fromIdentity(identified, identified, CLIPBOARD, "none"),',
      expect: "T1.29",
    },
    {
      name: "ITERM-ON: iTerm2 claimed although it ships off",
      file: CAPS,
      from: '  iterm2: "none",\n  wezterm: "osc52",',
      to: '  iterm2: "osc52",\n  wezterm: "osc52",',
      expect: "T1.29",
    },
    {
      name: "ANY-OVERRIDE: the clipboard validator accepts anything",
      file: CAPS,
      from: '    clipboard: oneOf("none", "osc52"),',
      to: "    clipboard: () => true,",
      expect: "T1.29",
    },
  ],
});

console.log(report(results));

const unexpected = results.filter((r) => !r.killed);
process.exit(unexpected.length > 0 ? 1 : 0);
