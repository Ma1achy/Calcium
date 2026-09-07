// Generated from matplotlib 3.11.1, BSD licence
// Do not edit by hand — regenerate with tools/gen-colormaps.py

import { AFMHOT } from "./afmhot.js";
import { AUTUMN } from "./autumn.js";
import { BINARY } from "./binary.js";
import { BLUES } from "./blues.js";
import { BONE } from "./bone.js";
import { BRBG } from "./brbg.js";
import { BRG } from "./brg.js";
import { BUGN } from "./bugn.js";
import { BUPU } from "./bupu.js";
import { BWR } from "./bwr.js";
import { CIVIDIS } from "./cividis.js";
import { CMRMAP } from "./cmrmap.js";
import { COOL } from "./cool.js";
import { COOLWARM } from "./coolwarm.js";
import { COPPER } from "./copper.js";
import { CUBEHELIX } from "./cubehelix.js";
import { FLAG } from "./flag.js";
import { GIST_EARTH } from "./gist-earth.js";
import { GIST_GRAY } from "./gist-gray.js";
import { GIST_HEAT } from "./gist-heat.js";
import { GIST_NCAR } from "./gist-ncar.js";
import { GIST_RAINBOW } from "./gist-rainbow.js";
import { GIST_STERN } from "./gist-stern.js";
import { GIST_YARG } from "./gist-yarg.js";
import { GNBU } from "./gnbu.js";
import { GNUPLOT } from "./gnuplot.js";
import { GNUPLOT2 } from "./gnuplot2.js";
import { GRAY } from "./gray.js";
import { GREENS } from "./greens.js";
import { GREYS } from "./greys.js";
import { HOT } from "./hot.js";
import { HSV } from "./hsv.js";
import { INFERNO } from "./inferno.js";
import { JET } from "./jet.js";
import { MAGMA } from "./magma.js";
import { NIPY_SPECTRAL } from "./nipy-spectral.js";
import { OCEAN } from "./ocean.js";
import { ORANGES } from "./oranges.js";
import { ORRD } from "./orrd.js";
import { PINK } from "./pink.js";
import { PIYG } from "./piyg.js";
import { PLASMA } from "./plasma.js";
import { PRGN } from "./prgn.js";
import { PRISM } from "./prism.js";
import { PUBU } from "./pubu.js";
import { PUBUGN } from "./pubugn.js";
import { PUOR } from "./puor.js";
import { PURD } from "./purd.js";
import { PURPLES } from "./purples.js";
import { RAINBOW } from "./rainbow.js";
import { RDBU } from "./rdbu.js";
import { RDGY } from "./rdgy.js";
import { RDPU } from "./rdpu.js";
import { RDYLBU } from "./rdylbu.js";
import { RDYLGN } from "./rdylgn.js";
import { REDS } from "./reds.js";
import { SEISMIC } from "./seismic.js";
import { SPECTRAL } from "./spectral.js";
import { SPRING } from "./spring.js";
import { SUMMER } from "./summer.js";
import { TERRAIN } from "./terrain.js";
import { TURBO } from "./turbo.js";
import { TWILIGHT } from "./twilight.js";
import { TWILIGHT_SHIFTED } from "./twilight-shifted.js";
import { VIRIDIS } from "./viridis.js";
import { WINTER } from "./winter.js";
import { WISTIA } from "./wistia.js";
import { YLGN } from "./ylgn.js";
import { YLGNBU } from "./ylgnbu.js";
import { YLORBR } from "./ylorbr.js";
import { YLORRD } from "./ylorrd.js";

export type ColormapData = readonly [number, number, number][];

export type ColormapKind = "sequential" | "diverging" | "cyclic" | "miscellaneous";

export type ColormapEntry = Readonly<{ data: ColormapData; kind: ColormapKind; name: string }>;

