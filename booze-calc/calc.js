/**
 * Pure drink maths. Everything in here works in millilitres and ABV percent —
 * unit conversion for display happens at the edges (units.js).
 */

/** Volume of pure ethanol in one UK alcohol unit. */
export const UK_UNIT_ML = 10;

/** Volume of pure ethanol in one US standard drink (0.6 US fl oz). */
export const US_DRINK_ML = 17.744;

/**
 * Combine a base spirit with any number of mixers.
 *
 * Volumes are treated as additive. Ethanol and water actually contract slightly
 * when mixed, so a real hydrometer would read a touch higher — the difference is
 * well under a proof point at drink strengths and every bar calculator ignores it.
 *
 * @param {{name: string, abv: number, ml: number}} base
 * @param {Array<{name: string, abv: number, ml: number}>} mixers
 * @param {number} dilutionPct extra water as a percentage of the pre-dilution volume
 */
export function calculate(base, mixers, dilutionPct = 0) {
  const parts = [base, ...mixers]
    .filter((part) => part.ml > 0)
    .map((part) => ({
      name: part.name,
      ml: part.ml,
      abv: part.abv,
      alcoholMl: part.ml * (part.abv / 100),
    }));

  const preDilutionMl = parts.reduce((sum, part) => sum + part.ml, 0);
  const waterMl = preDilutionMl * (dilutionPct / 100);

  if (waterMl > 0) {
    parts.push({ name: 'Ice melt / dilution', ml: waterMl, abv: 0, alcoholMl: 0 });
  }

  const totalMl = preDilutionMl + waterMl;
  const alcoholMl = parts.reduce((sum, part) => sum + part.alcoholMl, 0);
  const abv = totalMl > 0 ? (alcoholMl / totalMl) * 100 : 0;

  return {
    parts: parts.map((part) => ({
      ...part,
      share: alcoholMl > 0 ? part.alcoholMl / alcoholMl : 0,
    })),
    totalMl,
    alcoholMl,
    abv,
    proof: abvToProof(abv),
    ukUnits: alcoholMl / UK_UNIT_ML,
    usDrinks: alcoholMl / US_DRINK_ML,
    /** How far the base spirit has been knocked down, 0–1. */
    strengthOfBase: base.abv > 0 ? abv / base.abv : 0,
    /** Parts of everything-else per 1 part base spirit. */
    mixerRatio: base.ml > 0 ? (totalMl - base.ml) / base.ml : 0,
  };
}

/** US proof is exactly twice ABV. */
export function abvToProof(abv) {
  return abv * 2;
}

export function proofToAbv(proof) {
  return proof / 2;
}
