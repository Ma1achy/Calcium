/**
 * Golden frames for the three real meshes (C12 I97, §6k).
 *
 * **The record they get instead of a catalogue entry.** §7 rules that a teapot
 * in `docs/catalogue/` is not what the catalogue is for, and the 3D forms are
 * covered without one — twelve `plot3d` variants at five capability sets,
 * plus a synthetic sphere across both shading arms, an explicit light and the
 * cull. So these frames exist to move when the renderer moves, and to be read
 * when they do.
 *
 * **Four capability sets and one width**, because the mesh's subject is the
 * geometry rather than the layout: the ASCII and 1-bit rungs are where a
 * half-block picture stops being a picture, and that is the comparison worth
 * keeping. The height is **24**, which is where the teapot first shows a lid
 * (F476) — a frame at a transcript block's 12 to 20 rows is an egg, and one
 * that cannot be told from a wrong render is not a record.
 */
import { describe, expect, it } from "vitest";

import { block } from "../../src/data/viewmodel/index.js";
import { plotDefinition } from "../../src/presentation/plot/index.js";
import { loadMesh, type MeshName } from "../support/obj.js";
import {
  DARK_THEME,
  FULL_CAPS,
  MONO_CAPS,
  MONO_UNICODE_CAPS,
  measurable,
} from "../support/render.js";

const WIDTH = 120;
const HEIGHT = 24;

/** The camera each mesh reads best from, chosen once and recorded. */
const CAMERAS: Record<MeshName, Readonly<{ azimuth: number; elevation: number; distance: number }>> =
  {
    // Handle and spout across the view, which is the silhouette people know.
    teapot: { azimuth: Math.PI, elevation: 0.2, distance: 6 },
    "stanford-bunny": { azimuth: 0.5, elevation: 0.3, distance: 6 },
    suzanne: { azimuth: 0.5, elevation: 0.3, distance: 6 },
  };

const MODES = [
  { name: "24bit", capabilities: FULL_CAPS },
  { name: "1bit-unicode", capabilities: MONO_UNICODE_CAPS },
  { name: "ascii-narrow", capabilities: { ...MONO_CAPS, ambiguousWidth: "narrow" as const } },
  { name: "ascii-wide", capabilities: { ...MONO_CAPS, ambiguousWidth: "wide" as const } },
] as const;

const NAMES = ["teapot", "stanford-bunny", "suzanne"] as const;

describe("golden frames — the real meshes", () => {
  for (const name of NAMES) {
    for (const mode of MODES) {
      it(`${name} · ${mode.name}`, () => {
        const m = loadMesh(name);
        const b = block({
          kind: "plot",
          id: name,
          form: "plot3d",
          height: HEIGHT,
          series: [],
          axes3: false,
          box3: "none",
          colormap: "viridis",
          camera: CAMERAS[name],
          surfaces3: [{ vertices: m.vertices, faces: m.faces, closed: true }],
        } as never);
        const kit = measurable({
          definitions: [plotDefinition],
          theme: DARK_THEME,
          capabilities: mode.capabilities,
        });
        const lines = kit.renderToLines(b, WIDTH);
        const frame = [
          // cells-ok — a row count, not a width
          `── ${name} · ${mode.name} · ${String(m.faces.length)} triangles · rendered ${String(lines.length)}`,
          ...lines,
        ].join("\n");
        expect(frame).toMatchSnapshot();
      });
    }
  }
});
