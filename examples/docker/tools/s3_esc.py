#!/usr/bin/env python3
"""Open S3, let it tick, press Esc, and hold — does the pop leave a tick behind?

The question the plain frame-read cannot answer: `esc` dismisses the layer, and
what must *not* happen is a part still ticking against a host that has gone. A
capture that ends at the pop cannot see it; this one holds well past two
intervals afterwards, so a surviving tick has time to draw.
"""

import sys
from capture import run

cols, rows, out, target = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], sys.argv[4]
run(
    cols,
    rows,
    [
        (1.5, f"/container stats {target}".encode()),
        (3.5, b"\r"),
        # Ticking for ~9 seconds, then Esc on its own — never inside the paste
        # window, and never in the same burst as anything else.
        (13.0, b"\x1b"),
    ],
    out,
    hold=9.0,
)
