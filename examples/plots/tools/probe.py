#!/usr/bin/env python3
"""Drive plots-tui once per verb and print the frame a reader would have seen.

Not a shot list — a look before one. `media.py` picks a settled instant and
collapses to it, which is only honest once somebody has checked that the instant
holds the surface the shot claims. This prints the final frame for each verb so
the hold and the still can be chosen from what is on screen rather than guessed.

    python3 tools/probe.py 120 40 /sample /mosaic

The harness is `examples/docker/tools/capture.py`, imported rather than copied:
it is the only implementation of "do not paste a command, do not SIGKILL the
shell" in the repository, and a second copy is a second thing to keep true.
`capture.APP` is a module constant the docker suite already swaps the same way.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DOCKER_TOOLS = os.path.join(HERE, "..", "..", "docker", "tools")
sys.path.insert(0, os.path.abspath(DOCKER_TOOLS))

import capture  # noqa: E402
import screen  # noqa: E402

capture.APP = ["./bin/plots-tui.js"]

UTF8 = {"LANG": "en_GB.UTF-8", "COLORTERM": "truecolor"}

if __name__ == "__main__":
    cols, rows = int(sys.argv[1]), int(sys.argv[2])
    out = os.environ.get("PROBE_OUT", "/tmp/plots-probe")
    os.makedirs(out, exist_ok=True)
    for verb in sys.argv[3:]:
        name = verb.strip("/").replace(" ", "-").replace("/", "-")
        raw = os.path.join(out, name)
        capture.forget_theme()
        script = [(3.0, verb.encode()), (5.0, b"\r")]
        # Page-ups after the Enter, `PROBE_KEYS=3`. An entry taller than the
        # region lands as its *tail*, so a figure with a caption above it is
        # off the top of the frame the shot would keep — `config-diff`'s
        # correction, arrived at the same way and for the same reason.
        for i in range(int(os.environ.get("PROBE_KEYS", "0"))):
            script.append((7.0 + i * 1.0, b"\x1b[5~"))
        capture.run(cols, rows, script, raw, 9.0 + float(os.environ.get("PROBE_KEYS", "0")), UTF8)
        with open(raw, "rb") as fh:
            data = fh.read().decode("utf8", "replace")
        print(f"\n{'=' * 20} {verb} ({cols}x{rows}) {'=' * 20}")
        print(screen.render(data, cols, rows))
