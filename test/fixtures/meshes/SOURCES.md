# The three vendored meshes

**Where they came from, what they cost, and what each one can actually witness.**
`test/support/obj.ts` checks the digest below on every load, because a fixture read
from disk is an instrument and an instrument that cannot fail cannot witness.

Fetched 2026-09-02 from [`alecjacobson/common-3d-test-models`](https://github.com/alecjacobson/common-3d-test-models),
which hosts each model with its original source recorded.

| file | source | sha256 of the OBJ text | obj | gz |
|---|---|---|---|---|
| `teapot.obj.gz` | Martin Newell, 1975 — the Utah teapot | `1b5396fe…4187ed4` | 210,614 | 53,813 |
| `stanford-bunny.obj.gz` | [Stanford 3D Scanning Repository](http://graphics.stanford.edu/data/3Dscanrep/), Turk & Levoy 1994 | `1eb35d1e…9b32205` | 2,408,417 | 819,422 |
| `suzanne.obj.gz` | Blender | `d8684326…ed271e6` | 49,137 | 14,059 |

**Gzipped, and the digest is over the text.** 887 KB against 2.6 MB, and gzip's
output is not reproducible across implementations — so the digest that means
anything is the one over what the file expands to, which is also the only link
back to the source.

**Licence.** The Stanford models are published for free use with acknowledgement,
which this file is. Suzanne ships with Blender and is public domain. The Newell
teapot's control points have been in the public domain since the 1970s and the
mesh here is a tessellation of them. None is redistributed for its own sake:
each is a test fixture and appears in no shipped artefact.

---

## What they measure, and it is not what the design note said

The note's §7 gives three reasons a real mesh catches what synthetic geometry
cannot. **Measured over all three meshes, two of them are false here:**

| | teapot | bunny | Suzanne |
|---|---|---|---|
| triangles | 6,320 | **69,451** | 968 (468 quads fanned) |
| vertices | 3,644 | 35,947 | 507 |
| degenerate faces | **0** | **0** | **0** |
| inconsistently wound edges | **0** | **0** | **0** |
| boundary edges | **1,036** | **223** | **42** |
| non-manifold edges | 0 | 0 | **1** |
| signed volume, as `cullSign` sees it | +2.587 | +2.031 | +1.966 |

- **"Inconsistent winding — every renderer hits this once."** Not in these. All
  three are consistently wound, so C12 I95's confident-sign case has to be
  constructed, and `WF3` already constructs it.
- **"Degenerate triangles scattered at random."** None, in any of them. The
  degenerate faces in this corpus are the *synthetic* ones — a UV sphere's poles,
  42 of 576 (F473).
- **"Scale."** True, and exactly: the bunny is **69,451** triangles.

**And the property none of them named is present in all three**: every one is an
**open** mesh that reads as closed. 1,036 boundary edges on the teapot — its lid,
spout and handle rims — 223 on the bunny from the scanner's blind spot under the
base, 42 on Suzanne. That is the case `closed: true` was written for and could
not be given a fixture, and it is why the volume figures above are the row that
matters: a signed-volume orientation stays confident and correct across two
orders of magnitude in how open the surface is.

**The Cornell box is refused, with a reason** — see F476. Its stated value is an
external check against published renders, and those are radiosity solutions:
colour bleeding between diffuse surfaces is the whole point of the scene. This
renderer has one light, no interreflection and terms that sum to 1 (F457), so a
comparison would fail for something that is not a defect.
