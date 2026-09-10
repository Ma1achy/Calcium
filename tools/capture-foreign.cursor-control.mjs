// A control for `trackAndTranslateCursor` specifically: known text, placed
// with the exact vocabulary painter() cannot read on its own — `CSI n B`,
// `CSI n G` — the mechanism the spinner control never touched.
process.stdout.write("\x1b[2J\x1b[H");
process.stdout.write("\x1b[5B"); // down 5, to row 6 (1-based)
process.stdout.write("\x1b[10G"); // column 10
process.stdout.write("HELLO");
process.stdout.write("\x1b[3B\x1b[1G");
process.stdout.write("WORLD");
process.stdout.write("\n");
setTimeout(() => {}, 300);
