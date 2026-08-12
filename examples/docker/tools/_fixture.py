#!/usr/bin/env python3
"""The tiny harness the instruments' own fixtures are written against.

    from _fixture import case, main
    case("what it claims", got, want)
    sys.exit(main("beats.py"))

**Why a harness at all, for files this small.** Not to save the four lines — to
make the *count* uniform, because the runner reads it. `tools/instruments.mjs`
runs every fixture and an exit status is one bit: it is the same bit for *clean*
and for *the case list was empty*. So every fixture prints `name — n/m rows`
whatever happens, and the runner refuses a fixture that reports zero.

That is `checkFindings`' precedent and `read a green gate's counters`, arriving
in the gate built for group 9. Three instruments reported a completion they
never observed in the session this was written.

`screen_test.py` predates this and keeps its own copy of the four lines. Left
alone deliberately: it is committed, verified and mutation-checked, and
rewriting a working fixture to share a helper is a change with no finding behind
it.
"""

CASES: list[tuple[str, object, object]] = []


def case(name: str, got: object, want: object) -> None:
    CASES.append((name, got, want))


def main(label: str) -> int:
    failed = 0
    for name, got, want in CASES:
        if got == want:
            print(f"  ok    {name}")
        else:
            failed += 1
            print(f"  FAIL  {name}\n          got  {got!r}\n          want {want!r}")
    total = len(CASES)
    print(f"\n{label} — {total - failed}/{total} rows")
    return 1 if failed else 0
