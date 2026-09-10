/**
 * **Whether two categorical slots are different colours to a reader who is not
 * trichromatic** — the property `categorical` is authored for, and the one
 * nothing measured (F1017).
 *
 * §4c.1 admits a palette ref as a picture cell's background, and §4g's entry and
 * I35's limits both discharge the same figure the same way: the worst
 * `categorical × categorical` pair is **1.00**, so the cell is invisible in
 * greyscale and **legible only by hue**. That clause is the whole of the
 * argument — a picture cell has no ink and no ground, so `ratio` has nothing to
 * measure, and hue is what is left. It was never checked.
 *
 * **Checked, it does not hold.** Canonical Okabe-Ito clears ΔE2000 7.9 under
 * every vision model here; the shipped light palette falls to **0.6** under
 * deuteranopia — `c1` and `c4`, orange and yellow, the same colour to about six
 * per cent of men — and dark and high-contrast to 1.5 under tritanopia. Seven
 * pairs are under the floor on each of the three shipped themes. The per-theme
 * adaptation was justified against the **ground**, which it does clear, and its
 * effect on the property the palette is named for was not re-measured, which is
 * how the numbers moved without anyone choosing to move them.
 *
 * **This module measures and does not repair, and the reason was itself a
 * measurement that came out the other way.** The first draft refused
 * recolouring on the ground that it is not achievable: a search reached 14.8
 * and produced eight near-blacks. That search could only *darken* — it scaled
 * each canonical hue toward the ground and had no other freedom — so the
 * outcome was its search space and not the problem. Freed to move in sRGB it
 * reaches 33.3 with the saturation kept, which refutes the refusal.
 *
 * **What actually refuses it is the metric.** That 33.3 is 8.9 under ΔE2000,
 * against canonical's 7.9: the optimiser bought its number in the saturated
 * blues, where CIE76 over-states. A metric sharp enough to say *these two
 * collapsed* is not sharp enough to rank two palettes that both pass, and no
 * metric here knows whether eight colours look like a set. So the remedy is a
 * debt list compared by equality and worked down by a person choosing colours,
 * with `separation` telling them whether a choice helped.
 */

/** The dichromacies simulated here. Anomalous trichromacy is milder and is not modelled. */
export type Vision = "normal" | "protan" | "deutan" | "tritan";

/** Every vision model, in the order a report should print them. */
export const VISIONS: readonly Vision[] = Object.freeze(["normal", "protan", "deutan", "tritan"]);

type Triple = readonly [number, number, number];

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearOf(hex: string): Triple {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => toLinear(Number.parseInt(h.slice(i, i + 2), 16))) as unknown as Triple;
}

/**
 * Viénot, Brettel & Mollon (1999), the one-matrix dichromat simulation in
 * linear RGB. **Chosen over Brettel's two-plane method because the question is
 * *are these two the same colour*, not *what exactly does a dichromat see*** —
 * the two agree closely away from the neutral axis, and a categorical palette
 * is nowhere near it. A model that disagreed would move the figures and not the
 * ordering, and the ordering is what the debt list holds.
 */
const MATRICES: Readonly<Record<Exclude<Vision, "normal">, readonly Triple[]>> = Object.freeze({
  protan: Object.freeze([[0.11238, 0.88762, 0], [0.11238, 0.88762, 0], [0.00401, -0.00401, 1]] as Triple[]),
  deutan: Object.freeze([[0.29275, 0.70725, 0], [0.29275, 0.70725, 0], [-0.02234, 0.02234, 1]] as Triple[]),
  tritan: Object.freeze([[1, 0.14461, -0.14461], [0, 0.85659, 0.14341], [0, 0.85659, 0.14341]] as Triple[]),
});

function seenAs(colour: Triple, vision: Vision): Triple {
  if (vision === "normal") return colour;
  const m = MATRICES[vision];
  return m.map((row) => row[0] * colour[0] + row[1] * colour[1] + row[2] * colour[2]) as unknown as Triple;
}