export const COLORMAPS: Readonly<Record<string, ColormapEntry>> = Object.freeze({
  "afmhot": { data: AFMHOT, kind: "sequential", name: "afmhot" },
  "autumn": { data: AUTUMN, kind: "sequential", name: "autumn" },
  "binary": { data: BINARY, kind: "sequential", name: "binary" },
  "Blues": { data: BLUES, kind: "sequential", name: "Blues" },
  "bone": { data: BONE, kind: "sequential", name: "bone" },
  "BrBG": { data: BRBG, kind: "diverging", name: "BrBG" },
  "brg": { data: BRG, kind: "sequential", name: "brg" },
  "BuGn": { data: BUGN, kind: "sequential", name: "BuGn" },
  "BuPu": { data: BUPU, kind: "sequential", name: "BuPu" },
  "bwr": { data: BWR, kind: "diverging", name: "bwr" },
  "cividis": { data: CIVIDIS, kind: "sequential", name: "cividis" },
  "CMRmap": { data: CMRMAP, kind: "sequential", name: "CMRmap" },
  "cool": { data: COOL, kind: "sequential", name: "cool" },
  "coolwarm": { data: COOLWARM, kind: "diverging", name: "coolwarm" },
  "copper": { data: COPPER, kind: "sequential", name: "copper" },
  "cubehelix": { data: CUBEHELIX, kind: "sequential", name: "cubehelix" },
  "flag": { data: FLAG, kind: "miscellaneous", name: "flag" },
  "gist_earth": { data: GIST_EARTH, kind: "sequential", name: "gist_earth" },
  "gist_gray": { data: GIST_GRAY, kind: "sequential", name: "gist_gray" },
  "gist_heat": { data: GIST_HEAT, kind: "sequential", name: "gist_heat" },
  "gist_ncar": { data: GIST_NCAR, kind: "sequential", name: "gist_ncar" },
  "gist_rainbow": { data: GIST_RAINBOW, kind: "sequential", name: "gist_rainbow" },
  "gist_stern": { data: GIST_STERN, kind: "sequential", name: "gist_stern" },
  "gist_yarg": { data: GIST_YARG, kind: "miscellaneous", name: "gist_yarg" },
  "GnBu": { data: GNBU, kind: "sequential", name: "GnBu" },
  "gnuplot": { data: GNUPLOT, kind: "sequential", name: "gnuplot" },
  "gnuplot2": { data: GNUPLOT2, kind: "sequential", name: "gnuplot2" },
  "gray": { data: GRAY, kind: "sequential", name: "gray" },
  "Greens": { data: GREENS, kind: "sequential", name: "Greens" },
  "Greys": { data: GREYS, kind: "sequential", name: "Greys" },
  "hot": { data: HOT, kind: "sequential", name: "hot" },
  "hsv": { data: HSV, kind: "sequential", name: "hsv" },
  "inferno": { data: INFERNO, kind: "sequential", name: "inferno" },
  "jet": { data: JET, kind: "sequential", name: "jet" },
  "magma": { data: MAGMA, kind: "sequential", name: "magma" },
  "nipy_spectral": { data: NIPY_SPECTRAL, kind: "sequential", name: "nipy_spectral" },
  "ocean": { data: OCEAN, kind: "sequential", name: "ocean" },
  "Oranges": { data: ORANGES, kind: "sequential", name: "Oranges" },
  "OrRd": { data: ORRD, kind: "sequential", name: "OrRd" },
  "pink": { data: PINK, kind: "sequential", name: "pink" },
  "PiYG": { data: PIYG, kind: "diverging", name: "PiYG" },
  "plasma": { data: PLASMA, kind: "sequential", name: "plasma" },
  "PRGn": { data: PRGN, kind: "diverging", name: "PRGn" },
  "prism": { data: PRISM, kind: "miscellaneous", name: "prism" },
  "PuBu": { data: PUBU, kind: "sequential", name: "PuBu" },
  "PuBuGn": { data: PUBUGN, kind: "sequential", name: "PuBuGn" },
  "PuOr": { data: PUOR, kind: "diverging", name: "PuOr" },
  "PuRd": { data: PURD, kind: "sequential", name: "PuRd" },
  "Purples": { data: PURPLES, kind: "sequential", name: "Purples" },
  "rainbow": { data: RAINBOW, kind: "sequential", name: "rainbow" },
  "RdBu": { data: RDBU, kind: "diverging", name: "RdBu" },
  "RdGy": { data: RDGY, kind: "diverging", name: "RdGy" },
  "RdPu": { data: RDPU, kind: "sequential", name: "RdPu" },
  "RdYlBu": { data: RDYLBU, kind: "diverging", name: "RdYlBu" },
  "RdYlGn": { data: RDYLGN, kind: "diverging", name: "RdYlGn" },
  "Reds": { data: REDS, kind: "sequential", name: "Reds" },
  "seismic": { data: SEISMIC, kind: "diverging", name: "seismic" },
  "Spectral": { data: SPECTRAL, kind: "diverging", name: "Spectral" },
  "spring": { data: SPRING, kind: "sequential", name: "spring" },
  "summer": { data: SUMMER, kind: "sequential", name: "summer" },
  "terrain": { data: TERRAIN, kind: "sequential", name: "terrain" },
  "turbo": { data: TURBO, kind: "sequential", name: "turbo" },
  "twilight": { data: TWILIGHT, kind: "cyclic", name: "twilight" },
  "twilight_shifted": { data: TWILIGHT_SHIFTED, kind: "cyclic", name: "twilight_shifted" },
  "viridis": { data: VIRIDIS, kind: "sequential", name: "viridis" },
  "winter": { data: WINTER, kind: "sequential", name: "winter" },
  "Wistia": { data: WISTIA, kind: "sequential", name: "Wistia" },
  "YlGn": { data: YLGN, kind: "sequential", name: "YlGn" },
  "YlGnBu": { data: YLGNBU, kind: "sequential", name: "YlGnBu" },
  "YlOrBr": { data: YLORBR, kind: "sequential", name: "YlOrBr" },
  "YlOrRd": { data: YLORRD, kind: "sequential", name: "YlOrRd" },
});

