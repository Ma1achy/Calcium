// Okabe & Ito (2008) with one substitution, and the substitution is the whole
// of the difference. Seven of the eight are canonical; `#3cbf9a` stands in for
// black, and that single swap takes the set's worst separation from **7.9 to
// 1.5** — it sits beside skyBlue under tritanopia. So *colourblind-safe*, which
// this line used to say without qualification, is a property of the set it names
// and not of the array below. C10 I39 and §4j; the row is T2.38a, and it is the
// only variant where cause and effect are separable (F1017).
export const OKABE_ITO: readonly [number, number, number][] = [
  [230, 159, 0],
  [86, 180, 233],
  [0, 158, 115],
  [240, 228, 66],
  [0, 114, 178],
  [213, 94, 0],
  [204, 121, 167],
  [60, 191, 154],
];
