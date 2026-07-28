// A02 §1 — the layer map. Path prefix → layer.
// L0 has two halves that must never import each other.
export const LAYERS = {
  "src/terminal":     { rank: 0, half: "terminal", label: "L0 terminal"     },
  "src/data":         { rank: 0, half: "data",     label: "L0 data"         },
  "src/presentation": { rank: 1, half: null,       label: "L1 presentation" },
  "src/viewport":     { rank: 2, half: null,       label: "L2 viewport"     },
  "src/interaction":  { rank: 3, half: null,       label: "L3 interaction"  },
  "src/shell":        { rank: 4, half: null,       label: "L4 shell"        },
};

export function layerOf(file) {
  const p = file.replaceAll("\\", "/");
  for (const [prefix, meta] of Object.entries(LAYERS)) {
    if (p.startsWith(prefix + "/")) return { prefix, ...meta };
  }
  return null; // index.ts, testing/, fixtures/ — outside the layer rule
}