function reverseData(data: ColormapData): ColormapData {
  return [...data].reverse();
}

export const COLORMAPS_WITH_REVERSED: Readonly<Record<string, ColormapEntry>> = Object.freeze({
  ...COLORMAPS,
  ...Object.fromEntries(
    Object.entries(COLORMAPS).map(([k, v]) => [
      `${k}_r`,
      { data: reverseData(v.data), kind: v.kind, name: `${k}_r` },
    ]),
  ),
});

function toAnsi256(r: number, g: number, b: number): number {
  return 16 + 36 * Math.round(r / 255 * 5) + 6 * Math.round(g / 255 * 5) + Math.round(b / 255 * 5);
}

export const COLORMAPS_256: Readonly<Record<string, readonly number[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(COLORMAPS_WITH_REVERSED).map(([k, v]) => [
      k,
      v.data.map(([r, g, b]) => toAnsi256(r, g, b)),
    ]),
  ),
);

export type ColormapName =
  | "Blues"
  | "Blues_r"
  | "BrBG"
  | "BrBG_r"
  | "BuGn"
  | "BuGn_r"
  | "BuPu"
  | "BuPu_r"
  | "CMRmap"
  | "CMRmap_r"
  | "GnBu"
  | "GnBu_r"
  | "Greens"
  | "Greens_r"
  | "Greys"
  | "Greys_r"
  | "OrRd"
  | "OrRd_r"
  | "Oranges"
  | "Oranges_r"
  | "PRGn"
  | "PRGn_r"
  | "PiYG"
  | "PiYG_r"
  | "PuBu"
  | "PuBuGn"
  | "PuBuGn_r"
  | "PuBu_r"
  | "PuOr"
  | "PuOr_r"
  | "PuRd"
  | "PuRd_r"
  | "Purples"
  | "Purples_r"
  | "RdBu"
  | "RdBu_r"
  | "RdGy"
  | "RdGy_r"
  | "RdPu"
  | "RdPu_r"
  | "RdYlBu"
  | "RdYlBu_r"
  | "RdYlGn"
  | "RdYlGn_r"
  | "Reds"
  | "Reds_r"
  | "Spectral"
  | "Spectral_r"
  | "Wistia"
  | "Wistia_r"
  | "YlGn"
  | "YlGnBu"
  | "YlGnBu_r"
  | "YlGn_r"
  | "YlOrBr"
  | "YlOrBr_r"
  | "YlOrRd"
  | "YlOrRd_r"
  | "afmhot"
  | "afmhot_r"
  | "autumn"
  | "autumn_r"
  | "binary"
  | "binary_r"
  | "bone"
  | "bone_r"
  | "brg"
  | "brg_r"
  | "bwr"
  | "bwr_r"
  | "cividis"
  | "cividis_r"
  | "cool"
  | "cool_r"
  | "coolwarm"
  | "coolwarm_r"
  | "copper"
  | "copper_r"
  | "cubehelix"
  | "cubehelix_r"
  | "flag"
  | "flag_r"
  | "gist_earth"
  | "gist_earth_r"
  | "gist_gray"
  | "gist_gray_r"
  | "gist_heat"
  | "gist_heat_r"
  | "gist_ncar"
  | "gist_ncar_r"
  | "gist_rainbow"
  | "gist_rainbow_r"
  | "gist_stern"
  | "gist_stern_r"
  | "gist_yarg"
  | "gist_yarg_r"
  | "gnuplot"
  | "gnuplot2"
  | "gnuplot2_r"
  | "gnuplot_r"
  | "gray"
  | "gray_r"
  | "hot"
  | "hot_r"
  | "hsv"
  | "hsv_r"
  | "inferno"
  | "inferno_r"
  | "jet"
  | "jet_r"
  | "magma"
  | "magma_r"
  | "nipy_spectral"
  | "nipy_spectral_r"
  | "ocean"
  | "ocean_r"
  | "pink"
  | "pink_r"
  | "plasma"
  | "plasma_r"
  | "prism"
  | "prism_r"
  | "rainbow"
  | "rainbow_r"
  | "seismic"
  | "seismic_r"
  | "spring"
  | "spring_r"
  | "summer"
  | "summer_r"
  | "terrain"
  | "terrain_r"
  | "turbo"
  | "turbo_r"
  | "twilight"
  | "twilight_r"
  | "twilight_shifted"
  | "twilight_shifted_r"
  | "viridis"
  | "viridis_r"
  | "winter"
  | "winter_r";

