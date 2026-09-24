import { SPINNER_SETS } from '../src/presentation/blocks/glyphs.js';
import { cells } from '../src/presentation/text.js';
for (const [name, set] of Object.entries(SPINNER_SETS)) {
  if (set.narrowOnly !== true) continue;
  const wide = set.frames.filter((f) => cells(f, 'wide') !== 1);
  console.log(name.padEnd(18), 'frames', String(set.frames.length).padStart(3), '2-cell under wide:', String(wide.length).padStart(3), wide.length === set.frames.length ? 'ALL' : 'MIXED');
}
