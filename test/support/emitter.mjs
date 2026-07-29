// The streaming far side for C21 T5.4 and C06 T5.2.
//
// **Paced against the clock, not against the timer.** The first version wrote
// one line per `setInterval(…, 1)` tick and managed 455 lines/s — node's minimum
// interval plus the cost of the write, which is less than half the rate the
// specs name, so a "sixty second" run took a hundred and thirty. A test that
// claims a rate has to hit it or say a different number.
//
// So each tick writes however many lines are *due* by elapsed time. The rate is
// then a property of the clock rather than of node's timer resolution, and it
// self-corrects when a tick runs late.
//
// No `process.exit` at the end: it discards writes still queued on a pipe, and
// the whole assertion is that nothing was dropped.
// **Every argument position is exposed to C06's `--json`.** It appends the flag
// to every invocation (D16), so a positional argument this program does not
// recognise arrives as `NaN` — which made `due` NaN, wrote no lines, cleared no
// interval, and hung until the PTY timed out. A program spawned through the
// transport reads its arguments defensively or not at all.
const numeric = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const total = numeric(process.argv[2], 1000);
const perSecond = numeric(process.argv[3], 1000);

const started = Date.now();
let written = 0;

const timer = setInterval(() => {
  const due = Math.min(total, Math.ceil(((Date.now() - started) / 1000) * perSecond));

  while (written < due) {
    written += 1;
    process.stdout.write(`${JSON.stringify({ n: written, text: "日本語🚀 line" })}\n`);
  }

  if (written >= total) clearInterval(timer);
}, 10);