export const COLORMAP_MEMBERS = {
  "Blues": true,
  "Blues_r": true,
  "BrBG": true,
  "BrBG_r": true,
  "BuGn": true,
  "BuGn_r": true,
  "BuPu": true,
  "BuPu_r": true,
  "CMRmap": true,
  "CMRmap_r": true,
  "GnBu": true,
  "GnBu_r": true,
  "Greens": true,
  "Greens_r": true,
  "Greys": true,
  "Greys_r": true,
  "OrRd": true,
  "OrRd_r": true,
  "Oranges": true,
  "Oranges_r": true,
  "PRGn": true,
  "PRGn_r": true,
  "PiYG": true,
  "PiYG_r": true,
  "PuBu": true,
  "PuBuGn": true,
  "PuBuGn_r": true,
  "PuBu_r": true,
  "PuOr": true,
  "PuOr_r": true,
  "PuRd": true,
  "PuRd_r": true,
  "Purples": true,
  "Purples_r": true,
  "RdBu": true,
  "RdBu_r": true,
  "RdGy": true,
  "RdGy_r": true,
  "RdPu": true,
  "RdPu_r": true,
  "RdYlBu": true,
  "RdYlBu_r": true,
  "RdYlGn": true,
  "RdYlGn_r": true,
  "Reds": true,
  "Reds_r": true,
  "Spectral": true,
  "Spectral_r": true,
  "Wistia": true,
  "Wistia_r": true,
  "YlGn": true,
  "YlGnBu": true,
  "YlGnBu_r": true,
  "YlGn_r": true,
  "YlOrBr": true,
  "YlOrBr_r": true,
  "YlOrRd": true,
  "YlOrRd_r": true,
  "afmhot": true,
  "afmhot_r": true,
  "autumn": true,
  "autumn_r": true,
  "binary": true,
  "binary_r": true,
  "bone": true,
  "bone_r": true,
  "brg": true,
  "brg_r": true,
  "bwr": true,
  "bwr_r": true,
  "cividis": true,
  "cividis_r": true,
  "cool": true,
  "cool_r": true,
  "coolwarm": true,
  "coolwarm_r": true,
  "copper": true,
  "copper_r": true,
  "cubehelix": true,
  "cubehelix_r": true,
  "flag": true,
  "flag_r": true,
  "gist_earth": true,
  "gist_earth_r": true,
  "gist_gray": true,
  "gist_gray_r": true,
  "gist_heat": true,
  "gist_heat_r": true,
  "gist_ncar": true,
  "gist_ncar_r": true,
  "gist_rainbow": true,
  "gist_rainbow_r": true,
  "gist_stern": true,
  "gist_stern_r": true,
  "gist_yarg": true,
  "gist_yarg_r": true,
  "gnuplot": true,
  "gnuplot2": true,
  "gnuplot2_r": true,
  "gnuplot_r": true,
  "gray": true,
  "gray_r": true,
  "hot": true,
  "hot_r": true,
  "hsv": true,
  "hsv_r": true,
  "inferno": true,
  "inferno_r": true,
  "jet": true,
  "jet_r": true,
  "magma": true,
  "magma_r": true,
  "nipy_spectral": true,
  "nipy_spectral_r": true,
  "ocean": true,
  "ocean_r": true,
  "pink": true,
  "pink_r": true,
  "plasma": true,
  "plasma_r": true,
  "prism": true,
  "prism_r": true,
  "rainbow": true,
  "rainbow_r": true,
  "seismic": true,
  "seismic_r": true,
  "spring": true,
  "spring_r": true,
  "summer": true,
  "summer_r": true,
  "terrain": true,
  "terrain_r": true,
  "turbo": true,
  "turbo_r": true,
  "twilight": true,
  "twilight_r": true,
  "twilight_shifted": true,
  "twilight_shifted_r": true,
  "viridis": true,
  "viridis_r": true,
  "winter": true,
  "winter_r": true,
} satisfies Record<ColormapName, true>;

export const COLORMAP_NAMES: readonly ColormapName[] = Object.freeze(
  Object.keys(COLORMAP_MEMBERS) as ColormapName[],
);
