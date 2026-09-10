/**
 * The recording half of `capture-foreign.mjs`, split out because the target
 * this half needs to reach — an authenticated `claude` on the host — is not
 * inside the devcontainer, and the container has no route to it.
 *
 * Deliberately dependency-light: `node-pty` only, no repo TypeScript, no
 * `sharp`. Both carry native bindings built for the container's platform, and
 * a host run trips exactly that mismatch (`esbuild`'s darwin/linux message).
 * `node-pty` alone happens to load on both, which is what makes this half
 * runnable outside the container at all — the tsx/sharp half is not, and
 * stays there. `capture-foreign.mjs --from-raw` reads what this writes.
 *
 *     node tools/capture-foreign-record.mjs --duration 12000 --cols 100 \
 *       --rows 30 --out captures/x -- claude "say hello"
 */
import { spawn } from "node-pty";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const dashdash = argv.indexOf("--");
  if (dashdash === -1) throw new Error("usage: capture-foreign-record.mjs [flags] -- <command> [args...]");
  const flags = argv.slice(0, dashdash);
  const command = argv.slice(dashdash + 1).join(" ");
  if (command === "") throw new Error("no command given after --");
  const get = (name, dflt) => {
    const i = flags.indexOf(name);
    return i === -1 ? dflt : flags[i + 1];
  };
  return {
    command,
    durationMs: Number(get("--duration", "8000")),
    cols: Number(get("--cols", "100")),
    rows: Number(get("--rows", "30")),
    out: get("--out", join("captures", new Date().toISOString().replace(/[:.]/g, "-"))),
  };
}

async function record(opts) {
  mkdirSync(opts.out, { recursive: true });
  const rawPath = join(opts.out, "raw.bin");
  const timingPath = join(opts.out, "timings.jsonl");
  writeFileSync(rawPath, "");
  writeFileSync(timingPath, "");
  writeFileSync(join(opts.out, "meta.json"), JSON.stringify({ command: opts.command, cols: opts.cols, rows: opts.rows }, null, 2));

  const term = spawn("/bin/sh", ["-c", opts.command], {
    name: "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    env: { ...process.env, TERM: "xterm-256color", LANG: "en_GB.UTF-8" },
    encoding: null,
  });

  const start = performance.now();
  let chunks = 0;
  term.onData((d) => {
    const buf = Buffer.from(d);
    appendFileSync(rawPath, buf);
    appendFileSync(timingPath, JSON.stringify({ tMs: performance.now() - start, len: buf.length }) + "\n");
    chunks += 1;
  });

  const exitCode = await new Promise((resolve) => {
    const timer = setTimeout(() => term.kill(), opts.durationMs);
    term.onExit(({ exitCode }) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  console.log(`recorded ${String(chunks)} chunks, exit ${String(exitCode)} -> ${opts.out}`);
}

await record(parseArgs(process.argv.slice(2)));
