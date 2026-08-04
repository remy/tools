/**
 * The drink is mirrored into the URL hash so a configuration can be pasted to
 * someone else. Amounts are stored exactly as typed, in whatever units the
 * author was using — `u` records which, so the link opens looking the same.
 *
 *   #u=abv-ml&b=40,50&m=150&m=30@16&d=25
 *    u  strength unit and volume unit
 *    b  base spirit: strength,amount
 *    m  one per mixer: amount, or amount@strength when it contains alcohol
 *    d  dilution percentage, omitted when there is none
 */

/** Values come from number inputs, but never trust them into a URL unchecked. */
function clean(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? String(Number(parsed.toFixed(4))) : '';
}

export function encode(state) {
  const bits = [
    `u=${state.strengthUnit}-${state.volumeUnit}`,
    `b=${clean(state.base.strength)},${clean(state.base.amount)}`,
  ];

  for (const mixer of state.mixers) {
    bits.push(`m=${clean(mixer.amount)}${mixer.boozy ? `@${clean(mixer.strength)}` : ''}`);
  }

  const dilution = clean(state.dilution);
  if (dilution && dilution !== '0') bits.push(`d=${dilution}`);

  return bits.join('&');
}

/** @returns the shared state, or null when the hash holds no drink. */
export function decode(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('b') && !params.has('m')) return null;

  const [strengthUnit, volumeUnit] = (params.get('u') ?? '').split('-');
  const [strength = '', amount = ''] = (params.get('b') ?? '').split(',');

  return {
    strengthUnit,
    volumeUnit,
    base: { strength, amount },
    mixers: params.getAll('m').map((entry) => {
      const [mixerAmount = '', mixerStrength] = entry.split('@');
      return {
        amount: mixerAmount,
        strength: mixerStrength ?? '',
        boozy: mixerStrength !== undefined,
      };
    }),
    dilution: params.get('d') ?? '0',
  };
}