function pivot(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** CIE L\*a\*b\* under D65. */
function lab(c: Triple): Triple {
  const x = 0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2];
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const z = 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2];
  const [fx, fy, fz] = [pivot(x / 0.95047), pivot(y), pivot(z / 1.08883)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const DEG = Math.PI / 180;

/**
 * CIEDE2000 ΔE between two hexes as `vision` sees them.
 *
 * **CIEDE2000 rather than CIE76, and the measurement is the whole argument.**
 * The first draft of this file used CIE76 and said, in this docblock, that *at
 * the floor this rule uses the two formulae agree on every pair either would
 * call a collision*. That was written without being run. Run, it is false: on
 * the dark palette CIE76 at its floor names two pairs and ΔE2000 at its own
 * names **seven**, and only one pair is in both lists. The two formulae agree
 * on the *ordering* of the shipped palettes and disagree on the membership of
 * every debt list, which is the half that gets read.
 *
 * **What settled it is what a search does with each.** Maximising CIE76 over
 * free sRGB under the light theme's ground floor reaches a minimum separation
 * of 33.3 — three times canonical Okabe-Ito's — by placing three slots in the
 * saturated blues, which is exactly the region CIE76 over-states. The same
 * palette measures **8.9** under ΔE2000, against canonical's 7.9. An optimiser
 * handed CIE76 finds the metric's weak region rather than a better palette, and
 * a metric that can be gamed by a hill-climb in twenty thousand steps should
 * not be the one a person is asked to work a debt list down against.
 */
export function separation(a: string, b: string, vision: Vision): number {
  const [l1, a1, b1] = lab(seenAs(linearOf(a), vision));
  const [l2, a2, b2] = lab(seenAs(linearOf(b), vision));

  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp1 = ap1 === 0 && b1 === 0 ? 0 : ((Math.atan2(b1, ap1) / DEG) + 360) % 360;
  const hp2 = ap2 === 0 && b2 === 0 ? 0 : ((Math.atan2(b2, ap2) / DEG) + 360) % 360;

  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = 0;
  if (cp1 * cp2 !== 0) {
    const raw = hp2 - hp1;
    dh = Math.abs(raw) <= 180 ? raw : raw > 180 ? raw - 360 : raw + 360;
  }
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * DEG) / 2);

  const lBar = (l1 + l2) / 2;
  const cpBar = (cp1 + cp2) / 2;
  let hBar = hp1 + hp2;
  if (cp1 * cp2 !== 0) {
    hBar = Math.abs(hp1 - hp2) <= 180
      ? (hp1 + hp2) / 2
      : hp1 + hp2 < 360 ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  }

  const t = 1
    - 0.17 * Math.cos((hBar - 30) * DEG)
    + 0.24 * Math.cos(2 * hBar * DEG)
    + 0.32 * Math.cos((3 * hBar + 6) * DEG)
    - 0.20 * Math.cos((4 * hBar - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7));
  const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sC = 1 + 0.045 * cpBar;
  const sH = 1 + 0.015 * cpBar * t;
  const rT = -Math.sin(2 * dTheta * DEG) * rC;

  return Math.sqrt(
    (dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH),
  );
}

/** One pair that is under the floor, named so a debt list can be compared by equality. */
export interface Collision {
  readonly vision: Vision;
  readonly a: string;
  readonly b: string;
  readonly deltaE: number;
}

/**
 * The floor two categorical slots must clear, under every vision model.
 *
 * **Seven, and it is calibrated on the control rather than chosen.** Canonical
 * Okabe-Ito — the set every shipped palette claims its property from — measures
 * **7.9** at its worst under ΔE2000, tritan `black`/`reddishPurple`. So seven is
 * the largest integer the reference set clears, and eight would refuse it. A
 * floor no published palette could meet would be a rule about nothing, and one
 * the reference clears by a wide margin would be a rule about very little.
 *
 * **It is a detection threshold and not a quality bar.** ΔE2000 of about 2.3 is
 * a just-noticeable difference; seven is comfortably above that and comfortably
 * below what a designer would call *distinct*. What it separates is the shipped
 * light palette's 0.6 from the reference's 7.9, which is the question asked.
 */
export const SEPARATION_FLOOR = 7;

/**
 * Every pair of `slots` under the floor, in a stable order.
 *
 * The result is the whole verdict rather than a boolean, because the rule this
 * feeds compares a **list** by equality: a collision that disappears is as much
 * a change to look at as one that appears, and a count cannot say which pair.
 */
export function collisions(
  slots: Readonly<Record<string, string>>,
  floor: number = SEPARATION_FLOOR,
): readonly Collision[] {
  const names = Object.keys(slots).sort();
  const out: Collision[] = [];
  for (const vision of VISIONS) {
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const [a, b] = [names[i] as string, names[j] as string];
        const d = separation(slots[a] as string, slots[b] as string, vision);
        if (d < floor) out.push({ vision, a, b, deltaE: Math.round(d * 10) / 10 });
      }
    }
  }
  return Object.freeze(out);
}

/**
 * Okabe & Ito (2008) as published — the control, and the reason this file has a
 * floor it can defend.
 *
 * **Not the set any shipped theme uses**, and that is the point: `categorical`
 * is *adapted* Okabe-Ito on all three, and `src/data/colormaps/qualitative/`
 * ships a third variant. This is the one the property is claimed from.
 */
export const OKABE_ITO_CANONICAL: Readonly<Record<string, string>> = Object.freeze({
  black: "#000000",
  orange: "#e69f00",
  skyBlue: "#56b4e9",
  bluishGreen: "#009e73",
  yellow: "#f0e442",
  blue: "#0072b2",
  vermillion: "#d55e00",
  reddishPurple: "#cc79a7",
});
