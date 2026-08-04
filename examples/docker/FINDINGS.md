# docker-tui — findings

What the first consumer found, in the shape Calcium recorded its own: **the surface that
needed it**, **what was reached for**, and **whether it is adapter-side work or a real
Calcium finding**.

Nothing here is fixed in Calcium by this app. R01's premise is that a framework change
arrives with a consumer proving it was needed — so the app absorbs what it can, records
what it absorbed, and the framework moves later with this file as the argument.

---

## F1 — Calcium assumes the far side accepts `--json`, and docker does not ★

| | |
|---|---|
| **Surface** | S2 `/ps` — the first invocation of anything |
| **Reached for** | any way to say what the far side's JSON flag is called |
| **Verdict** | **a real Calcium finding**, absorbed app-side for now |
| **Absorbed by** | `bin/docker-json`, and `binary` pointing at it |

`src/data/transport/argv.ts` appends `--json` unconditionally:

```
$ docker ps --json
unknown flag: --json
```

Docker wants `docker ps --format json`.

**It is a premise, not a line.** `withJson` is imported by the subprocess, emulated and
fixture transports; C23 reads `argv.includes("--json")` to decide `userRequestedJson`;
C06 §3 and C07 §4 both document the flag as the contract. *The far side speaks `--json`*
is something the framework is built on rather than something it configures.

R01 §2 chose docker because containers are **not Prism-shaped** — "a Prism concept quietly
absorbed into the framework surfaces here, visibly". This is that row paying off on the
first contact with a real far side, before a line of app code.

**What a fix would look like**, when one is argued: the flag belongs beside `binary` on
`TuiConfig`, because it is a property of the far side the app author is the only party who
can know — the same reasoning C05 uses for `ToolDef.interactive`. Detection is not
available and a list of known CLIs would fail silently for every wrapper.

**How it closes:** `bin/docker-json` is deleted and `binary` goes back to `"docker"`. The
file is the finding; its deletion is the finding closing.

---

## F2 — Calcium was not a publishable package, and CI had a job that proved nothing

| | |
|---|---|
| **Surface** | the proof gate (R01 §8), before it could be written |
| **Reached for** | `npm publish` into a local registry |
| **Verdict** | **a real Calcium finding** — fixed in Calcium, because the app cannot absorb it |

`package.json` carried `"private": true`, and `npm publish` refuses a private package
outright. R01 commitment 9 rests the whole monorepo arrangement on a pack-and-install gate,
and that gate could never have run.

**The sharper half:** `ci.yml` already had a `publish` job. It is tag-gated, so it had never
executed, and it could not have succeeded if it had. A release path that has never run reads
exactly like one that works — A03 §2's vacuity class arriving in CI rather than in a rule.

Fixed by `chore/package-identity` (PR #13) rather than absorbed, because there is no app-side
version of "the package can be published".

**And one that would have bitten the gate:** `publishConfig.registry` beats a `--registry`
flag. A dry run pointed at `localhost:4873` published to `npm.pkg.github.com` regardless. The
Verdaccio step must override `publishConfig`, not merely pass a registry.

---

## F3 — R01's own premise about docker has expired

| | |
|---|---|
| **Surface** | S2 `/ps` — the adapter's coercion boundary |
| **Reached for** | R01 §4's table of what docker emits |
| **Verdict** | **adapter-side work**, plus a small R01 correction |

R01 §4 says *"Everything is a string, including numbers"*. Docker 29.4.1 does not agree:

```json
"Platform": {"architecture": "arm64", "os": "linux"}
```

A nested object, in the middle of an otherwise flat record.

**And docker pre-truncates its own fields**, with U+2026:

```json
"Mounts": "/host_mnt/User…"
```

That one is the hazard rather than the curiosity. `cells()` measures `…` as one cell, so a
field docker has already shortened, rendered into a column narrower than it, is truncated
**twice** and shows two ellipses. It is the class where *a value belongs to the far side and
the code assumes it owns it* — invisible until a real far side that pre-truncates arrives,
which is the first thing this app did.

R01 §4's row wants rewording: docker's values are strings *except where they are not*, and
the far side changed under the spec, which is the argument R01 makes about docker made
against R01.

---

## F4 — a surface drawn before anyone ran the far side encodes the mock's assumptions ★

| | |
|---|---|
| **Surface** | S2 `/ps`, the `PORTS` and `IMAGE` columns |
| **Reached for** | the drawn frame, as the source for a truncation ruling |
| **Verdict** | **a finding about the design documents**, not about Calcium or the adapter |

S2 draws `PORTS` as `80→8080, 443→8443` and `IMAGE` as `nginx:1.25` in an 18-wide column.
Docker emits `0.0.0.0:8080->80/tcp, [::]:8080->80/tcp` — forty characters for one published
port, with an IPv6 twin per IPv4 entry — and image names up to **85 characters**
(`vsc-tui-kit-07d4a92ac4a68f…-features`). `Status` reaches 22 (`Exited (0) 5 weeks ago`)
against a drawing that assumed thirteen.

**It cost a wrong ruling, which is how it was found.** S2 and R01 R3.4 disagreed about
which end `PORTS` truncates from. The disagreement was real and worth ruling on, and the
ruling — *keep the field's identifying end; for a mapping that is the tail* — was reasoned
from `80→8080`, where the host port **is** the tail. In the string docker actually sends
the host port is on the **left**, so the ruling inverted the answer, and R01 R3.4's own
wording ("truncated from the left, keeping the host port") is not satisfiable at all.

The generalisation survived; only which end identifies flipped. But nothing in either
document could have caught it, because both were describing the same imagined string.

**Two things follow.**

1. **A classification table is written against captured far-side output, never against the
   drawings in the spec it is testing.** The row *`Ports` long meets `truncate`* cannot be
   decided from a document that shows a string the far side never sends. This is the rule
   the walk needed and did not have.
2. **The remaining speculative surfaces are suspect in the same way** — S3's plot, S6's
   comparison, S7's drift were all drawn before anything ran. Each should be checked
   against real output before its ruling, not after. Knowing the pattern now is the
   cheapest it will ever be.

This is one level worse than Calcium's own *a figure encoding unstated intent*: there, the
figure was drawn from something real and the intent went unwritten. Here the figure was
drawn from nothing, so it encoded intent that was **wrong**, and it read exactly as
authoritative.

**And a second argument for verbatim, beyond the fail-on-revert.** Condensing
`0.0.0.0:8080->80/tcp` to `8080→80` discards the bind address, and `0.0.0.0` versus
`127.0.0.1` is the difference between a port exposed to the network and one that is not.
A parser decides in advance which information nobody will need, and it decided wrong here
while looking tidier.

---

## Open, not yet reached

Recorded so their absence is a decision. Each gets an entry above when the surface that
needs it is built.

- **Gap 7 — a `b.live` part hosted by a pushed view** (S3). The driver's `view` host arm,
  specified and shipped tested against an entry host only. The most valuable thing this app
  can surface, and step 3 reaches it.
- **Gap 3 — value-colour vs tone-colour.** A CPU bar encodes load on a continuum; Calcium's
  palette is tone slots. Step 2.
- **Gap 1 — history across ticks.** `b.live` re-renders from the latest fetch; a sparkline
  needs the previous values. Adapter ring-buffer first.
- **The line budget.** R01 commitment 1 caps app code at 300 lines. Exceeding it is a
  finding *about Calcium* — it means the app had to write something generic itself — so if
  it goes over, the lines that pushed it over get named here rather than the budget raised.
