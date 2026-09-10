// The consumer-side terminal doubles, and the screen model that reads them back.
//
// **Extracted from `frame.mjs` when `profile.mjs` needed the same three
// functions.** Transcribing them a third time is the duplication this project
// has removed four times; importing them from `frame.mjs` is worse, because that
// module starts a session at import and a second consumer would run a bench to
// get a fake.
//
// Everything below is unchanged from where it was written, including the reasons.

// --- the fakes, transcribed from `test/support/fake-terminal.ts` ------------
//
// Transcribed rather than imported: that file is TypeScript under `test/`, and
// this runs against the built package as a consumer would. The two things it
// must model are the ones the doubles there model — a stream that records what
// it was given, and a stdin that delivers only while flowing.

export function fakeStdout(size) {
  const chunks = [];
  const stream = {
    isTTY: true,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    get chunks() {
      return chunks;
    },
    get columns() {
      return size.columns;
    },
    get rows() {
      return size.rows;
    },
    on: () => stream,
    once: () => stream,
    off: () => stream,
    removeListener: () => stream,
    emit: () => false,
    end: () => stream,
  };
  return stream;
}

export function fakeStdin() {
  const data = new Set();
  let flowing = null;
  const stream = {
    isTTY: true,
    emit(chunk) {
      if (flowing !== true) return;
      for (const cb of [...data]) cb(Buffer.from(chunk, "utf8"));
    },
    on(event, cb) {
      if (event === "data") {
        data.add(cb);
        if (flowing !== false) flowing = true;
      }
      return stream;
    },
    once: () => stream,
    off(event, cb) {
      if (event === "data") data.delete(cb);
      return stream;
    },
    removeListener: () => stream,
    resume() {
      flowing = true;
      return stream;
    },
    pause() {
      flowing = false;
      return stream;
    },
    isPaused: () => flowing === false,
    setRawMode: () => stream,
  };
  return stream;
}

// --- the screen ------------------------------------------------------------
//
// **The JS twin of `test/support/screen.ts`**, and the duplication is named
// rather than hidden. That file is TypeScript under `test/`; this runs against
// the built package as a consumer would, and `dist/` does not carry it.
// `examples/docker/tools/screen.py` is the third, on the PTY side — the path is
// relative-correct inside that directory and misdirects everywhere else, which
// is how F79's citation went unfollowed. Three copies of one model,
// each on its own side of a boundary — which is the same disposition
// `VERIFYING.md` records for its instruments.
const ESCAPE = String.fromCharCode(27);
const HOME_SEQ = `${ESCAPE}[H`;

export function screenRows(chunks, size) {
  const grid = Array.from({ length: size.rows }, () => " ".repeat(size.columns));
  let row = 0;
  let col = 0;
  const put = (text) => {
    if (text === "" || row < 0 || row >= size.rows) return;
    const line = grid[row] ?? "";
    grid[row] = (line.slice(0, col) + text + line.slice(col + text.length))
      .slice(0, size.columns)
      .padEnd(size.columns, " ");
    col += text.length;
  };
  const cup = new RegExp(`^${ESCAPE}\\[(\\d+);(\\d+)H`);
  const other = new RegExp(`${ESCAPE}\\[[0-9;?]*[a-zA-Z]`, "g");
  for (const chunk of chunks) {
    let i = 0;
    while (i < chunk.length) {
      if (chunk.startsWith(HOME_SEQ, i)) { row = 0; col = 0; i += HOME_SEQ.length; continue; }
      const m = cup.exec(chunk.slice(i));
      if (m !== null) { row = Number(m[1]) - 1; col = Number(m[2]) - 1; i += m[0].length; continue; }
      if (chunk.startsWith(ESCAPE, i)) {
        other.lastIndex = i;
        const e = other.exec(chunk);
        if (e !== null && e.index === i) { i += e[0].length; continue; }
        i += 1; continue;
      }
      if (chunk.startsWith("\r\n", i)) { row += 1; col = 0; i += 2; continue; }
      let j = i;
      while (j < chunk.length && chunk[j] !== ESCAPE && !chunk.startsWith("\r\n", j)) j += 1;
      put(chunk.slice(i, j));
      i = j;
    }
  }
  return grid;
}

